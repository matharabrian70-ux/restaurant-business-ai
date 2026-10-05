import { Transport } from "./transport.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND"
]);

function collectNetworkErrorCodes(error, seen = new Set()) {
  if (!error || (typeof error !== "object" && typeof error !== "function") || seen.has(error)) {
    return [];
  }

  seen.add(error);

  const codes = [];
  if (typeof error.code === "string") codes.push(error.code);

  if (error.cause) {
    codes.push(...collectNetworkErrorCodes(error.cause, seen));
  }

  if (Array.isArray(error.errors)) {
    for (const nestedError of error.errors) {
      codes.push(...collectNetworkErrorCodes(nestedError, seen));
    }
  }

  return codes;
}

function isRetryableNetworkError(error) {
  return collectNetworkErrorCodes(error).some((code) => RETRYABLE_NETWORK_CODES.has(code));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResendTransport extends Transport {
  constructor({
    apiKey,
    from,
    replyTo,
    fetchImpl = globalThis.fetch,
    apiBase = "https://api.resend.com",
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    sleepImpl = sleep
  } = {}) {
    super("resend");
    if (!apiKey) throw new Error("RESEND_API_KEY is required");
    if (!from) throw new Error("RESEND_FROM is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
      throw new Error("retryDelayMs must be a non-negative number");
    }
    if (typeof sleepImpl !== "function") throw new Error("sleep implementation is required");

    this.apiKey = apiKey;
    this.from = from;
    this.replyTo = replyTo || from;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, "");
    this.provider = "resend";
    this.maxAttempts = maxAttempts;
    this.retryDelayMs = retryDelayMs;
    this.sleepImpl = sleepImpl;
  }

  async send({ recipient, subject, body, html, attachments, leadId, outreachId, idempotencyKey, replyTo }) {
    if (!recipient || !body) throw new Error("recipient and body are required");

    const headers = {
      "Authorization": "Bearer " + this.apiKey,
      "Content-Type": "application/json"
    };
    if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);

    const payload = {
      from: this.from,
      to: [recipient],
      subject: subject || "",
      text: body,
      ...(html ? { html } : {}),
      ...(replyTo || this.replyTo ? { reply_to: replyTo || this.replyTo } : {}),
      ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
      headers: {
        "X-Lead-ID": String(leadId || ""),
        "X-Outreach-ID": String(outreachId || "")
      }
    };

    const request = {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    };

    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(this.apiBase + "/emails", request);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = data?.message || data?.error || ("Resend request failed with HTTP " + response.status);
          throw new Error(message);
        }

        return { status: "sent", provider: "resend", messageId: data.id };
      } catch (error) {
        lastError = error;

        // Retry only connection-level failures. HTTP/API errors are surfaced immediately.
        if (!isRetryableNetworkError(error) || attempt >= this.maxAttempts) {
          throw error;
        }

        await this.sleepImpl(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }
}

import { Transport } from "./transport.js";

export class ResendTransport extends Transport {
  constructor({ apiKey, from, fetchImpl = globalThis.fetch, apiBase = "https://api.resend.com" } = {}) {
    super();
    if (!apiKey) throw new Error("RESEND_API_KEY is required");
    if (!from) throw new Error("RESEND_FROM is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImpl = fetchImpl;
    this.apiBase = apiBase.replace(/\/$/, "");
    this.provider = "resend";
  }

  async send({ recipient, subject, body, leadId, outreachId }) {
    if (!recipient || !body) throw new Error("recipient and body are required");
    const response = await this.fetchImpl(this.apiBase + "/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to: [recipient],
        subject: subject || "",
        text: body,
        headers: { "X-Lead-ID": String(leadId || ""), "X-Outreach-ID": String(outreachId || "") }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.message || data?.error || ("Resend request failed with HTTP " + response.status);
      throw new Error(message);
    }
    return { status: "sent", provider: "resend", messageId: data.id };
  }
}

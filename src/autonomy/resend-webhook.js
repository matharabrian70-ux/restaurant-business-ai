import { createHmac, timingSafeEqual } from "node:crypto";

function decodeSecret(secret) {
  const raw = String(secret || "").trim();
  if (!raw.startsWith("whsec_")) throw new Error("Invalid Resend webhook secret");
  return Buffer.from(raw.slice(6), "base64");
}

export function verifyResendWebhook({ payload, id, timestamp, signature, secret, now = Date.now() }) {
  if (!payload || !id || !timestamp || !signature || !secret) {
    throw new Error("Incomplete webhook signature");
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > 5 * 60 * 1000) {
    throw new Error("Webhook timestamp outside allowed window");
  }

  const signed = id + "." + timestamp + "." + payload;
  const expected = createHmac("sha256", decodeSecret(secret))
    .update(signed)
    .digest("base64");

  const valid = String(signature)
    .split(" ")
    .map((part) => part.replace(/^v1,/, ""))
    .filter(Boolean)
    .some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });

  if (!valid) throw new Error("Invalid webhook signature");
  return true;
}

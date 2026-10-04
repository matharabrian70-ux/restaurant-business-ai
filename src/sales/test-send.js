import { createHash } from "node:crypto";

const TEST_SUBJECT = "Restaurant Business AI — Resend test";
const TEST_BODY = [
  "This is a controlled communication test from Restaurant Business AI.",
  "",
  "If you received this message, the Render runtime can reach Resend and Resend accepted the email request.",
  "",
  "No restaurant prospect outreach is involved in this test."
].join("\n");

export function validateControlledTestConfig(env = process.env) {
  const errors = [];
  if (env.SALES_TEST_MODE !== "true") errors.push("SALES_TEST_MODE must be true");
  if (env.SALES_PROVIDER_ENABLED !== "true") errors.push("SALES_PROVIDER_ENABLED must be true for the controlled test");
  if (!env.SALES_TEST_RECIPIENT) errors.push("SALES_TEST_RECIPIENT is required");
  if (!env.SALES_TEST_TOKEN) errors.push("SALES_TEST_TOKEN is required");
  return { ok: errors.length === 0, errors };
}

export function buildControlledTestIdempotencyKey(env = process.env) {
  const payloadIdentity = JSON.stringify({
    from: String(env.RESEND_FROM || ""),
    to: String(env.SALES_TEST_RECIPIENT || ""),
    subject: TEST_SUBJECT,
    text: TEST_BODY,
    leadId: "CONTROLLED-TEST",
    outreachId: "restaurant-business-ai-resend-test"
  });

  const digest = createHash("sha256")
    .update(payloadIdentity)
    .digest("hex");

  return "controlled-test/resend/" + digest;
}

export async function sendControlledTestEmail({ env = process.env, transport }) {
  const validation = validateControlledTestConfig(env);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  if (!transport?.send) throw new Error("Transport is required");

  const testId = "restaurant-business-ai-resend-test";
  const idempotencyKey = buildControlledTestIdempotencyKey(env);

  const result = await transport.send({
    id: testId,
    leadId: "CONTROLLED-TEST",
    outreachId: testId,
    channel: "email",
    recipient: env.SALES_TEST_RECIPIENT,
    subject: TEST_SUBJECT,
    body: TEST_BODY,
    idempotencyKey
  });

  return {
    status: "sent",
    test: true,
    recipient: env.SALES_TEST_RECIPIENT,
    subject: TEST_SUBJECT,
    result
  };
}

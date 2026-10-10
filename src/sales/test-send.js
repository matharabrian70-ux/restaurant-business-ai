import { createHash } from "node:crypto";
import { createOutreachDraft } from "./outreach.js";

const TEST_RESTAURANT = "Pili Restaurant";

function buildControlledTestContent(env = process.env) {
  // Keep this diagnostic message deliberately simple: no sales pitch, external
  // links, HTML template, or ZIP attachment. This isolates sender/provider
  // delivery from content and attachment filtering by recipient mail servers.
  const recipient = String(env.SALES_TEST_RECIPIENT || "").trim();
  return {
    id: "CONTROLLED-TEST",
    leadId: "CONTROLLED-TEST",
    channel: "email",
    subject: "Mathara Digital - controlled email delivery test",
    body: [
      "Hello,",
      "",
      "This is a controlled email delivery test for Mathara Digital.",
      "It contains no marketing offer, links, or attachments.",
      "",
      "If you received this message, please confirm receipt in the test chat.",
      "",
      "Regards,",
      "Mathara Digital"
    ].join("\\n"),
    html: "<!doctype html><html><body><p>Hello,</p><p>This is a controlled email delivery test for Mathara Digital.</p><p>It contains no marketing offer, links, or attachments.</p><p>If you received this message, please confirm receipt in the test chat.</p><p>Regards,<br>Mathara Digital</p></body></html>",
    attachments: [],
    recipient
  };
}

export function validateControlledTestConfig(env = process.env) {
  const errors = [];
  if (env.SALES_TEST_MODE !== "true") errors.push("SALES_TEST_MODE must be true");
  if (env.SALES_PROVIDER_ENABLED !== "true") errors.push("SALES_PROVIDER_ENABLED must be true for the controlled test");
  if (!env.SALES_TEST_RECIPIENT) errors.push("SALES_TEST_RECIPIENT is required");
  if (!env.SALES_TEST_TOKEN) errors.push("SALES_TEST_TOKEN is required");
  return { ok: errors.length === 0, errors };
}

export function buildControlledTestIdempotencyKey(env = process.env) {
  const draft = buildControlledTestContent(env);
  const payloadIdentity = JSON.stringify({
    from: String(env.RESEND_FROM || ""),
    to: String(env.SALES_TEST_RECIPIENT || ""),
    subject: draft.subject,
    text: draft.body,
    html: draft.html,
    attachments: draft.attachments,
    leadId: "CONTROLLED-TEST",
    outreachId: draft.id
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

  const draft = buildControlledTestContent(env);
  const idempotencyKey = buildControlledTestIdempotencyKey(env);

  const result = await transport.send({
    id: draft.id,
    leadId: draft.leadId,
    outreachId: draft.id,
    channel: "email",
    recipient: env.SALES_TEST_RECIPIENT,
    subject: draft.subject,
    body: draft.body,
    html: draft.html,
    attachments: draft.attachments,
    idempotencyKey
  });

  return {
    status: "sent",
    test: true,
    recipient: env.SALES_TEST_RECIPIENT,
    subject: draft.subject,
    attachment: draft.attachments?.[0] ?? null,
    result
  };
}

import { createHash } from "node:crypto";
import { createOutreachDraft } from "./outreach.js";

const TEST_RESTAURANT = "Pili Restaurant";

function buildControlledTestContent(env = process.env) {
  const lead = {
    id: "CONTROLLED-TEST",
    name: TEST_RESTAURANT,
    email: env.SALES_TEST_RECIPIENT
  };

  const draft = createOutreachDraft({
    lead,
    research: {
      name: TEST_RESTAURANT,
      notes: [
        "This controlled test uses the same professional outreach template that production drafts use."
      ],
      hasOnlineOrdering: false,
      deliveryAvailable: true,
      multipleBranches: false,
      researchedAt: new Date().toISOString()
    },
    channel: "email"
  });

  return draft;
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

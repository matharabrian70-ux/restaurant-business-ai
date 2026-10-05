import { markOutreachSent } from "./outreach.js";

export function validateSend({ draft, recipient, policy = {} }) {
  if (!draft?.id || draft.status !== "approved") {
    throw new Error("Approved draft required");
  }
  if (!recipient?.address) throw new Error("Recipient is required");
  if (policy.blocked) throw new Error("Outbound policy blocked this send");
  if (typeof draft.body !== "string" || !draft.body.trim()) {
    throw new Error("Message body is required");
  }
  if (draft.body.length > 5000) throw new Error("Message is too long");
  return true;
}

export async function sendApproved({ draft, recipient, policy, transport, replyTo }) {
  validateSend({ draft, recipient, policy });
  if (!transport?.send) throw new Error("Transport is required");

  const result = await transport.send({
    id: draft.id,
    leadId: draft.leadId,
    channel: draft.channel,
    subject: draft.subject || "",
    body: draft.body,
    recipient: recipient.address,
    replyTo,
    idempotencyKey: draft.id
  });

  const sent = markOutreachSent(draft, result);
  return {
    draft: sent,
    record: {
      outreachId: sent.id,
      leadId: sent.leadId,
      channel: sent.channel,
      recipient: recipient.address,
      transport: transport.name,
      result,
      sentAt: new Date().toISOString()
    }
  };
}

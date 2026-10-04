import { sendApproved } from "./send.js";

export async function sendThroughControlPlane({
  controlPlane,
  draft,
  recipient,
  policy,
  transport,
  actor = "agent"
}) {
  if (!controlPlane?.isOutreachApproved) {
    throw new Error("Sales control plane is required");
  }
  if (!draft?.id || !draft?.leadId) {
    throw new Error("Draft with leadId is required");
  }
  if (draft.status !== "approved") {
    throw new Error("Draft must be marked approved before sending");
  }
  if (!controlPlane.isOutreachApproved(draft.leadId, draft.id)) {
    throw new Error("Sales control plane approval is required before sending");
  }

  const result = await sendApproved({ draft, recipient, policy, transport });

  controlPlane.transitionLead(
    draft.leadId,
    {
      type: "outreach_sent",
      draftId: draft.id
    },
    {
      actor,
      metadata: {
        outreachId: result.record.outreachId,
        provider: result.record.transport
      }
    }
  );

  return result;
}

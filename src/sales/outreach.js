const CHANNELS = Object.freeze(["email", "whatsapp", "sms", "manual"]);

export function createOutreachDraft({ lead, research, channel = "email" }) {
  if (!lead?.id) throw new Error("Lead is required");
  if (!CHANNELS.includes(channel)) throw new Error("Unsupported outreach channel");

  const restaurantName = research?.name ?? lead.name;
  const draft = [
    `Hi ${restaurantName},`,
    "",
    "I work with restaurants to improve their online ordering and delivery experience.",
    "I noticed your business and would like to show you what a branded ordering system could look like for your restaurant.",
    "",
    "If you're open to it, I can share a short demo.",
    "",
    "Regards"
  ].join("\\n");

  return {
    id: `OUT-${lead.id}-${channel}`,
    leadId: lead.id,
    channel,
    status: "draft",
    body: draft,
    createdAt: new Date().toISOString(),
    requiresHumanApproval: true
  };
}

export function approveOutreach(draft, approver = "human") {
  if (!draft?.id) throw new Error("Outreach draft is required");
  if (approver !== "human") throw new Error("Only a human can approve outreach in Step 5");
  return { ...draft, status: "approved", approvedBy: approver, approvedAt: new Date().toISOString() };
}

export function markOutreachSent(draft, sendResult = {}) {
  if (draft?.status !== "approved") throw new Error("Outreach must be human-approved before sending");
  return { ...draft, status: "sent", sentAt: new Date().toISOString(), sendResult };
}

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
    "I built a live restaurant website prototype so you can see the experience:",
    "https://matharabrian70-ux.github.io/Restaurant-Website-Prototype/",
    "",
    "If you're open to it, I can show you how we would adapt it to your restaurant.",
    "",
    "If you'd rather not receive messages from me, just reply with STOP.",
    "",
    "Regards"
  ].join("\\n");

  return {
    id: `OUT-${lead.id}-${channel}`,
    leadId: lead.id,
    channel,
    subject: `A quick idea for ${restaurantName}`,
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

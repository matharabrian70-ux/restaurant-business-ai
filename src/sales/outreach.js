const CHANNELS = Object.freeze(["email", "whatsapp", "sms", "manual"]);

const PROTOTYPE_URL =
  "https://matharabrian70-ux.github.io/Restaurant-Website-Prototype/";

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function researchSignals(research = {}) {
  const notes = Array.isArray(research.notes)
    ? research.notes.filter(Boolean).map(String)
    : [];

  const hasOrdering = research.hasOnlineOrdering === true;
  const hasDelivery = research.deliveryAvailable === true;
  const multipleBranches = research.multipleBranches === true;

  let angle = "direct-ordering";
  if (hasOrdering && hasDelivery) angle = "optimization";
  else if (hasOrdering) angle = "owned-channel";
  else if (!hasOrdering && hasDelivery) angle = "direct-sales";
  else if (!hasOrdering) angle = "digital-ordering";

  return {
    notes,
    hasOrdering,
    hasDelivery,
    multipleBranches,
    angle
  };
}

function buildEmail({ restaurantName, research = {} }) {
  const signals = researchSignals(research);
  const firstNote = clean(signals.notes[0]);
  const secondNote = clean(signals.notes[1]);

  const opening = firstNote
    ? `I took a look at ${restaurantName} before reaching out. ${firstNote}`
    : `I took a look at ${restaurantName} before reaching out and wanted to share a practical idea rather than send you a generic sales email.`;

  const solutionByAngle = {
    optimization:
      "Because you already have an online ordering/delivery path, I would not suggest replacing something that works. The opportunity is to make the direct channel feel more like a complete restaurant operating system: branded ordering, clearer delivery handling, customer order tracking, promotions, and a manager dashboard that gives your team better control.",
    "owned-channel":
      "If customers are already being directed to order digitally, the next step is to turn that into a stronger owned channel: a branded ordering experience that sits under your restaurant's identity, captures the order cleanly, and gives management better visibility instead of leaving the customer journey fragmented across separate tools.",
    "direct-sales":
      "The system I build is designed to turn a restaurant website into a direct sales channel. Customers can browse the menu, place an order, receive order updates, and follow delivery, while the restaurant team gets a manager dashboard for orders, menu changes, promotions and delivery operations.",
    "digital-ordering":
      "The main opportunity I see is giving customers a simple way to discover the menu and order directly from the restaurant. The system combines a branded customer menu with checkout, order management, delivery operations, tracking, promotions and reporting."
  };

  const branchLine = signals.multipleBranches
    ? "For a restaurant with multiple locations, the same platform can also give management a branch-by-branch view while keeping the customer experience consistent."
    : "The same platform can be structured around your current operation first and expanded later if you add branches.";

  const proof = secondNote
    ? `Another detail I noticed: ${secondNote}`
    : "";

  return [
    `Hello ${restaurantName} team,`,
    "",
    opening,
    "",
    solutionByAngle[signals.angle],
    "",
    branchLine,
    "",
    proof,
    proof ? "" : null,
    "I have put together a working restaurant prototype so you can see the kind of customer experience I mean rather than having to imagine it from a sales description:",
    PROTOTYPE_URL,
    "",
    "The important part is that this is not just a restaurant website. The goal is to give the restaurant an owned digital ordering and operations layer that can be branded around your business and adapted to how your team actually works.",
    "",
    "If this looks relevant, I would be happy to show you the system and discuss what I would change specifically for your restaurant. There is no obligation to proceed.",
    "",
    "If you are not the person who handles this, I would appreciate it if you could point me to the manager or person responsible for digital operations.",
    "",
    "If you would rather not receive messages from me, just reply STOP and I will not follow up.",
    "",
    "Regards,",
    "Brian Mathara",
    "Mathara Digital"
  ].filter((line) => line !== null).join("\\n");
}

function buildSubject(restaurantName, research = {}) {
  const { angle } = researchSignals(research);
  const subjects = {
    optimization: `An idea for improving ${restaurantName}'s direct ordering`,
    "owned-channel": `A stronger direct ordering channel for ${restaurantName}`,
    "direct-sales": `A direct ordering idea for ${restaurantName}`,
    "digital-ordering": `A digital ordering idea for ${restaurantName}`
  };
  return subjects[angle] ?? `A quick idea for ${restaurantName}`;
}

export function createOutreachDraft({ lead, research = {}, channel = "email" }) {
  if (!lead?.id) throw new Error("Lead is required");
  if (!CHANNELS.includes(channel)) throw new Error("Unsupported outreach channel");

  const restaurantName = clean(research.name) || clean(lead.name) || "your restaurant";
  const body = buildEmail({ restaurantName, research });

  return {
    id: `OUT-${lead.id}-${channel}`,
    leadId: lead.id,
    channel,
    subject: buildSubject(restaurantName, research),
    status: "draft",
    body,
    createdAt: new Date().toISOString(),
    requiresHumanApproval: true,
    personalization: {
      strategy: researchSignals(research).angle,
      researched: Boolean(research.researchedAt || research.notes?.length || research.website)
    }
  };
}

export function approveOutreach(draft, approver = "human") {
  if (!draft?.id) throw new Error("Outreach draft is required");
  if (approver !== "human") throw new Error("Only a human can approve outreach");
  return {
    ...draft,
    status: "approved",
    approvedBy: approver,
    approvedAt: new Date().toISOString()
  };
}

export function markOutreachSent(draft, sendResult = {}) {
  if (draft?.status !== "approved") throw new Error("Outreach must be human-approved before sending");
  return {
    ...draft,
    status: "sent",
    sentAt: new Date().toISOString(),
    sendResult
  };
}

const POSITIVE = [
  /interested/i,
  /tell me more/i,
  /more information/i,
  /send (?:me )?(?:a )?demo/i,
  /book (?:a )?(?:call|demo)/i,
  /schedule/i,
  /let'?s talk/i,
  /how much/i,
  /pricing/i,
  /cost/i,
  /yes,? (?:please|i'?m interested)/i
];

const NEGATIVE = [
  /stop/i,
  /unsubscribe/i,
  /remove me/i,
  /not interested/i,
  /do not contact/i
];

export function classifyReply({ subject = "", body = "" } = {}) {
  const text = `${subject}\n${body}`.trim();

  if (NEGATIVE.some((pattern) => pattern.test(text))) {
    return { classification: "negative", handoff: false, buyingSignals: [] };
  }

  const buyingSignals = POSITIVE
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);

  if (buyingSignals.length) {
    return {
      classification: "positive",
      handoff: true,
      buyingSignals
    };
  }

  return { classification: "neutral", handoff: false, buyingSignals: [] };
}

export function createHandoff({ lead, reply, classification, now = new Date().toISOString() }) {
  return {
    type: "human_handoff",
    priority: classification.classification === "positive" ? "hot" : "normal",
    leadId: lead.lead_id ?? lead.leadId,
    restaurant: lead.name,
    email: lead.email,
    website: lead.website,
    subject: reply.subject ?? "",
    reply: reply.body ?? "",
    buyingSignals: classification.buyingSignals,
    handoffAt: now
  };
}

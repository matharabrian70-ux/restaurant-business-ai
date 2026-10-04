export const AGENTS = Object.freeze({
  SUPERVISOR: "supervisor",
  PROSPECTING: "prospecting",
  RESEARCH: "research",
  OUTREACH: "outreach",
  QUALIFICATION: "qualification"
});

export const LEAD_STAGES = Object.freeze({
  NEW: "new",
  RESEARCHING: "researching",
  READY_FOR_OUTREACH: "ready_for_outreach",
  CONTACTED: "contacted",
  ENGAGED: "engaged",
  QUALIFIED: "qualified",
  HUMAN_HANDOFF: "human_handoff",
  CLOSED_WON: "closed_won",
  CLOSED_LOST: "closed_lost"
});

export const PRIORITIES = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  CRITICAL: "critical"
});

export function createLead(input) {
  if (!input?.id || !input?.name) throw new Error("Lead id and name are required");

  return {
    id: input.id,
    name: input.name,
    contact: input.contact ?? null,
    source: input.source ?? "unknown",
    website: input.website ?? null,
    notes: input.notes ?? [],
    stage: LEAD_STAGES.NEW,
    priority: input.priority ?? PRIORITIES.NORMAL,
    owner: null,
    nextAction: "research",
    handoffReason: null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

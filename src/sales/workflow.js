import { AGENTS, LEAD_STAGES } from "../core/types.js";

export function advanceLead(lead, event) {
  if (!lead?.id) throw new Error("Lead is required");
  if (!event?.type) throw new Error("Event type is required");

  const next = { ...lead, updatedAt: new Date().toISOString() };

  switch (event.type) {
    case "researched":
      next.stage = LEAD_STAGES.READY_FOR_OUTREACH;
      next.nextAction = "outreach";
      return next;
    case "outreach_sent":
      next.stage = LEAD_STAGES.CONTACTED;
      next.nextAction = "wait_for_response";
      return next;
    case "positive_response":
      next.stage = LEAD_STAGES.ENGAGED;
      next.nextAction = "qualify";
      return next;
    case "qualified":
      next.stage = LEAD_STAGES.HUMAN_HANDOFF;
      next.owner = "human";
      next.nextAction = "human_close";
      next.handoffReason = event.reason ?? "Restaurant expressed genuine purchase interest.";
      return next;
    case "human_closed_won":
      if (lead.stage !== LEAD_STAGES.HUMAN_HANDOFF) {
        throw new Error("Only a handed-off lead can be marked closed won.");
      }
      next.stage = LEAD_STAGES.CLOSED_WON;
      next.nextAction = "service_onboarding";
      return next;
    case "human_closed_lost":
      if (lead.stage !== LEAD_STAGES.HUMAN_HANDOFF) {
        throw new Error("Only a handed-off lead can be marked closed lost.");
      }
      next.stage = LEAD_STAGES.CLOSED_LOST;
      next.nextAction = "none";
      return next;
    default:
      throw new Error("Unsupported sales event: " + event.type);
  }
}

export function requiredNextAgent(stage) {
  switch (stage) {
    case LEAD_STAGES.NEW: return AGENTS.RESEARCH;
    case LEAD_STAGES.READY_FOR_OUTREACH: return AGENTS.OUTREACH;
    case LEAD_STAGES.CONTACTED: return AGENTS.OUTREACH;
    case LEAD_STAGES.ENGAGED: return AGENTS.QUALIFICATION;
    case LEAD_STAGES.HUMAN_HANDOFF:
    case LEAD_STAGES.CLOSED_WON:
    case LEAD_STAGES.CLOSED_LOST:
      return null;
    default:
      return AGENTS.SUPERVISOR;
  }
}

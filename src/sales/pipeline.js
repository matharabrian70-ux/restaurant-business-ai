import { advanceLead } from "./workflow.js";
import { createOutreachDraft } from "./outreach.js";
import { qualificationDecision } from "./qualification.js";

export function prepareOutreach(lead, research, channel = "email") {
  if (lead.stage !== "ready_for_outreach") {
    throw new Error("Lead is not ready for outreach");
  }
  return createOutreachDraft({ lead, research, channel });
}

export function processResponse(lead, response, buyingSignals = []) {
  const decision = qualificationDecision({ response, buyingSignals });

  if (decision.action === "human_handoff") {
    return {
      lead: advanceLead(lead, {
        type: "qualified",
        reason: "Positive response with buying signals."
      }),
      decision
    };
  }

  return { lead, decision };
}

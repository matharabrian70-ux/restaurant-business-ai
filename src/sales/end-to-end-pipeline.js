import { discoverProspects } from "./discovery.js";
import { researchLead } from "./research-engine.js";
import { createOutreachDraft, approveOutreach } from "./outreach.js";
import { processResponse } from "./pipeline.js";
import { sendThroughControlPlane } from "./control-plane-send.js";
import { evaluateOutbound } from "./deliverability.js";
import { LEAD_STAGES } from "../core/types.js";
import { authorizePilotSend, evaluatePilot, recordPilotSend } from "./pilot.js";
import { createDirectMarketingPolicy, validateDirectMarketingEligibility } from "./direct-marketing-policy.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class EndToEndSalesPipeline {
  constructor({
    controlPlane,
    transport,
    suppressionStore,
    pilot = null,
    clock = () => new Date().toISOString()
  } = {}) {
    if (!controlPlane) throw new Error("controlPlane is required");
    if (!suppressionStore) throw new Error("suppressionStore is required");
    this.controlPlane = controlPlane;
    this.transport = transport;
    this.suppressionStore = suppressionStore;
    this.pilot = pilot;
    this.clock = clock;
    this.researchByLead = new Map();
    this.drafts = new Map();
  }

  discover(records, options = {}) {
    return discoverProspects(records, options);
  }

  addProspect(record, researchData = {}) {
    const discovered = this.discover([record]);
    if (discovered.prospects.length !== 1) {
      throw new Error("Prospect could not be accepted");
    }

    const prospect = discovered.prospects[0];
    const researchResult = researchLead(prospect, researchData);

    const lead = this.controlPlane.addLead({
      id: prospect.id,
      name: prospect.name,
      contact: prospect.contact,
      source: prospect.source,
      website: prospect.website,
      priority: researchResult.scoring.priority
    });

    this.researchByLead.set(lead.id, researchResult);
    const researched = this.controlPlane.transitionLead(
      lead.id,
      { type: "researched" },
      {
        actor: "agent",
        metadata: {
          score: researchResult.scoring.score,
          priority: researchResult.scoring.priority,
          completeness: researchResult.completeness
        }
      }
    );

    return {
      lead: researched,
      research: clone(researchResult)
    };
  }

  prepareOutreach(leadId, channel = "email") {
    const lead = this.controlPlane.getLead(leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.stage !== LEAD_STAGES.READY_FOR_OUTREACH) {
      throw new Error("Lead is not ready for outreach");
    }

    const researchResult = this.researchByLead.get(leadId);
    if (!researchResult) throw new Error("Research is required before outreach");

    const draft = createOutreachDraft({
      lead,
      research: researchResult.research,
      channel
    });

    this.drafts.set(draft.id, draft);
    const approval = this.controlPlane.requestOutreachApproval(
      leadId,
      draft.id,
      { actor: "agent" }
    );

    return {
      draft: clone(draft),
      approval
    };
  }

  approveOutreach(draftId, { reason = "Approved by human operator" } = {}) {
    const draft = this.requireDraft(draftId);
    const approval = this.controlPlane.decideOutreachApproval(
      draftId,
      true,
      { actor: "human", reason }
    );
    const approvedDraft = approveOutreach(draft, "human");
    this.drafts.set(draftId, approvedDraft);

    return {
      draft: clone(approvedDraft),
      approval
    };
  }

  authorizeAutonomousOutreach(draftId, { reason = "Autonomous policy authorization" } = {}) {
    const draft = this.requireDraft(draftId);
    if (draft.status !== "draft") {
      throw new Error("Only a draft outreach can be autonomously authorized");
    }

    const approval = this.controlPlane.authorizeAutonomousOutreach(
      draftId,
      { actor: "agent", reason }
    );

    const approvedDraft = {
      ...draft,
      status: "approved",
      approvedBy: "autonomous_policy",
      approvedAt: this.clock(),
      requiresHumanApproval: false
    };

    this.drafts.set(draftId, approvedDraft);

    return {
      draft: clone(approvedDraft),
      approval
    };
  }

  rejectOutreach(draftId, { reason = "Rejected by human operator" } = {}) {
    const draft = this.requireDraft(draftId);
    const approval = this.controlPlane.decideOutreachApproval(
      draftId,
      false,
      { actor: "human", reason }
    );
    const rejectedDraft = { ...draft, status: "rejected", rejectedBy: "human", rejectedAt: this.clock() };
    this.drafts.set(draftId, rejectedDraft);

    return {
      draft: clone(rejectedDraft),
      approval
    };
  }

  async sendApprovedOutreach({
    draftId,
    recipientAddress,
    sender,
    policy,
    consent,
    consentEvidence,
    directMarketingPolicy = createDirectMarketingPolicy()
  } = {}) {
    const draft = this.requireDraft(draftId);
    const recipient = { address: recipientAddress };

    if (!this.controlPlane.isOutreachApproved(draft.leadId, draft.id)) {
      throw new Error("Sales control plane approval is required before sending");
    }

    if (this.pilot) {
      authorizePilotSend(this.pilot, { recipient: recipientAddress });
    }

    evaluateOutbound({
      recipient,
      channel: draft.channel,
      suppressionStore: this.suppressionStore,
      sender,
      policy,
      consent
    });

    const directMarketing = validateDirectMarketingEligibility({
      recipient,
      consent,
      consentEvidence,
      sender,
      messageBody: draft.body,
      policy: directMarketingPolicy
    });

    if (!directMarketing.eligible) {
      throw new Error("Direct marketing eligibility failed: " + directMarketing.errors.join("; "));
    }

    let result;
    try {
      result = await sendThroughControlPlane({
        controlPlane: this.controlPlane,
        draft,
        recipient,
        policy,
        transport: this.transport,
        replyTo: sender.replyTo,
        actor: "agent"
      });
    } catch (error) {
      if (this.pilot) {
        recordPilotSend(this.pilot, { recipient: recipientAddress, success: false });
        const evaluation = evaluatePilot(this.pilot);
        if (!evaluation.safeToContinue) {
          this.pilot.status = "paused";
          this.pilot.lastEvaluation = { at: this.clock(), ...evaluation };
        }
      }
      throw error;
    }

    if (this.pilot) {
      recordPilotSend(this.pilot, { recipient: recipientAddress, success: true });
      const evaluation = evaluatePilot(this.pilot);
      if (!evaluation.safeToContinue) {
        this.pilot.status = "paused";
        this.pilot.lastEvaluation = { at: this.clock(), ...evaluation };
      }
    }

    const sentDraft = result.draft;
    this.drafts.set(draftId, sentDraft);

    return clone(result);
  }

  recordResponse(leadId, response, buyingSignals = []) {
    const lead = this.controlPlane.getLead(leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.stage !== LEAD_STAGES.CONTACTED) {
      throw new Error("Lead must have contacted stage before recording a response");
    }

    const result = processResponse(lead, response, buyingSignals);

    if (result.decision.classification !== "positive") {
      return {
        lead,
        decision: result.decision
      };
    }

    let nextLead = this.controlPlane.transitionLead(
      leadId,
      { type: "positive_response" },
      { actor: "agent", metadata: { classification: result.decision.classification } }
    );

    if (result.decision.action === "human_handoff") {
      nextLead = this.controlPlane.transitionLead(
        leadId,
        { type: "qualified", reason: "Positive response with buying signals." },
        {
          actor: "agent",
          metadata: {
            qualification: result.decision
          }
        }
      );
    }

    return {
      lead: nextLead,
      decision: result.decision
    };
  }

  closeWon(leadId, { metadata = {} } = {}) {
    const lead = this.controlPlane.getLead(leadId);
    if (!lead || lead.stage !== LEAD_STAGES.HUMAN_HANDOFF) {
      throw new Error("Only a human handoff lead can be closed won");
    }
    return this.controlPlane.transitionLead(
      leadId,
      { type: "human_closed_won" },
      { actor: "human", metadata }
    );
  }

  closeLost(leadId, { reason = "Closed by human operator" } = {}) {
    const lead = this.controlPlane.getLead(leadId);
    if (!lead || lead.stage !== LEAD_STAGES.HUMAN_HANDOFF) {
      throw new Error("Only a human handoff lead can be closed lost");
    }
    return this.controlPlane.transitionLead(
      leadId,
      { type: "human_closed_lost" },
      { actor: "human", metadata: { reason } }
    );
  }

  getLeadState(leadId) {
    const lead = this.controlPlane.getLead(leadId);
    if (!lead) return null;
    return {
      lead,
      research: clone(this.researchByLead.get(leadId) ?? null),
      drafts: [...this.drafts.values()]
        .filter((draft) => draft.leadId === leadId)
        .map(clone),
      approvals: this.controlPlane.listApprovals({ leadId }),
      audit: this.controlPlane.getAuditLog(leadId)
    };
  }

  requireDraft(draftId) {
    const draft = this.drafts.get(draftId);
    if (!draft) throw new Error("Outreach draft not found");
    return draft;
  }
}

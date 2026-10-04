import { LEAD_STAGES, PRIORITIES, createLead } from "../core/types.js";
import { advanceLead } from "./workflow.js";
import { AUDIT_ACTORS, appendAudit, auditForLead, createAuditEvent } from "./audit.js";

const TRANSITIONS = Object.freeze({
  [LEAD_STAGES.NEW]: new Set([LEAD_STAGES.READY_FOR_OUTREACH]),
  [LEAD_STAGES.READY_FOR_OUTREACH]: new Set([LEAD_STAGES.CONTACTED]),
  [LEAD_STAGES.CONTACTED]: new Set([LEAD_STAGES.ENGAGED]),
  [LEAD_STAGES.ENGAGED]: new Set([LEAD_STAGES.HUMAN_HANDOFF]),
  [LEAD_STAGES.HUMAN_HANDOFF]: new Set([LEAD_STAGES.CLOSED_WON, LEAD_STAGES.CLOSED_LOST]),
  [LEAD_STAGES.CLOSED_WON]: new Set(),
  [LEAD_STAGES.CLOSED_LOST]: new Set()
});

const PRIORITY_ORDER = Object.freeze({
  [PRIORITIES.CRITICAL]: 0,
  [PRIORITIES.HIGH]: 1,
  [PRIORITIES.NORMAL]: 2,
  [PRIORITIES.LOW]: 3
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compareQueue(a, b) {
  const priority = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
  if (priority !== 0) return priority;
  return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
}

export function canTransition(fromStage, toStage) {
  return TRANSITIONS[fromStage]?.has(toStage) ?? false;
}

export class SalesControlPlane {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    this.clock = clock;
    this.leads = new Map();
    this.auditLog = [];
    this.approvals = new Map();
  }

  addLead(input, { actor = AUDIT_ACTORS.SYSTEM } = {}) {
    const lead = createLead({
      ...input,
      createdAt: input.createdAt ?? this.clock(),
      updatedAt: input.updatedAt ?? this.clock()
    });
    if (this.leads.has(lead.id)) throw new Error("Lead already exists");

    this.leads.set(lead.id, lead);
    this.auditLog = appendAudit(this.auditLog, createAuditEvent({
      leadId: lead.id,
      actor,
      action: "lead_created",
      toStage: lead.stage,
      timestamp: this.clock()
    }));
    return clone(lead);
  }

  getLead(leadId) {
    const lead = this.leads.get(leadId);
    return lead ? clone(lead) : null;
  }

  listQueue({ stages, limit = 50 } = {}) {
    const allowedStages = stages ? new Set(stages) : null;
    return [...this.leads.values()]
      .filter((lead) => !allowedStages || allowedStages.has(lead.stage))
      .sort(compareQueue)
      .slice(0, limit)
      .map(clone);
  }

  transitionLead(leadId, event, { actor = AUDIT_ACTORS.AGENT, metadata = {} } = {}) {
    const lead = this.leads.get(leadId);
    if (!lead) throw new Error("Lead not found");

    const nextStage = this.nextStageForEvent(event?.type);
    if (!nextStage) throw new Error("Unsupported sales event: " + event?.type);
    if (!canTransition(lead.stage, nextStage)) {
      throw new Error("Invalid lead transition: " + lead.stage + " -> " + nextStage);
    }

    if (event.type === "outreach_sent") {
      const approval = this.approvals.get(event.draftId);
      if (!event.draftId) throw new Error("draftId is required to record outreach");
      if (!approval || approval.leadId !== leadId) {
        throw new Error("Outreach approval is required for this lead");
      }
      if (approval.status !== "approved") {
        throw new Error("Outreach must be human-approved before it can be recorded as sent");
      }
    }

    const next = advanceLead(lead, event);
    this.leads.set(leadId, next);
    this.auditLog = appendAudit(this.auditLog, createAuditEvent({
      leadId,
      actor,
      action: event.type,
      fromStage: lead.stage,
      toStage: next.stage,
      metadata,
      timestamp: this.clock()
    }));
    return clone(next);
  }

  requestOutreachApproval(leadId, draftId, { actor = AUDIT_ACTORS.AGENT } = {}) {
    const lead = this.requireLead(leadId);
    if (lead.stage !== LEAD_STAGES.READY_FOR_OUTREACH) {
      throw new Error("Only ready leads can request outreach approval");
    }
    if (!draftId) throw new Error("draftId is required");

    const existing = this.approvals.get(draftId);
    if (existing) throw new Error("Approval request already exists for this draft");

    const approval = {
      draftId,
      leadId,
      status: "pending",
      requestedAt: this.clock(),
      decidedAt: null,
      decidedBy: null
    };
    this.approvals.set(draftId, approval);
    this.auditLog = appendAudit(this.auditLog, createAuditEvent({
      leadId,
      actor,
      action: "outreach_approval_requested",
      fromStage: lead.stage,
      toStage: lead.stage,
      metadata: { draftId },
      timestamp: this.clock()
    }));
    return clone(approval);
  }

  authorizeAutonomousOutreach(draftId, { actor = AUDIT_ACTORS.AGENT, reason = "Autonomous policy authorization" } = {}) {
    const approval = this.approvals.get(draftId);
    if (!approval) throw new Error("Approval request not found");
    if (approval.status !== "pending") throw new Error("Approval request already decided");
    if (actor !== AUDIT_ACTORS.AGENT) throw new Error("Autonomous authorization requires the agent actor");

    const next = {
      ...approval,
      status: "approved",
      mode: "autonomous_policy",
      requestedAt: approval.requestedAt,
      decidedAt: this.clock(),
      decidedBy: actor,
      reason
    };

    this.approvals.set(draftId, next);
    this.auditLog = appendAudit(this.auditLog, createAuditEvent({
      leadId: approval.leadId,
      actor,
      action: "outreach_autonomously_approved",
      metadata: { draftId, mode: "autonomous_policy", reason },
      timestamp: this.clock()
    }));

    return clone(next);
  }

  decideOutreachApproval(draftId, approved, { actor = AUDIT_ACTORS.HUMAN, reason = "" } = {}) {
    if (actor !== AUDIT_ACTORS.HUMAN) throw new Error("Outreach approval requires a human actor");
    const approval = this.approvals.get(draftId);
    if (!approval) throw new Error("Approval request not found");
    if (approval.status !== "pending") throw new Error("Approval request already decided");

    const next = {
      ...approval,
      status: approved ? "approved" : "rejected",
      decidedAt: this.clock(),
      decidedBy: actor,
      reason
    };
    this.approvals.set(draftId, next);
    this.auditLog = appendAudit(this.auditLog, createAuditEvent({
      leadId: approval.leadId,
      actor,
      action: approved ? "outreach_approved" : "outreach_rejected",
      metadata: { draftId, reason },
      timestamp: this.clock()
    }));
    return clone(next);
  }

  getApproval(draftId) {
    const approval = this.approvals.get(draftId);
    return approval ? clone(approval) : null;
  }

  listApprovals({ leadId } = {}) {
  return [...this.approvals.values()]
    .filter(
      approval =>
        !leadId ||
        approval.leadId === leadId
    )
    .sort((a, b) => {
      return new Date(a.requestedAt).getTime() -
        new Date(b.requestedAt).getTime();
    })
    .map(clone);
}
  isOutreachApproved(leadId, draftId) {
    const approval = this.approvals.get(draftId);
    return Boolean(approval && approval.leadId === leadId && approval.status === "approved");
  }
  
  getAuditLog(leadId) {
    return auditForLead(this.auditLog, leadId);
  }

  
  nextStageForEvent(type) {
    switch (type) {
      case "researched": return LEAD_STAGES.READY_FOR_OUTREACH;
      case "outreach_sent": return LEAD_STAGES.CONTACTED;
      case "positive_response": return LEAD_STAGES.ENGAGED;
      case "qualified": return LEAD_STAGES.HUMAN_HANDOFF;
      case "human_closed_won": return LEAD_STAGES.CLOSED_WON;
      case "human_closed_lost": return LEAD_STAGES.CLOSED_LOST;
      default: return null;
    }
  }

  requireLead(leadId) {
    const lead = this.leads.get(leadId);
    if (!lead) throw new Error("Lead not found");
    return lead;
  }
}

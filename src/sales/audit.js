export const AUDIT_ACTORS = Object.freeze({
  AGENT: "agent",
  HUMAN: "human",
  SYSTEM: "system"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createAuditEvent({
  leadId,
  actor,
  action,
  fromStage = null,
  toStage = null,
  metadata = {},
  timestamp = new Date().toISOString()
}) {
  if (!leadId) throw new Error("leadId is required");
  if (!Object.values(AUDIT_ACTORS).includes(actor)) {
    throw new Error("Unsupported audit actor");
  }
  if (!action) throw new Error("Audit action is required");

  return Object.freeze({
    id: "audit_" + leadId + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    leadId,
    actor,
    action,
    fromStage,
    toStage,
    metadata: clone(metadata),
    timestamp
  });
}

export function appendAudit(log, event) {
  if (!Array.isArray(log)) throw new Error("Audit log must be an array");
  return [...log, event];
}

export function auditForLead(log, leadId) {
  return log.filter((event) => event.leadId === leadId).map(clone);
}

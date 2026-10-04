import { AGENTS, LEAD_STAGES, PRIORITIES } from "../core/types.js";

export function inspectSystem({ agents = [], leads = [], tasks = [] }) {
  const alerts = [];

  const agentNames = new Set(agents.map((agent) => agent.name));
  for (const required of [
    AGENTS.PROSPECTING,
    AGENTS.RESEARCH,
    AGENTS.OUTREACH,
    AGENTS.QUALIFICATION
  ]) {
    if (!agentNames.has(required)) {
      alerts.push({
        severity: PRIORITIES.HIGH,
        code: "AGENT_MISSING",
        subject: required,
        message: "Required agent '" + required + "' is not registered."
      });
    }
  }

  for (const agent of agents) {
    if (agent.status === "error") {
      alerts.push({
        severity: PRIORITIES.CRITICAL,
        code: "AGENT_ERROR",
        subject: agent.name,
        message: agent.error ?? "Agent reported an error."
      });
    }
  }

  for (const lead of leads) {
    if (lead.stage === LEAD_STAGES.HUMAN_HANDOFF && !lead.owner) {
      alerts.push({
        severity: PRIORITIES.HIGH,
        code: "HANDOFF_UNOWNED",
        subject: lead.id,
        message: "Qualified lead is waiting for human ownership."
      });
    }
  }

  for (const task of tasks) {
    if (task.status === "failed") {
      alerts.push({
        severity: PRIORITIES.HIGH,
        code: "TASK_FAILED",
        subject: task.id,
        message: task.error ?? "Task failed."
      });
    }
  }

  return {
    healthy: !alerts.some((alert) =>
      [PRIORITIES.CRITICAL, PRIORITIES.HIGH].includes(alert.severity)
    ),
    alerts
  };
}

export function createSupervisorEvent({ code, agent, subject, message, severity = PRIORITIES.NORMAL }) {
  return {
    timestamp: new Date().toISOString(),
    code,
    agent,
    subject,
    message,
    severity
  };
}

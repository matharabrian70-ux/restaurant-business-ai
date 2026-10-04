import test from "node:test";
import assert from "node:assert/strict";
import { createLead, LEAD_STAGES } from "../src/core/types.js";
import { advanceLead, requiredNextAgent } from "../src/sales/workflow.js";
import { inspectSystem } from "../src/supervisor/supervisor.js";

test("qualified interest stops automation at human handoff", () => {
  let lead = createLead({ id: "L-1", name: "Example Restaurant" });
  lead = advanceLead(lead, { type: "researched" });
  lead = advanceLead(lead, { type: "outreach_sent" });
  lead = advanceLead(lead, { type: "positive_response" });
  lead = advanceLead(lead, { type: "qualified" });

  assert.equal(lead.stage, LEAD_STAGES.HUMAN_HANDOFF);
  assert.equal(lead.owner, "human");
  assert.equal(lead.nextAction, "human_close");
  assert.equal(requiredNextAgent(lead.stage), null);
});

test("supervisor detects a failed agent", () => {
  const result = inspectSystem({
    agents: [
      { name: "prospecting", status: "ready" },
      { name: "research", status: "ready" },
      { name: "outreach", status: "error", error: "Provider unavailable" },
      { name: "qualification", status: "ready" }
    ]
  });
  assert.equal(result.healthy, false);
  assert.ok(result.alerts.some((a) => a.code === "AGENT_ERROR"));
});

test("supervisor detects an unowned human handoff", () => {
  const result = inspectSystem({
    agents: [
      { name: "prospecting", status: "ready" },
      { name: "research", status: "ready" },
      { name: "outreach", status: "ready" },
      { name: "qualification", status: "ready" }
    ],
    leads: [{ id: "L-2", stage: LEAD_STAGES.HUMAN_HANDOFF, owner: null }]
  });
  assert.equal(result.healthy, false);
  assert.ok(result.alerts.some((a) => a.code === "HANDOFF_UNOWNED"));
});

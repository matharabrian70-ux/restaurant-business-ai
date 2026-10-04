import test from "node:test";
import assert from "node:assert/strict";
import { LEAD_STAGES, PRIORITIES } from "../src/core/types.js";
import { AUDIT_ACTORS } from "../src/sales/audit.js";
import { SalesControlPlane, canTransition } from "../src/sales/control-plane.js";

let second = 0;
const clock = () => new Date(Date.UTC(2026, 9, 4, 10, 0, second++)).toISOString();

function lead(id, priority = PRIORITIES.NORMAL) {
  return { id, name: id, priority };
}

test("control plane queues leads by priority then age", () => {
  const cp = new SalesControlPlane({ clock });
  cp.addLead(lead("normal"), { actor: AUDIT_ACTORS.SYSTEM });
  cp.addLead(lead("high", PRIORITIES.HIGH), { actor: AUDIT_ACTORS.SYSTEM });
  assert.deepEqual(cp.listQueue().map((item) => item.id), ["high", "normal"]);
});

test("valid stage transitions are accepted and audited", () => {
  const cp = new SalesControlPlane({ clock });
  cp.addLead(lead("r1"));
  const updated = cp.transitionLead("r1", { type: "researched" }, { actor: AUDIT_ACTORS.AGENT });

  assert.equal(updated.stage, LEAD_STAGES.READY_FOR_OUTREACH);
  assert.equal(cp.getAuditLog("r1").length, 2);
  assert.equal(cp.getAuditLog("r1")[1].action, "researched");
  assert.equal(cp.getAuditLog("r1")[1].actor, AUDIT_ACTORS.AGENT);
});

test("invalid stage transitions are blocked", () => {
  const cp = new SalesControlPlane({ clock });
  cp.addLead(lead("r2"));
  assert.throws(
    () => cp.transitionLead("r2", { type: "outreach_sent" }),
    /Invalid lead transition/
  );
  assert.equal(cp.getLead("r2").stage, LEAD_STAGES.NEW);
  assert.equal(cp.getAuditLog("r2").length, 1);
});

test("outreach approval can only be decided by a human", () => {
  const cp = new SalesControlPlane({ clock });
  cp.addLead(lead("r3"));
  cp.transitionLead("r3", { type: "researched" });
  cp.requestOutreachApproval("r3", "draft-r3");
  assert.throws(
    () => cp.decideOutreachApproval("draft-r3", true, { actor: AUDIT_ACTORS.AGENT }),
    /requires a human/
  );

  const decision = cp.decideOutreachApproval("draft-r3", true);
  assert.equal(decision.status, "approved");
  assert.equal(cp.getAuditLog("r3").at(-1).action, "outreach_approved");
});

test("approval decisions are single-use", () => {
  const cp = new SalesControlPlane({ clock });
  cp.addLead(lead("r4"));
  cp.transitionLead("r4", { type: "researched" });
  cp.requestOutreachApproval("r4", "draft-r4");
  cp.decideOutreachApproval("draft-r4", false);
  assert.throws(
    () => cp.decideOutreachApproval("draft-r4", true),
    /already decided/
  );
});

test("transition matrix exposes only allowed workflow edges", () => {
  assert.equal(canTransition(LEAD_STAGES.NEW, LEAD_STAGES.READY_FOR_OUTREACH), true);
  assert.equal(canTransition(LEAD_STAGES.NEW, LEAD_STAGES.CONTACTED), false);
  assert.equal(canTransition(LEAD_STAGES.HUMAN_HANDOFF, LEAD_STAGES.CLOSED_WON), true);
  assert.equal(canTransition(LEAD_STAGES.CLOSED_WON, LEAD_STAGES.CONTACTED), false);
});

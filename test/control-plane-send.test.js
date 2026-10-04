import test from "node:test";
import assert from "node:assert/strict";
import { LEAD_STAGES } from "../src/core/types.js";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { sendThroughControlPlane } from "../src/sales/control-plane-send.js";

function makeControlPlane() {
  let tick = 0;
  return new SalesControlPlane({
    clock: () => new Date(Date.UTC(2026, 9, 4, 12, 0, tick++)).toISOString()
  });
}

function approvedDraft(leadId) {
  return {
    id: "OUT-" + leadId + "-email",
    leadId,
    channel: "email",
    status: "approved",
    body: "Controlled test message",
    requiresHumanApproval: true
  };
}

function transport() {
  return {
    name: "test-transport",
    async send() {
      return { status: "sent", provider: "test", messageId: "msg-1" };
    }
  };
}

test("direct outreach_sent transition is blocked without control-plane approval", () => {
  const cp = makeControlPlane();
  cp.addLead({ id: "gate-1", name: "Gate Restaurant" });
  cp.transitionLead("gate-1", { type: "researched" });

  assert.throws(
    () => cp.transitionLead("gate-1", {
      type: "outreach_sent",
      draftId: "OUT-gate-1-email"
    }),
    /approval is required/
  );
  assert.equal(cp.getLead("gate-1").stage, LEAD_STAGES.READY_FOR_OUTREACH);
});

test("control-plane send requires a human-approved draft", async () => {
  const cp = makeControlPlane();
  cp.addLead({ id: "gate-2", name: "Gate Restaurant" });
  cp.transitionLead("gate-2", { type: "researched" });

  const draft = approvedDraft("gate-2");
  cp.requestOutreachApproval("gate-2", draft.id);

  await assert.rejects(
    () => sendThroughControlPlane({
      controlPlane: cp,
      draft,
      recipient: { address: "owner@example.com" },
      transport: transport()
    }),
    /control plane approval is required/
  );
});

test("approved control-plane send records outreach and advances the lead", async () => {
  const cp = makeControlPlane();
  cp.addLead({ id: "gate-3", name: "Gate Restaurant" });
  cp.transitionLead("gate-3", { type: "researched" });

  const draft = approvedDraft("gate-3");
  cp.requestOutreachApproval("gate-3", draft.id);
  cp.decideOutreachApproval(draft.id, true);

  const result = await sendThroughControlPlane({
    controlPlane: cp,
    draft,
    recipient: { address: "owner@example.com" },
    transport: transport()
  });

  assert.equal(result.record.result.messageId, "msg-1");
  assert.equal(cp.getLead("gate-3").stage, LEAD_STAGES.CONTACTED);

  const audit = cp.getAuditLog("gate-3");
  assert.equal(audit.at(-1).action, "outreach_sent");
  assert.equal(audit.at(-1).metadata.outreachId, draft.id);
});

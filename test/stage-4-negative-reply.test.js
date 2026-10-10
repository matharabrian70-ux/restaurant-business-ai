import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { EndToEndSalesPipeline } from "../src/sales/end-to-end-pipeline.js";
import { createSuppressionStore } from "../src/sales/compliance.js";
import { classifyResponse, qualificationDecision } from "../src/sales/qualification.js";

test("negative reply after mock delivery is classified and never handed off", async () => {
  const controlPlane = new SalesControlPlane();
  const sent = [];
  const pipeline = new EndToEndSalesPipeline({
    controlPlane,
    suppressionStore: createSuppressionStore(),
    transport: { name: "stage-4-mock", async send(message) { sent.push(message); return { status: "sent", provider: "mock", messageId: "negative-fixture-1" }; } }
  });
  const added = pipeline.addProspect({
    id: "STAGE4-NEGATIVE-001", name: "Synthetic Cafe", businessType: "restaurant",
    location: "Nairobi, Kenya", website: "https://synthetic.example.test",
    email: "owner@synthetic.example.test", source: "test_fixture", consentState: "allowed",
    consentEvidence: { source: "synthetic test fixture", at: "2026-10-10T00:00:00.000Z" }
  }, { name: "Synthetic Cafe", location: "Nairobi, Kenya", website: "https://synthetic.example.test", email: "owner@synthetic.example.test", notes: [] });
  const prepared = pipeline.prepareOutreach(added.lead.id, "email");
  const approved = pipeline.approveOutreach(prepared.draft.id);
  await pipeline.sendApprovedOutreach({
    draftId: approved.draft.id, recipientAddress: "owner@synthetic.example.test",
    sender: { address: "test-sender@example.test", replyTo: "test-replies@example.test", verified: true },
    policy: { allowedChannels: ["email"], requireConsent: true, requireUnsubscribeMechanism: true, hasUnsubscribeMechanism: true },
    consent: "allowed", consentEvidence: { source: "synthetic test fixture", at: "2026-10-10T00:00:00.000Z" }
  });
  assert.equal(sent.length, 1);
  const reply = "No thanks, we are not interested.";
  assert.equal(classifyResponse(reply).classification, "negative");
  const decision = qualificationDecision({ response: reply, buyingSignals: [] });
  assert.equal(decision.action, "close_lost");
  assert.equal(decision.qualified, false);
  const response = pipeline.recordResponse(added.lead.id, reply, []);
  assert.equal(response.decision.classification, "negative");
  assert.equal(response.decision.action, "close_lost");
  assert.equal(response.lead.stage, "contacted");
  assert.equal(sent.length, 1, "negative response must not trigger another send");
  assert.ok(sent.every((message) => message.recipient.endsWith(".example.test")));
});

test("ambiguous reply is routed for review, not treated as positive", () => {
  const decision = qualificationDecision({ response: "Maybe later, send details next month.", buyingSignals: [] });
  assert.equal(decision.classification, "needs_review");
  assert.equal(decision.action, "human_review");
  assert.equal(decision.qualified, false);
});
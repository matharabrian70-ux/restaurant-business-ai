import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { EndToEndSalesPipeline } from "../src/sales/end-to-end-pipeline.js";
import { createSuppressionStore, recordUnsubscribe, isSuppressed } from "../src/sales/compliance.js";

test("synthetic lead completes discovery-to-mock-send-to-positive-handoff without external email", async () => {
  const cp = new SalesControlPlane();
  const sent = [];
  const transport = {
    name: "in-memory-test-transport",
    async send(message) {
      sent.push(message);
      return { status: "sent", provider: "mock", messageId: "mock-message-001" };
    }
  };
  const pipeline = new EndToEndSalesPipeline({
    controlPlane: cp,
    transport,
    suppressionStore: createSuppressionStore()
  });

  const added = pipeline.addProspect({
    id: "TEST-LEAD-001",
    name: "Fixture Restaurant",
    businessType: "restaurant",
    location: "Nairobi, Kenya",
    website: "https://fixture.example.test",
    email: "owner@fixture.example.test",
    source: "manual",
    sourceUrl: null,
    consentState: "allowed",
    consentEvidence: {
      source: "synthetic test fixture only",
      at: "2026-10-10T00:00:00.000Z"
    }
  }, {
    name: "Fixture Restaurant",
    location: "Nairobi, Kenya",
    website: "https://fixture.example.test",
    email: "owner@fixture.example.test",
    phone: "+254700000000",
    notes: ["Synthetic fixture website used only for automated tests."]
  });

  assert.equal(added.lead.stage, "ready_for_outreach");
  const prepared = pipeline.prepareOutreach(added.lead.id, "email");
  assert.equal(prepared.draft.status, "draft");
  assert.equal(prepared.draft.requiresHumanApproval, true);

  const approved = pipeline.approveOutreach(prepared.draft.id, { reason: "Automated test fixture approval" });
  assert.equal(approved.draft.status, "approved");

  const result = await pipeline.sendApprovedOutreach({
    draftId: approved.draft.id,
    recipientAddress: "owner@fixture.example.test",
    sender: {
      address: "test-sender@example.test",
      replyTo: "test-replies@example.test",
      verified: true
    },
    policy: {
      allowedChannels: ["email"],
      requireConsent: true,
      requireUnsubscribeMechanism: true,
      hasUnsubscribeMechanism: true
    },
    consent: "allowed",
    consentEvidence: {
      source: "synthetic test fixture only",
      at: "2026-10-10T00:00:00.000Z"
    }
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipient, "owner@fixture.example.test");
  assert.equal(result.record.transport, "in-memory-test-transport");
  assert.equal(result.record.result.provider, "mock");
  assert.equal(cp.getLead(added.lead.id).stage, "contacted");

  const replyResult = pipeline.recordResponse(
    added.lead.id,
    "Interested, please send demo and pricing.",
    ["requested_demo", "pricing_question"]
  );
  assert.equal(replyResult.decision.classification, "positive");
  assert.ok(["human_handoff", "qualified"].includes(replyResult.lead.stage));

  // Prove suppression is applied in the same in-memory test environment.
  const suppression = createSuppressionStore();
  recordUnsubscribe(suppression, "owner@fixture.example.test", { source: "synthetic test reply" });
  assert.equal(isSuppressed(suppression, "owner@fixture.example.test"), true);
  assert.equal(sent.every((message) => message.recipient.endsWith(".example.test")), true);
});

test("synthetic unknown-consent lead cannot pass the direct-marketing gate", async () => {
  const cp = new SalesControlPlane();
  const pipeline = new EndToEndSalesPipeline({
    controlPlane: cp,
    transport: { name: "must-not-send", async send() { throw new Error("Transport must not be called"); } },
    suppressionStore: createSuppressionStore()
  });
  const added = pipeline.addProspect({
    id: "TEST-LEAD-002",
    name: "Consent Fixture Cafe",
    businessType: "restaurant",
    location: "Nairobi, Kenya",
    email: "cafe@fixture.example.test",
    source: "manual",
    consentState: "unknown"
  }, { name: "Consent Fixture Cafe", location: "Nairobi, Kenya", email: "cafe@fixture.example.test" });
  const prepared = pipeline.prepareOutreach(added.lead.id, "email");
  const approved = pipeline.approveOutreach(prepared.draft.id);
  await assert.rejects(() => pipeline.sendApprovedOutreach({
    draftId: approved.draft.id,
    recipientAddress: "cafe@fixture.example.test",
    sender: { address: "test@example.test", replyTo: "replies@example.test", verified: true },
    policy: { allowedChannels: ["email"], requireConsent: true, requireUnsubscribeMechanism: true, hasUnsubscribeMechanism: true },
    consent: "unknown",
    consentEvidence: null
  }), /consent/i);
});

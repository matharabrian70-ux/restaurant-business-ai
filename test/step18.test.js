import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { ComplianceStore } from "../src/sales/compliance-store.js";
import { EndToEndSalesPipeline } from "../src/sales/end-to-end-pipeline.js";

function createPipeline() {
  const controlPlane = new SalesControlPlane({
    clock: (() => {
      let i = 0;
      return () => `2026-10-04T00:00:0${i++}Z`;
    })()
  });

  const suppressionStore = new ComplianceStore();
  const sent = [];

  const transport = {
    name: "test-transport",
    send: async (payload) => {
      sent.push(payload);
      return { provider: "test", status: "sent", messageId: "msg-1" };
    }
  };

  return {
    pipeline: new EndToEndSalesPipeline({
      controlPlane,
      suppressionStore: suppressionStore.suppressions,
      transport
    }),
    controlPlane,
    suppressionStore,
    sent
  };
}

const prospect = {
  id: "DISC-E2E-1",
  name: "Example Restaurant",
  location: "Nairobi",
  website: "https://example.restaurant",
  email: "owner@example.restaurant",
  source: "manual"
};

const research = {
  name: "Example Restaurant",
  location: "Nairobi",
  website: "https://example.restaurant",
  email: "owner@example.restaurant",
  phone: "+254700000000",
  hasOnlineOrdering: false,
  deliveryAvailable: false,
  multipleBranches: true,
  socialLinks: ["https://instagram.com/example"],
};

test("end-to-end pipeline reaches human handoff without autonomous sending", async () => {
  const { pipeline, sent } = createPipeline();

  const added = pipeline.addProspect(prospect, {
    ...research,
    signals: {
      restaurantTypeMatch: true,
      localMarketMatch: true,
      activeSocialPresence: true,
      weakOnlineConversion: true,
      deliveryDemand: true,
      contactableDecisionMaker: true
    }
  });

  assert.equal(added.lead.stage, "ready_for_outreach");
  assert.equal(added.lead.priority, "normal");

  const prepared = pipeline.prepareOutreach(added.lead.id);
  assert.equal(prepared.draft.status, "draft");
  assert.equal(prepared.approval.status, "pending");
  assert.equal(sent.length, 0);

  pipeline.approveOutreach(prepared.draft.id);

  const result = await pipeline.sendApprovedOutreach({
    draftId: prepared.draft.id,
    recipientAddress: "owner@example.restaurant",
    sender: {
      address: "hello@matharadigital.dev",
      replyTo: "hello@matharadigital.dev",
      verified: true
    },
    policy: {
      allowedChannels: ["email"],
      requireConsent: false,
      requireUnsubscribeMechanism: true,
      hasUnsubscribeMechanism: true
    },
    consent: "allowed",
    consentEvidence: {
      source: "test fixture: restaurant requested a demo",
      at: "2026-10-04T00:00:00.000Z"
    }
  });

  assert.equal(result.draft.status, "sent");
  assert.equal(sent.length, 1);
  assert.equal(controlPlaneStage(pipeline, added.lead.id), "contacted");

  const response = pipeline.recordResponse(
    added.lead.id,
    "Yes, send me the demo",
    ["requested_demo"]
  );

  assert.equal(response.decision.action, "human_handoff");
  assert.equal(response.lead.stage, "human_handoff");

  const closed = pipeline.closeWon(added.lead.id, {
    metadata: { package: "professional" }
  });

  assert.equal(closed.stage, "closed_won");
});

test("pipeline blocks sending without human approval", async () => {
  const { pipeline } = createPipeline();
  const added = pipeline.addProspect(prospect, research);
  const prepared = pipeline.prepareOutreach(added.lead.id);

  await assert.rejects(
    () => pipeline.sendApprovedOutreach({
      draftId: prepared.draft.id,
      recipientAddress: "owner@example.restaurant",
      sender: { address: "hello@matharadigital.dev", verified: true },
      policy: {
        allowedChannels: ["email"],
        requireUnsubscribeMechanism: false,
        hasUnsubscribeMechanism: true
      }
    }),
    /approved/
  );
});

test("pipeline blocks suppressed recipients before transport", async () => {
  const { pipeline, suppressionStore, sent } = createPipeline();
  suppressionStore.applyProviderEvent({
    type: "bounce",
    address: "owner@example.restaurant"
  });

  const added = pipeline.addProspect(prospect, research);
  const prepared = pipeline.prepareOutreach(added.lead.id);
  pipeline.approveOutreach(prepared.draft.id);

  await assert.rejects(
    () => pipeline.sendApprovedOutreach({
      draftId: prepared.draft.id,
      recipientAddress: "owner@example.restaurant",
      sender: { address: "hello@matharadigital.dev", verified: true },
      policy: {
        allowedChannels: ["email"],
        requireUnsubscribeMechanism: false,
        hasUnsubscribeMechanism: true
      }
    }),
    /suppressed/
  );

  assert.equal(sent.length, 0);
});

test("pipeline cannot close a lead without human handoff", () => {
  const { pipeline } = createPipeline();
  const added = pipeline.addProspect(prospect, research);

  assert.throws(
    () => pipeline.closeWon(added.lead.id),
    /human handoff/
  );
});

function controlPlaneStage(pipeline, leadId) {
  return pipeline.getLeadState(leadId).lead.stage;
}

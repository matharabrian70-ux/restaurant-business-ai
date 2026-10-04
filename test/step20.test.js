import test from "node:test";
import assert from "node:assert/strict";

import { SalesControlPlane } from "../src/sales/control-plane.js";
import { EndToEndSalesPipeline } from "../src/sales/end-to-end-pipeline.js";
import { createSuppressionStore } from "../src/sales/compliance.js";
import { AutonomousSalesRunner } from "../src/sales/autonomous-runner.js";
import { createPilot } from "../src/sales/pilot.js";

function makeTransport() {
  return {
    name: "test",
    async send({ draft, recipient }) {
      return {
        messageId: "msg-test",
        transport: "test",
        recipient,
        draftId: draft.id
      };
    }
  };
}

test("autonomous runner is disabled by default", async () => {
  const pipeline = new EndToEndSalesPipeline({
    controlPlane: new SalesControlPlane(),
    transport: makeTransport(),
    suppressionStore: createSuppressionStore()
  });

  const runner = new AutonomousSalesRunner({
    pipeline,
    sender: { address: "sales@example.com", verified: true },
    enabled: false
  });

  await assert.rejects(
    () => runner.run([]),
    /Autonomous sales mode is disabled/
  );
});

test("autonomous authorization creates a policy approval", async () => {
  const controlPlane = new SalesControlPlane();
  const pipeline = new EndToEndSalesPipeline({
    controlPlane,
    transport: makeTransport(),
    suppressionStore: createSuppressionStore()
  });

  const runner = new AutonomousSalesRunner({
    pipeline,
    pilot: createPilot({ enabled: true, stageSize: 50, dailyLimit: 2 }),
    enabled: true,
    requireConsent: false,
    sender: { address: "sales@example.com", verified: true }
  });

  const result = await runner.run([
    {
      id: "REST-AUTO-1",
      name: "Autonomy Test Restaurant",
      location: "Nairobi",
      source: "manual",
      email: "owner@example.com",
      consentState: "allowed",
      website: "https://example.com"
    }
  ]);

  assert.equal(result.sent, 1, JSON.stringify(result));
  assert.equal(result.failed, 0);
  const approvals = controlPlane.listApprovals();
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].status, "approved");
  assert.equal(approvals[0].mode, "autonomous_policy");
});

test("autonomous runner respects pilot daily limit", async () => {
  const controlPlane = new SalesControlPlane();
  const pipeline = new EndToEndSalesPipeline({
    controlPlane,
    transport: makeTransport(),
    suppressionStore: createSuppressionStore()
  });

  const runner = new AutonomousSalesRunner({
    pipeline,
    pilot: createPilot({ enabled: true, stageSize: 50, dailyLimit: 1 }),
    enabled: true,
    requireConsent: false,
    sender: { address: "sales@example.com", verified: true }
  });

  const result = await runner.run([
    {
      id: "REST-AUTO-2",
      name: "First Restaurant",
      location: "Nairobi",
      source: "manual",
      email: "first@example.com",
      consentState: "allowed"
    },
    {
      id: "REST-AUTO-3",
      name: "Second Restaurant",
      location: "Nairobi",
      source: "manual",
      email: "second@example.com",
      consentState: "allowed"
    }
  ]);

  assert.equal(result.sent, 1, JSON.stringify(result));
  assert.equal(result.failed, 1);
  assert.match(result.items[1].reason, /daily send limit|Pilot/);
});

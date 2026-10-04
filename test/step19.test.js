import test from "node:test";
import assert from "node:assert/strict";
import {
  PILOT_STATUS,
  advancePilotStage,
  authorizePilotSend,
  createPilot,
  evaluatePilot,
  evaluateStage,
  getPilotSummary,
  pausePilot,
  recordPilotSend
} from "../src/sales/pilot.js";

test("pilot starts disabled and is capped at 50 recipients", () => {
  const pilot = createPilot();
  assert.equal(pilot.status, PILOT_STATUS.DISABLED);
  assert.equal(pilot.stageSize, 50);
  assert.equal(pilot.dailyLimit, 10);
  assert.throws(() => authorizePilotSend(pilot, { recipient: "a@example.com" }), /not active/);
});

test("pilot enforces unique recipients and daily limits", () => {
  const pilot = createPilot({ enabled: true, dailyLimit: 2 });
  assert.doesNotThrow(() => authorizePilotSend(pilot, { recipient: "A@example.com", dailySent: 0 }));
  recordPilotSend(pilot, { recipient: "A@example.com" });
  assert.throws(() => authorizePilotSend(pilot, { recipient: "a@example.com", dailySent: 1 }), /already been attempted/);
  recordPilotSend(pilot, { recipient: "b@example.com" });
  assert.throws(() => authorizePilotSend(pilot, { recipient: "c@example.com" }), /daily send limit/);
});

test("pilot automatically reports stop conditions", () => {
  const pilot = createPilot({ enabled: true, limits: { maxProviderFailures: 2 } });
  recordPilotSend(pilot, { recipient: "a@example.com", success: false });
  recordPilotSend(pilot, { recipient: "b@example.com", success: false });
  const result = evaluatePilot(pilot);
  assert.equal(result.safeToContinue, false);
  assert.ok(result.stopReasons.includes("provider_failure_threshold_reached"));
});

test("stage evaluation and advancement require human control", () => {
  const pilot = createPilot({ enabled: true, dailyLimit: 50 });
  for (let i = 0; i < 50; i += 1) {
    const recipient = `lead-${i}@example.com`;
    assert.doesNotThrow(() => authorizePilotSend(pilot, { recipient, dailySent: i % 50 }));
    recordPilotSend(pilot, { recipient });
  }

  assert.throws(() => evaluateStage(pilot, { actor: "agent" }), /human actor/);
  const evaluated = evaluateStage(pilot);
  assert.equal(evaluated.status, PILOT_STATUS.EVALUATING);
  assert.equal(getPilotSummary(evaluated).safeToContinue, true);

  assert.throws(() => advancePilotStage(evaluated, { actor: "agent" }), /human actor/);
  const next = advancePilotStage(evaluated);
  assert.equal(next.status, PILOT_STATUS.ACTIVE);
  assert.equal(next.stageSize, 100);
  assert.equal(next.sentCount, 0);
});

test("pilot pauses on complaint and can be manually paused", () => {
  const pilot = createPilot({ enabled: true });
  recordPilotSend(pilot, { recipient: "a@example.com", complaint: true });
  const evaluated = evaluateStage(pilot);
  assert.equal(evaluated.status, PILOT_STATUS.PAUSED);
  assert.ok(evaluated.lastEvaluation.stopReasons.includes("complaint_threshold_reached"));

  const paused = pausePilot(createPilot({ enabled: true }), { reason: "Operator review" });
  assert.equal(paused.status, PILOT_STATUS.PAUSED);
  assert.equal(paused.pauseReason, "Operator review");
});

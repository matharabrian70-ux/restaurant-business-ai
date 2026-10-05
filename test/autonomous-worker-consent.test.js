import test from "node:test";
import assert from "node:assert/strict";
import { AutonomousWorker } from "../src/autonomy/worker.js";
import { PILOT_STATUS } from "../src/sales/pilot.js";

function createStore(initialPilot = null) {
  const values = new Map(initialPilot ? [["pilot", initialPilot]] : []);
  return {
    values,
    async init() {},
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async getLead() { return null; },
    async getConsentByEmail() { return null; },
    async revokeConsent() {},
    async upsertLead() { throw new Error("ineligible lead must not be persisted as contacted"); },
    async recordEvent() { throw new Error("ineligible lead must not record a sent event"); },
    async close() {}
  };
}

test("autonomous worker skips an ineligible lead without authorizing or sending", async () => {
  const store = createStore();
  let sends = 0;

  const worker = new AutonomousWorker({
    env: {
      AUTONOMOUS_SALES_ENABLED: "true",
      AUTONOMOUS_DAILY_LIMIT: "35",
      AUTONOMOUS_REQUIRE_CONSENT: "false",
      RESEND_FROM: "hello@matharadigital.dev",
      RESEND_REPLY_TO: "hello@matharadigital.dev"
    },
    store,
    transport: {
      name: "test",
      async send() {
        sends++;
        throw new Error("send must not be reached");
      }
    },
    discover: async () => [{
      id: "fsq:test-ineligible",
      name: "Test Restaurant",
      location: "Nairobi",
      email: "info@example.com",
      website: "https://example.com",
      source: "public_business_directory",
      sourceUrl: "https://foursquare.com/",
      consentState: "unknown",
      consentEvidence: null
    }]
  });

  const result = await worker.discoverAndSend();

  assert.equal(result.sent, 0);
  assert.equal(result.discovered, 1);
  assert.equal(result.skipped, 1);
  assert.equal(sends, 0);
});

test("persisted active pilot is disabled by the environment kill switch", async () => {
  const store = createStore({
    id: "sales-pilot",
    status: PILOT_STATUS.ACTIVE,
    stageSize: 50,
    dailyLimit: 35,
    sentCount: 0,
    sentToday: 0,
    dayKey: "2026-10-05",
    successfulSends: 0,
    failedSends: 0,
    bouncedCount: 0,
    complaintCount: 0,
    suppressedCount: 0,
    uniqueRecipients: [],
    lastEvaluation: null,
    limits: {
      maxBounceRate: 0.10,
      maxComplaintCount: 1,
      maxSuppressionRate: 0.05,
      maxProviderFailures: 3
    },
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z"
  });

  let discovered = 0;

  const worker = new AutonomousWorker({
    env: {
      AUTONOMOUS_SALES_ENABLED: "false",
      AUTONOMOUS_DAILY_LIMIT: "35"
    },
    store,
    discover: async () => {
      discovered++;
      return [];
    }
  });

  const result = await worker.discoverAndSend();

  assert.equal(result.status, PILOT_STATUS.DISABLED);
  assert.equal(result.sent, 0);
  assert.equal(result.discovered, 0);
  assert.equal(discovered, 0);
  assert.equal(store.values.get("pilot").status, PILOT_STATUS.DISABLED);
});

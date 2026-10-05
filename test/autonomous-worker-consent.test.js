import test from "node:test";
import assert from "node:assert/strict";
import { AutonomousWorker } from "../src/autonomy/worker.js";

function createStore() {
  const values = new Map();
  return {
    values,
    async init() {},
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async getLead() { return null; },
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

import test from "node:test";
import assert from "node:assert/strict";
import { ConsentLedger } from "../src/autonomy/consent-ledger.js";
import { AutonomousWorker } from "../src/autonomy/worker.js";

function makePool() {
  const rows = new Map();

  return {
    rows,
    async query(sql, params = []) {
      if (sql.includes("CREATE TABLE")) return { rows: [], rowCount: 0 };

      if (sql.startsWith("SELECT * FROM autonomy_consent")) {
        const row = rows.get(String(params[0]).toLowerCase());
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }

      if (sql.includes("INSERT INTO autonomy_consent")) {
        const email = String(params[0]).toLowerCase();
        const state = sql.includes("'not_allowed'") ? "not_allowed" : "allowed";
        const row = {
          email,
          state,
          source: params[1],
          consented_at: params[2],
          method: params[3],
          evidence_ref: params[4]
        };
        rows.set(email, row);
        return { rows: [], rowCount: 1 };
      }

      throw new Error("Unexpected SQL: " + sql);
    }
  };
}

test("consent ledger records auditable allowed consent and can revoke it", async () => {
  const pool = makePool();
  const ledger = new ConsentLedger(pool);

  await ledger.init();

  const allowed = await ledger.recordAllowed({
    email: "Owner@Example.com",
    source: "Restaurant owner explicitly requested website-sales updates by email",
    at: "2026-10-05T20:00:00.000Z",
    method: "documented_external_consent"
  });

  assert.equal(allowed.email, "owner@example.com");
  assert.equal(allowed.state, "allowed");
  assert.equal(allowed.method, "documented_external_consent");
  assert.ok(allowed.evidence_ref);

  const revoked = await ledger.revoke({
    email: "owner@example.com",
    source: "recipient requested no further messages",
    at: "2026-10-05T21:00:00.000Z",
    method: "opt_out"
  });

  assert.equal(revoked.state, "not_allowed");
  assert.equal((await ledger.getByEmail("OWNER@example.com")).state, "not_allowed");
});

test("autonomous worker can send only when durable consent evidence exists", async () => {
  const values = new Map();
  let sends = 0;

  const store = {
    async init() {},
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async getLead() { return null; },
    async getConsentByEmail() {
      return {
        email: "owner@example.com",
        state: "allowed",
        source: "restaurant owner explicitly requested website-sales updates by email",
        consented_at: "2026-10-05T20:00:00.000Z",
        method: "documented_external_consent",
        evidence_ref: "evidence-1"
      };
    },
    async upsertLead() {},
    async recordEvent() { return true; },
    async revokeConsent() {},
    async close() {}
  };

  const worker = new AutonomousWorker({
    env: {
      AUTONOMOUS_SALES_ENABLED: "true",
      AUTONOMOUS_DAILY_LIMIT: "35",
      AUTONOMOUS_REQUIRE_CONSENT: "true",
      RESEND_FROM: "hello@matharadigital.dev",
      RESEND_REPLY_TO: "hello@matharadigital.dev"
    },
    store,
    transport: {
      name: "test-transport",
      async send() {
        sends++;
        return {
          status: "sent",
          provider: "test",
          messageId: "consent-msg-1"
        };
      }
    },
    discover: async () => [{
      id: "fsq:consented",
      name: "Consented Restaurant",
      location: "Nairobi, Kenya",
      email: "owner@example.com",
      website: "https://example.com",
      source: "public_business_directory",
      sourceUrl: "https://foursquare.com/",
      consentState: "unknown",
      consentEvidence: null
    }]
  });

  const result = await worker.discoverAndSend();

  assert.equal(result.discovered, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 0);
  assert.equal(sends, 1);
});

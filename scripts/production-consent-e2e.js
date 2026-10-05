import { createConfiguredTransport } from "../src/sales/provider-factory.js";
import { AutonomousWorker } from "../src/autonomy/worker.js";
import { PostgresAutonomyStore } from "../src/autonomy/postgres-store.js";
import { createPilot } from "../src/sales/pilot.js";

const TEST_RECIPIENT = "delivered@resend.dev";
const TEST_SOURCE = "controlled production consent e2e test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function runProductionConsentE2E(env = process.env) {
  assert(env.PRODUCTION_CONSENT_E2E === "true", "PRODUCTION_CONSENT_E2E must be true");
  assert(env.DATABASE_URL, "DATABASE_URL is required");
  assert(env.RESEND_API_KEY, "RESEND_API_KEY is required");
  assert(env.RESEND_FROM, "RESEND_FROM is required");
  assert(env.RESEND_DOMAIN_VERIFIED === "true", "RESEND_DOMAIN_VERIFIED must be true");

  const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
  const transport = createConfiguredTransport(env);

  try {
    await store.init();

    console.log("1/5 RECORD CONSENT");
    const recorded = await store.recordConsent({
      email: TEST_RECIPIENT,
      source: TEST_SOURCE,
      at: new Date().toISOString(),
      method: "controlled_test"
    });
    assert(recorded.state === "allowed", "Consent was not recorded as allowed");

    const allowed = await store.getConsentByEmail(TEST_RECIPIENT);
    assert(allowed?.state === "allowed", "Durable consent ledger did not return allowed");
    assert(allowed?.source === TEST_SOURCE, "Consent evidence source mismatch");
    console.log("   PASS: durable consent is allowed with evidence");

    console.log("2/5 AUTHORIZE + SEND THROUGH AUTONOMOUS WORKER");
    const isolatedPilot = createPilot({
      enabled: true,
      stageSize: 50,
      dailyLimit: 1
    });

    const testStore = {
      async init() {},
      async get(key) {
        return key === "pilot" ? isolatedPilot : null;
      },
      async set(key, value) {
        if (key === "pilot") Object.assign(isolatedPilot, value);
        return value;
      },
      async getLead() {
        return null;
      },
      async getConsentByEmail(email) {
        return store.getConsentByEmail(email);
      },
      async upsertLead() {
        return null;
      },
      async recordEvent() {
        return true;
      },
      async close() {}
    };

    const firstWorker = new AutonomousWorker({
      env: {
        ...env,
        AUTONOMOUS_SALES_ENABLED: "true",
        AUTONOMOUS_DAILY_LIMIT: "1"
      },
      store: testStore,
      transport,
      discover: async () => [{
        id: "e2e-consent-allowed-" + Date.now(),
        name: "Controlled Consent E2E Test",
        location: "Resend test environment",
        email: TEST_RECIPIENT,
        website: "https://e2e-consent-test.invalid/" + Date.now(),
        source: "manual",
        sourceUrl: "https://resend.com/",
        consentState: "unknown",
        consentEvidence: null
      }]
    });

    const sentResult = await firstWorker.discoverAndSend();
    assert(sentResult.sent === 1, "Authorized consented test lead was not sent");
    assert(sentResult.skipped === 0, "Authorized consented test lead was skipped");
    console.log("   PASS: durable consent upgraded the discovered record and Resend accepted the autonomous send");

    console.log("3/5 REVOKE CONSENT");
    const revoked = await store.revokeConsent({
      email: TEST_RECIPIENT,
      source: TEST_SOURCE,
      at: new Date().toISOString(),
      method: "controlled_test_revoke"
    });
    assert(revoked.state === "not_allowed", "Consent was not revoked");

    const blocked = await store.getConsentByEmail(TEST_RECIPIENT);
    assert(blocked?.state === "not_allowed", "Durable consent ledger did not persist revocation");
    console.log("   PASS: durable consent is now not_allowed");

    console.log("4/5 VERIFY REVOCATION BLOCKS A NEW SEND");
    const secondPilot = createPilot({
      enabled: true,
      stageSize: 50,
      dailyLimit: 1
    });
    let secondSends = 0;
    const countingTransport = {
      name: "revocation-counting-wrapper",
      async send(message) {
        secondSends++;
        return transport.send(message);
      }
    };
    const secondStore = {
      async init() {},
      async get(key) {
        return key === "pilot" ? secondPilot : null;
      },
      async set(key, value) {
        if (key === "pilot") Object.assign(secondPilot, value);
        return value;
      },
      async getLead() {
        return null;
      },
      async getConsentByEmail(email) {
        return store.getConsentByEmail(email);
      },
      async upsertLead() {
        throw new Error("revoked lead must not be persisted as contacted");
      },
      async recordEvent() {
        throw new Error("revoked lead must not record a sent event");
      },
      async close() {}
    };

    const secondWorker = new AutonomousWorker({
      env: {
        ...env,
        AUTONOMOUS_SALES_ENABLED: "true",
        AUTONOMOUS_DAILY_LIMIT: "1"
      },
      store: secondStore,
      transport: countingTransport,
      discover: async () => [{
        id: "e2e-consent-revoked-" + Date.now(),
        name: "Controlled Revocation E2E Test",
        location: "Resend test environment",
        email: TEST_RECIPIENT,
        website: "https://e2e-revoked-test.invalid/" + Date.now(),
        source: "manual",
        sourceUrl: "https://resend.com/",
        consentState: "allowed",
        consentEvidence: {
          source: TEST_SOURCE,
          at: new Date().toISOString(),
          method: "controlled_test"
        }
      }]
    });

    const blockedResult = await secondWorker.discoverAndSend();
    assert(blockedResult.sent === 0, "Revoked consent unexpectedly allowed a send");
    assert(blockedResult.skipped === 1, "Revoked consent was not skipped");
    assert(secondSends === 0, "Transport was reached after consent revocation");
    console.log("   PASS: revocation blocked authorization and the transport was never called");

    console.log("5/5 FINAL ASSERTIONS");
    const result = {
      consentRecorded: true,
      autonomousSendAccepted: true,
      consentRevoked: true,
      postRevokeSendBlocked: true,
      postRevokeTransportCalls: secondSends,
      testRecipient: TEST_RECIPIENT
    };
    console.log(JSON.stringify(result, null, 2));
    console.log("PRODUCTION CONSENT E2E: PASS");
    return result;
  } finally {
    await store.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runProductionConsentE2E(process.env);
  } catch (error) {
    console.error("PRODUCTION CONSENT E2E: FAIL");
    console.error(error);
    process.exitCode = 1;
  }
}

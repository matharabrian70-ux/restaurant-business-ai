import test from "node:test";
import assert from "node:assert/strict";
import { runDiscoveryOnlyTest } from "../src/autonomy/discovery-test.js";

function fakeStore() {
  const leads = new Map();
  const events = new Map();
  return {
    leads,
    events,
    async init() {},
    async getLead(identity) { return leads.get(identity) ?? null; },
    async upsertLead(lead) {
      leads.set(lead.identity, {
        lead_id: lead.leadId,
        name: lead.name,
        email: lead.email ?? null,
        website: lead.website ?? null,
        stage: lead.stage,
        payload: lead.payload,
        last_outreach_at: lead.lastOutreachAt ?? null,
        handoff_at: lead.handoffAt ?? null
      });
    },
    async recordEvent(id, type, payload) {
      if (events.has(id)) return false;
      events.set(id, { type, payload });
      return true;
    }
  };
}

test("discovery-only test stores Foursquare restaurant data and sends nothing", async () => {
  const store = fakeStore();

  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://places-api.foursquare.com/places/search")) {
      return {
        ok: true,
        async json() {
          return {
            results: [{
              fsq_place_id: "fsq-discovery-test",
              name: "Test Restaurant",
              location: { formatted_address: "Westlands, Nairobi, Kenya" },
              email: "hello@example.test",
              website: null
            }]
          };
        }
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await runDiscoveryOnlyTest({
    env: {
      AUTONOMOUS_DISCOVERY_PROVIDER: "foursquare",
      AUTONOMOUS_DISCOVERY_NEAR: "Nairobi, Kenya",
      AUTONOMOUS_DISCOVERY_PAGE_SIZE: "5",
      AUTONOMOUS_DISCOVERY_DAILY_TARGET: "5",
      FOURSQUARE_API_KEY: "test-key",
      AUTONOMOUS_SALES_ENABLED: "false"
    },
    store,
    fetchImpl
  });

  assert.deepEqual(result, {
    mode: "discovery_only",
    autonomousSalesEnabled: false,
    discovered: 1,
    stored: 1,
    updated: 0,
    skipped: 0,
    contacted: 0,
    emailsSent: 0
  });

  const lead = store.leads.get("email:hello@example.test");
  assert.equal(lead.stage, "discovered");
  assert.equal(lead.email, "hello@example.test");
  assert.equal(lead.payload.discoveryTest, true);
  assert.equal(lead.payload.source, "public_business_directory");
  assert.equal(store.events.size, 1);
});

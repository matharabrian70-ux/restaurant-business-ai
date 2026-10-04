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

test("discovery-only test stores public restaurant data and sends nothing", async () => {
  const store = fakeStore();
  const fetchImpl = async (url) => {
    if (String(url).includes("places.googleapis.com")) {
      return {
        ok: true,
        async json() {
          return {
            places: [{
              id: "place-1",
              displayName: { text: "Test Restaurant" },
              formattedAddress: "Nairobi, Kenya",
              websiteUri: "https://example.test"
            }]
          };
        }
      };
    }

    return {
      ok: true,
      async text() {
        return "<html>hello@example.test</html>";
      }
    };
  };

  const result = await runDiscoveryOnlyTest({
    env: {
      GOOGLE_PLACES_API_KEY: "test-key",
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

  const lead = store.leads.get("website:example.test");
  assert.equal(lead.stage, "discovered");
  assert.equal(lead.email, "hello@example.test");
  assert.equal(lead.payload.discoveryTest, true);
  assert.equal(store.events.size, 1);
});

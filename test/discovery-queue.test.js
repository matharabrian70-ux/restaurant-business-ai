import test from "node:test";
import assert from "node:assert/strict";
import { processPersistedDiscoveryQueue } from "../src/autonomy/discovery-queue.js";

function fakeStore(initial) {
  const leads = new Map(initial.map((lead) => [lead.identity, structuredClone(lead)]));
  const events = new Map();
  return {
    leads,
    events,
    async listLeads() { return [...leads.values()]; },
    async upsertLead(input) {
      const current = leads.get(input.identity);
      leads.set(input.identity, {
        ...current,
        identity: input.identity,
        lead_id: input.leadId,
        name: input.name,
        email: input.email ?? null,
        website: input.website ?? null,
        stage: input.stage,
        payload: input.payload,
        last_outreach_at: input.lastOutreachAt ?? current?.last_outreach_at ?? null,
        handoff_at: input.handoffAt ?? current?.handoff_at ?? null
      });
    },
    async recordEvent(id, type, payload) {
      if (events.has(id)) return false;
      events.set(id, { type, payload });
      return true;
    }
  };
}

test("persisted hotel lead gets scored and a hotel-only draft without sending", async () => {
  const store = fakeStore([{
    identity: "website:sample-lodge.example",
    lead_id: "discovery-fsq:lodge-1",
    name: "Sample Lodge",
    email: "info@sample-lodge.example",
    website: "https://sample-lodge.example",
    stage: "discovered",
    last_outreach_at: null,
    handoff_at: null,
    payload: {
      id: "fsq:lodge-1",
      name: "Sample Lodge",
      location: "Kigali, Rwanda",
      businessType: "hotel",
      source: "public_business_directory",
      sourceUrl: "https://foursquare.com/",
      discoveryOnly: true,
      consentState: "unknown"
    }
  }]);

  const result = await processPersistedDiscoveryQueue(store);
  assert.deepEqual(result, { queued: 1, processed: 1, failed: 0, emailsSent: 0 });

  const saved = store.leads.get("website:sample-lodge.example");
  assert.equal(saved.stage, "researched");
  assert.equal(saved.payload.salesPipeline.status, "proposal_drafted");
  assert.equal(saved.payload.salesPipeline.proposal.packagePrice, "US$230");
  assert.equal(saved.payload.salesPipeline.proposal.requiresHumanApproval, true);
  assert.match(saved.payload.salesPipeline.proposal.body, /hotel-website-demo/);
  assert.doesNotMatch(saved.payload.salesPipeline.proposal.body, /Ordering System|Customer Menu|Checkout System/i);
  assert.equal([...store.events.values()].some((event) => event.type === "outreach.sent"), false);
});

test("already processed and contacted records are not reprocessed", async () => {
  const store = fakeStore([{
    identity: "email:contact@example.test",
    lead_id: "discovery-fsq:restaurant-1",
    name: "Restaurant",
    email: "contact@example.test",
    website: null,
    stage: "researched",
    last_outreach_at: null,
    handoff_at: null,
    payload: { discoveryOnly: true, businessType: "restaurant", location: "Nairobi, Kenya" }
  }]);
  const result = await processPersistedDiscoveryQueue(store);
  assert.deepEqual(result, { queued: 0, processed: 0, failed: 0, emailsSent: 0 });
});

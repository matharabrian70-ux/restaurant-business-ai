import test from "node:test";
import assert from "node:assert/strict";
import { enrichPersistedContactQueue } from "../src/autonomy/contact-enrichment-queue.js";

function fakeStore(records) {
  const leads = new Map(records.map((lead) => [lead.identity, structuredClone(lead)]));
  return {
    leads,
    async listLeads() { return [...leads.values()]; },
    async upsertLead(input) {
      const current = leads.get(input.identity);
      leads.set(input.identity, {
        ...current,
        ...input,
        email: input.email ?? null,
        last_outreach_at: input.lastOutreachAt ?? current?.last_outreach_at ?? null,
        handoff_at: input.handoffAt ?? current?.handoff_at ?? null
      });
    }
  };
}

test("persisted lead enrichment saves public email and throttles repeated lookups", async () => {
  const store = fakeStore([{
    identity: "website:fixture.example.test",
    lead_id: "fixture-1",
    name: "Fixture Restaurant",
    email: null,
    website: "https://fixture.example.test/",
    stage: "researched",
    last_outreach_at: null,
    handoff_at: null,
    payload: { discoveryOnly: true, salesPipeline: { status: "proposal_drafted" } }
  }]);
  const fetchImpl = async (url) => {
    const value = String(url);
    if (value === "https://fixture.example.test/") {
      return { ok: true, status: 200, url: value, async text() { return "<html>Homepage</html>"; } };
    }
    if (value === "https://fixture.example.test/contact") {
      return { ok: true, status: 200, url: value, async text() { return "Email: bookings@fixture.example.test"; } };
    }
    throw new Error("Unexpected fetch " + value);
  };
  const now = () => new Date("2026-10-10T01:00:00.000Z");
  const result = await enrichPersistedContactQueue(store, { fetchImpl, now });
  assert.deepEqual(result, { queued: 1, enriched: 1, noEmailFound: 0, failed: 0 });
  const saved = store.leads.get("website:fixture.example.test");
  assert.equal(saved.email, "bookings@fixture.example.test");
  assert.equal(saved.payload.email, "bookings@fixture.example.test");
  assert.equal(saved.payload.contactEnrichmentStatus, "email_found");

  const second = await enrichPersistedContactQueue(store, { fetchImpl, now });
  assert.deepEqual(second, { queued: 0, enriched: 0, noEmailFound: 0, failed: 0 });
});


test("enrichment never attempts a website for a lead already contacted or handed off", async () => {
  const store = fakeStore([
    {
      identity: "website:contacted.example.test", lead_id: "contacted-1",
      name: "Contacted Restaurant", email: null, website: "https://contacted.example.test/",
      stage: "contacted", last_outreach_at: "2026-10-09T00:00:00.000Z", handoff_at: null, payload: {}
    },
    {
      identity: "website:handoff.example.test", lead_id: "handoff-1",
      name: "Handoff Restaurant", email: null, website: "https://handoff.example.test/",
      stage: "human_handoff", last_outreach_at: null, handoff_at: "2026-10-09T00:00:00.000Z", payload: {}
    }
  ]);
  let requests = 0;
  const result = await enrichPersistedContactQueue(store, {
    now: () => new Date("2026-10-10T01:00:00.000Z"),
    fetchImpl: async () => { requests++; throw new Error("Must not request"); }
  });
  assert.deepEqual(result, { queued: 0, enriched: 0, noEmailFound: 0, failed: 0 });
  assert.equal(requests, 0);
});

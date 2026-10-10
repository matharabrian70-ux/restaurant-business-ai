import test from "node:test";
import assert from "node:assert/strict";
import { AutonomousWorker } from "../src/autonomy/worker.js";

function stubStore() {
  const state = { events: new Map(), suppressions: new Map(), revoked: [], leads: [] };
  return {
    state,
    async recordEvent(id, type, payload) {
      if (state.events.has(id)) return false;
      state.events.set(id, { type, payload });
      return true;
    },
    async suppressEmail({ email, reason, source, at }) {
      const key = email.trim().toLowerCase();
      const entry = { email: key, reason, source, at };
      state.suppressions.set(key, entry);
      return entry;
    },
    async isSuppressed(email) { return state.suppressions.has(email.trim().toLowerCase()); },
    async findLeadByEmail(email) {
      return { identity: "email:" + email, lead_id: "lead-1", name: "Synthetic Cafe", email, stage: "contacted", payload: {}, last_outreach_at: null, handoff_at: null };
    },
    async upsertLead(lead) { state.leads.push(lead); return lead; },
    async revokeConsent(record) { state.revoked.push(record); return record; }
  };
}

test("Resend bounce webhook durably suppresses recipient and duplicate webhook is idempotent", async () => {
  const store = stubStore();
  const worker = new AutonomousWorker({ env: {}, store, transport: { async send() { throw new Error("must not send"); } } });
  const event = { id: "evt-bounce-1", type: "email.bounced", data: { to: ["Owner <owner@example.com>"] } };
  const first = await worker.handleInbound(event);
  const duplicate = await worker.handleInbound(event);
  assert.equal(first.suppressed, 1);
  assert.equal(duplicate.duplicate, true);
  assert.equal(await store.isSuppressed("owner@example.com"), true);
  assert.equal(store.state.suppressions.get("owner@example.com").reason, "bounced");
});

test("Resend complaint webhook durably suppresses recipient", async () => {
  const store = stubStore();
  const worker = new AutonomousWorker({ env: {}, store });
  const result = await worker.handleInbound({
    id: "evt-complaint-1",
    type: "email.complained",
    data: { to: ["owner@example.com"] }
  });
  assert.equal(result.suppressed, 1);
  assert.equal(store.state.suppressions.get("owner@example.com").reason, "complaint");
});

test("explicit STOP reply revokes consent and adds durable unsubscribe suppression", async () => {
  const store = stubStore();
  const worker = new AutonomousWorker({ env: {}, store });
  const result = await worker.handleInbound({
    id: "evt-reply-stop-1",
    type: "email.received",
    data: { email_id: "inbound-1", from: "owner@example.com", text: "STOP. Please remove me." }
  });
  assert.equal(result.classification, "negative");
  assert.equal(result.suppressed, true);
  assert.equal(store.state.revoked.length, 1);
  assert.equal(await store.isSuppressed("owner@example.com"), true);
  assert.equal(store.state.suppressions.get("owner@example.com").reason, "unsubscribed");
});

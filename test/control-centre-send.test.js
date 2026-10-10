import test from "node:test";
import assert from "node:assert/strict";
import { createManualSalesRuntime } from "../src/sales/manual-batch.js";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { createSuppressionStore } from "../src/sales/compliance.js";

function setup(envOverrides = {}) {
  const sent = [];
  const env = {
    SALES_SEND_KILL_SWITCH: "true",
    SALES_B2B_OUTREACH_ENABLED: "false",
    SALES_PROVIDER_ENABLED: "false",
    SALES_TEST_MODE: "true",
    RESEND_DOMAIN_VERIFIED: "false",
    RESEND_FROM: "Brian Mathara <hello@matharadigital.dev>",
    RESEND_REPLY_TO: "hello@matharadigital.dev",
    ...envOverrides
  };
  const runtime = createManualSalesRuntime({
    controlPlane: new SalesControlPlane(),
    suppressionStore: createSuppressionStore(),
    env,
    transport: {
      name: "mock-only",
      async send(message) {
        sent.push(message);
        return { status: "sent", provider: "mock-only", messageId: "mock-123" };
      }
    }
  });
  return { runtime, sent, env };
}

test("human approval updates the actual draft and reports kill-switch block without sending", async () => {
  const { runtime, sent } = setup();
  runtime.preparePilotBatch({ limit: 1 });
  const state = runtime.listPreparedDrafts()[0];
  const draft = state.drafts[0];
  const decision = runtime.decideDraft(draft.id, true, "synthetic test approval");
  assert.equal(decision.draft.status, "approved");
  const outcome = await runtime.sendApprovedDraft({ draftId: draft.id });
  assert.equal(outcome.status, "blocked");
  assert.match(outcome.reason, /kill switch is ON/i);
  assert.equal(sent.length, 0);
  const after = runtime.listPreparedDrafts()[0].drafts[0];
  assert.equal(after.status, "approved");
  assert.equal(after.sendOutcome.status, "blocked");
});

test("approved mock send only runs after global gates and documented consent are satisfied", async () => {
  const { runtime, sent } = setup({
    SALES_SEND_KILL_SWITCH: "false",
    SALES_B2B_OUTREACH_ENABLED: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_TEST_MODE: "false",
    RESEND_DOMAIN_VERIFIED: "true",
    DATABASE_URL: "postgres://test.invalid/db",
    RESEND_API_KEY: "re_test"
  });
  runtime.preparePilotBatch({ limit: 1 });
  const state = runtime.listPreparedDrafts()[0];
  const draft = state.drafts[0];
  runtime.recordRecipientConsent({
    id: state.pilotRecord.id,
    source: "synthetic fixture evidence",
    at: "2026-10-10T00:00:00.000Z"
  });
  runtime.decideDraft(draft.id, true, "synthetic test approval");
  const outcome = await runtime.sendApprovedDraft({ draftId: draft.id });
  assert.equal(outcome.status, "sent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipient, state.lead.contact.email);
  assert.equal(sent[0].channel, "email");
  assert.equal(runtime.listPreparedDrafts()[0].drafts[0].status, "sent");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  sendControlledTestEmail,
  sendControlledProposalEmail,
  validateControlledTestConfig,
  buildControlledTestIdempotencyKey
} from "../src/sales/test-send.js";

test("controlled test requires explicit test mode, provider, recipient and token", () => {
  const result = validateControlledTestConfig({});
  assert.equal(result.ok, false);
  assert.match(result.errors.join("; "), /SALES_TEST_MODE/);
  assert.match(result.errors.join("; "), /SALES_PROVIDER_ENABLED/);
  assert.match(result.errors.join("; "), /SALES_TEST_RECIPIENT/);
  assert.match(result.errors.join("; "), /SALES_TEST_TOKEN/);
});

test("controlled test uses a deterministic idempotency key for the exact payload", () => {
  const env = {
    SALES_TEST_RECIPIENT: "owner@example.com",
    RESEND_FROM: "Brian Mathara — Mathara Digital <hello@matharadigital.dev>"
  };

  const first = buildControlledTestIdempotencyKey(env);
  const retry = buildControlledTestIdempotencyKey(env);
  const changedRecipient = buildControlledTestIdempotencyKey({
    ...env,
    SALES_TEST_RECIPIENT: "other@example.com"
  });
  const changedSender = buildControlledTestIdempotencyKey({
    ...env,
    RESEND_FROM: "Other Sender <hello@matharadigital.dev>"
  });

  assert.equal(first, retry);
  assert.match(first, /^controlled-test\/resend\/[a-f0-9]{64}$/);
  assert.notEqual(first, changedRecipient);
  assert.notEqual(first, changedSender);
});

test("controlled test sends only to configured recipient with fixed test content", async () => {
  let message;
  const env = {
    SALES_TEST_MODE: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_TEST_RECIPIENT: "owner@example.com",
    SALES_TEST_TOKEN: "test-secret",
    RESEND_FROM: "Brian Mathara — Mathara Digital <hello@matharadigital.dev>"
  };

  const result = await sendControlledTestEmail({
    env,
    transport: {
      send: async (payload) => {
        message = payload;
        return { provider: "resend", status: "sent", messageId: "resend-test-id" };
      }
    }
  });

  assert.equal(result.test, true);
  assert.equal(result.recipient, "owner@example.com");
  assert.equal(message.recipient, "owner@example.com");
  assert.equal(message.leadId, "CONTROLLED-TEST");
  assert.equal(message.idempotencyKey, buildControlledTestIdempotencyKey(env));
  assert.match(message.body, /controlled email delivery test/i);
  assert.deepEqual(message.attachments, []);
  assert.equal(message.html.includes("href="), false);
});

test("controlled test cannot run while provider is disabled", async () => {
  await assert.rejects(
    () => sendControlledTestEmail({
      env: {
        SALES_TEST_MODE: "true",
        SALES_PROVIDER_ENABLED: "false",
        SALES_TEST_RECIPIENT: "owner@example.com",
        SALES_TEST_TOKEN: "test-secret"
      },
      transport: { send: async () => ({}) }
    }),
    /SALES_PROVIDER_ENABLED/
  );
});

test("controlled Pili proposal test preserves proposal HTML and links but removes ZIP attachment", async () => {
  let message;
  const env = {
    SALES_TEST_MODE: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_TEST_RECIPIENT: "owner@example.com",
    SALES_TEST_TOKEN: "test-secret",
    RESEND_FROM: "Brian Mathara <hello@matharadigital.dev>"
  };

  const result = await sendControlledProposalEmail({
    env,
    transport: {
      send: async (payload) => {
        message = payload;
        return { provider: "resend", status: "sent", messageId: "proposal-test-id" };
      }
    }
  });

  assert.equal(result.test, true);
  assert.equal(result.template, "pili_restaurant_proposal");
  assert.equal(message.recipient, "owner@example.com");
  assert.match(message.subject, /Pili Restaurant/i);
  assert.match(message.html, /A digital ordering idea for Pili Restaurant/i);
  assert.match(message.html, /Restaurant Prototype/i);
  assert.match(message.html, /Customer Menu/i);
  assert.match(message.html, /US\$230/);
  assert.match(message.html, /US\$615/);
  assert.deepEqual(message.attachments, []);
  assert.match(message.html, /https:\/\/matharabrian70-ux\.github\.io\/Restaurant-Website-Prototype\//);
});

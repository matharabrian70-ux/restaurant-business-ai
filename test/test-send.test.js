import test from "node:test";
import assert from "node:assert/strict";
import { sendControlledTestEmail, validateControlledTestConfig } from "../src/sales/test-send.js";

test("controlled test requires explicit test mode, provider, recipient and token", () => {
  const result = validateControlledTestConfig({});
  assert.equal(result.ok, false);
  assert.match(result.errors.join("; "), /SALES_TEST_MODE/);
  assert.match(result.errors.join("; "), /SALES_PROVIDER_ENABLED/);
  assert.match(result.errors.join("; "), /SALES_TEST_RECIPIENT/);
  assert.match(result.errors.join("; "), /SALES_TEST_TOKEN/);
});

test("controlled test sends only to configured recipient with fixed test content", async () => {
  let message;
  const env = {
    SALES_TEST_MODE: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_TEST_RECIPIENT: "owner@example.com",
    SALES_TEST_TOKEN: "test-secret"
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
  assert.equal(message.idempotencyKey, "restaurant-business-ai-resend-test-v1");
  assert.match(message.body, /controlled communication test/i);
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

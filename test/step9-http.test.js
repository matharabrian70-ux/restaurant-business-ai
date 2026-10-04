import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

test("server test endpoint requires bearer authentication", async () => {
  const { buildServer } = await import("../server.js");
  const server = buildServer({
    SALES_TEST_MODE: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_PROVIDER_NAME: "resend",
    SALES_TEST_RECIPIENT: "owner@example.com",
    SALES_TEST_TOKEN: "correct-token",
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "onboarding@resend.dev"
  }, {
    send: async () => ({ provider: "resend", status: "sent", messageId: "id" })
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const response = await fetch("http://127.0.0.1:" + port + "/test-email", {
    method: "POST"
  });
  assert.equal(response.status, 401);
  server.close();
});

test("server test endpoint sends fixed controlled test with valid token", async () => {
  let sent;
  const { buildServer } = await import("../server.js");
  const server = buildServer({
    SALES_TEST_MODE: "true",
    SALES_PROVIDER_ENABLED: "true",
    SALES_PROVIDER_NAME: "resend",
    SALES_TEST_RECIPIENT: "owner@example.com",
    SALES_TEST_TOKEN: "correct-token",
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "onboarding@resend.dev"
  }, {
    send: async payload => {
      sent = payload;
      return { provider: "resend", status: "sent", messageId: "id" };
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const response = await fetch("http://127.0.0.1:" + port + "/test-email", {
    method: "POST",
    headers: { Authorization: "Bearer correct-token" }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.test, true);
  assert.equal(body.recipient, "owner@example.com");
  assert.equal(sent.recipient, "owner@example.com");
  server.close();
});

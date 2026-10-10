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

test("Control Centre approval returns an explicit blocked result while the sending kill switch is on", async () => {
  let sendCalls = 0;
  const { buildServer } = await import("../server.js");
  const server = buildServer({
    CONTROL_PLANE_TOKEN: "control-token",
    SALES_SEND_KILL_SWITCH: "true",
    SALES_B2B_OUTREACH_ENABLED: "false",
    SALES_PROVIDER_ENABLED: "false",
    SALES_TEST_MODE: "true",
    RESEND_DOMAIN_VERIFIED: "false"
  }, {
    async send() {
      sendCalls++;
      return { provider: "mock", status: "sent", messageId: "must-not-send" };
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = { Authorization: "Bearer control-token", "Content-Type": "application/json" };
  try {
    const prepare = await fetch(base + "/control/pilot/prepare", { method: "POST", headers, body: "{}" });
    assert.equal(prepare.status, 200);
    const draftsResponse = await fetch(base + "/control/pilot/drafts", { headers: { Authorization: "Bearer control-token" } });
    const draftsBody = await draftsResponse.json();
    const draft = draftsBody.drafts[0].drafts[0];
    const response = await fetch(base + "/control/approvals/" + encodeURIComponent(draft.id) + "/decide", {
      method: "POST", headers, body: JSON.stringify({ approved: true, reason: "test" })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.approval.status, "approved");
    assert.equal(result.sendOutcome.status, "blocked");
    assert.match(result.sendOutcome.reason, /kill switch is ON/i);
    assert.equal(sendCalls, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

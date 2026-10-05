import test from "node:test";
import assert from "node:assert/strict";
import { ResendTransport } from "../src/sales/resend-transport.js";

function response({ ok = true, status = 200, data = {} } = {}) {
  return {
    ok,
    status,
    json: async () => data
  };
}

test("Resend transport retries transient network failures and then succeeds", async () => {
  let attempts = 0;
  const delays = [];

  const transport = new ResendTransport({
    apiKey: "test-key",
    from: "sender@example.com",
    fetchImpl: async () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error("temporary connection failure");
        error.code = attempts === 1 ? "ENETUNREACH" : "ECONNREFUSED";
        throw error;
      }
      return response({ data: { id: "msg-123" } });
    },
    sleepImpl: async (delay) => {
      delays.push(delay);
    }
  });

  const result = await transport.send({
    recipient: "customer@example.com",
    subject: "Test",
    body: "Hello",
    idempotencyKey: "outreach-123"
  });

  assert.deepEqual(result, {
    status: "sent",
    provider: "resend",
    messageId: "msg-123"
  });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("Resend transport retries fetch failures exposed through error.cause", async () => {
  let attempts = 0;

  const transport = new ResendTransport({
    apiKey: "test-key",
    from: "sender@example.com",
    fetchImpl: async () => {
      attempts++;
      if (attempts === 1) {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ETIMEDOUT" }
        });
      }
      return response({ data: { id: "msg-456" } });
    },
    sleepImpl: async () => {}
  });

  const result = await transport.send({
    recipient: "customer@example.com",
    subject: "Test",
    body: "Hello",
    idempotencyKey: "outreach-456"
  });

  assert.equal(result.messageId, "msg-456");
  assert.equal(attempts, 2);
});

test("Resend transport does not retry HTTP/API errors", async () => {
  let attempts = 0;

  const transport = new ResendTransport({
    apiKey: "test-key",
    from: "sender@example.com",
    fetchImpl: async () => {
      attempts++;
      return response({
        ok: false,
        status: 401,
        data: { message: "Invalid API key" }
      });
    },
    sleepImpl: async () => {
      throw new Error("sleep should not be called for HTTP errors");
    }
  });

  await assert.rejects(
    () => transport.send({
      recipient: "customer@example.com",
      subject: "Test",
      body: "Hello",
      idempotencyKey: "outreach-401"
    }),
    /Invalid API key/
  );

  assert.equal(attempts, 1);
});

test("Resend transport sends the idempotency key on every retry", async () => {
  const headers = [];
  let attempts = 0;

  const transport = new ResendTransport({
    apiKey: "test-key",
    from: "sender@example.com",
    fetchImpl: async (_url, options) => {
      attempts++;
      headers.push(options.headers["Idempotency-Key"]);
      if (attempts === 1) {
        const error = new Error("connection reset");
        error.code = "ECONNRESET";
        throw error;
      }
      return response({ data: { id: "msg-789" } });
    },
    sleepImpl: async () => {}
  });

  await transport.send({
    recipient: "customer@example.com",
    subject: "Test",
    body: "Hello",
    idempotencyKey: "outreach-789"
  });

  assert.deepEqual(headers, ["outreach-789", "outreach-789"]);
});

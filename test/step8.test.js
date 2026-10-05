import test from "node:test";
import assert from "node:assert/strict";
import { ResendTransport } from "../src/sales/resend-transport.js";
import { createConfiguredTransport } from "../src/sales/provider-factory.js";

test("Resend transport sends through the provider API", async () => {
  let request;
  const transport = new ResendTransport({
    apiKey: "re_test",
    from: "Sales <sales@example.com>",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: "resend-test-id" }) };
    }
  });

  const result = await transport.send({
    recipient: "restaurant@example.com",
    subject: "Website",
    body: "Hello",
    leadId: "L1",
    outreachId: "O1"
  });

  assert.equal(result.provider, "resend");
  assert.equal(result.messageId, "resend-test-id");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.method, "POST");
});

test("factory remains disabled unless explicitly enabled", () => {
  assert.equal(createConfiguredTransport({}), null);
  assert.equal(createConfiguredTransport({ SALES_PROVIDER_ENABLED: "false" }), null);
});

test("factory requires credentials when Resend is enabled", () => {
  assert.throws(
    () => createConfiguredTransport({
      SALES_PROVIDER_ENABLED: "true",
      SALES_PROVIDER_NAME: "resend"
    }),
    /RESEND_API_KEY/
  );
});

test("Resend transport includes the configured reply-to address", async () => {
  let request;
  const transport = new ResendTransport({
    apiKey: "re_test",
    from: "Sales <sales@example.com>",
    replyTo: "hello@example.com",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: "resend-replyto-test" }) };
    }
  });

  await transport.send({
    recipient: "restaurant@example.com",
    subject: "Website",
    body: "Hello. Reply STOP to opt out.",
    leadId: "L2",
    outreachId: "O2"
  });

  const payload = JSON.parse(request.options.body);
  assert.equal(payload.reply_to, "hello@example.com");
});

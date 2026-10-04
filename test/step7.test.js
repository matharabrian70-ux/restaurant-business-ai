import test from "node:test";
import assert from "node:assert/strict";
import { readProviderConfig, validateProviderConfig } from "../src/sales/provider-config.js";
import { EmailTransport } from "../src/sales/email-transport.js";

test("provider is disabled by default", () => {
  const c = readProviderConfig({});
  assert.equal(c.enabled, false);
  assert.deepEqual(validateProviderConfig(c), { ok: true, enabled: false, errors: [] });
});

test("enabled provider requires a name", () => {
  const result = validateProviderConfig({ enabled: true, name: null });
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
});

test("email transport delegates through injected provider", async () => {
  let received;
  const transport = new EmailTransport({
    sendEmail: async (payload) => { received = payload; return { status: "simulated" }; }
  });
  const result = await transport.send({
    recipient: "restaurant@example.com",
    subject: "Website",
    body: "Hello",
    leadId: "L1",
    outreachId: "O1"
  });
  assert.equal(result.status, "simulated");
  assert.equal(received.recipient, "restaurant@example.com");
});

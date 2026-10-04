import test from "node:test";
import assert from "node:assert/strict";
import {
  readProductionEmailConfig,
  extractSenderDomain,
  validateProductionEmailConfig
} from "../src/sales/production-email-config.js";
import { createConfiguredTransport } from "../src/sales/provider-factory.js";

test("production sender configuration accepts a verified real domain", () => {
  const config = readProductionEmailConfig({
    SALES_EMAIL_ENV: "production",
    RESEND_FROM: "Restaurant Business AI <sales@example.com>",
    RESEND_SENDING_DOMAIN: "example.com",
    RESEND_DOMAIN_VERIFIED: "true"
  });

  assert.equal(extractSenderDomain(config.from), "example.com");
  assert.equal(validateProductionEmailConfig(config).ok, true);
});

test("production rejects resend.dev and unverified domains", () => {
  assert.equal(validateProductionEmailConfig({
    environment: "production",
    from: "onboarding@resend.dev",
    sendingDomain: "resend.dev",
    domainVerified: true
  }).ok, false);

  const result = validateProductionEmailConfig({
    environment: "production",
    from: "sales@example.com",
    sendingDomain: "example.com",
    domainVerified: false
  });

  assert.match(result.errors.join(" "), /RESEND_DOMAIN_VERIFIED/);
});

test("sender domain must align with configured sending domain", () => {
  const result = validateProductionEmailConfig({
    environment: "production",
    from: "sales@other.example",
    sendingDomain: "example.com",
    domainVerified: true
  });

  assert.match(result.errors.join(" "), /must match/);
});

test("factory enforces production sender validation when enabled", () => {
  assert.throws(
    () => createConfiguredTransport({
      SALES_PROVIDER_ENABLED: "true",
      SALES_PROVIDER_NAME: "resend",
      SALES_EMAIL_ENV: "production",
      RESEND_API_KEY: "re_test",
      RESEND_FROM: "onboarding@resend.dev",
      RESEND_SENDING_DOMAIN: "resend.dev",
      RESEND_DOMAIN_VERIFIED: "true"
    }),
    /resend.dev/
  );
});

test("controlled testing can still use a test sender explicitly", () => {
  const transport = createConfiguredTransport({
    SALES_PROVIDER_ENABLED: "true",
    SALES_PROVIDER_NAME: "resend",
    SALES_EMAIL_ENV: "testing",
    RESEND_API_KEY: "re_test",
    RESEND_FROM: "onboarding@resend.dev",
    RESEND_SENDING_DOMAIN: "resend.dev",
    RESEND_DOMAIN_VERIFIED: "false"
  }, async () => ({ ok: true, status: 200, json: async () => ({ id: "test-id" }) }));

  assert.equal(transport.provider, "resend");
});

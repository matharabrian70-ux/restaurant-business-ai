import test from "node:test";
import assert from "node:assert/strict";
import {
  createDirectMarketingPolicy,
  validateDirectMarketingEligibility
} from "../src/sales/direct-marketing-policy.js";

test("Step 22 direct marketing policy requires documented recipient consent", () => {
  const policy = createDirectMarketingPolicy();

  const blocked = validateDirectMarketingEligibility({
    recipient: { address: "info@example.com" },
    consent: "unknown",
    consentEvidence: null,
    sender: {
      address: "hello@matharadigital.dev",
      replyTo: "hello@matharadigital.dev"
    },
    messageBody: "Hello. Reply STOP to opt out.",
    policy
  });

  assert.equal(blocked.eligible, false);
  assert.match(blocked.errors.join(" "), /consent/i);

  const eligible = validateDirectMarketingEligibility({
    recipient: { address: "info@example.com" },
    consent: "allowed",
    consentEvidence: {
      source: "restaurant requested a demo through our website",
      at: "2026-10-05T00:00:00.000Z"
    },
    sender: {
      address: "hello@matharadigital.dev",
      replyTo: "hello@matharadigital.dev"
    },
    messageBody: "Hello. Reply STOP to opt out.",
    policy
  });

  assert.equal(eligible.eligible, true);
});

test("Step 22 does not treat operator approval as recipient consent", () => {
  const policy = createDirectMarketingPolicy();

  const result = validateDirectMarketingEligibility({
    recipient: { address: "info@example.com" },
    consent: "unknown",
    consentEvidence: {
      source: "human operator approved the campaign",
      at: "2026-10-05T00:00:00.000Z"
    },
    sender: {
      address: "hello@matharadigital.dev",
      replyTo: "hello@matharadigital.dev"
    },
    messageBody: "Hello. Reply STOP to opt out.",
    policy
  });

  assert.equal(result.eligible, false);
});

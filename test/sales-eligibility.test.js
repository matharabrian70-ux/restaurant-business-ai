import test from "node:test";
import assert from "node:assert/strict";
import { validateConsentEvidence } from "../src/sales/eligibility.js";

const valid = {
  source: "form submission ID FORM-2026-104",
  evidenceType: "form_submission",
  consentedAt: "2026-10-01T10:00:00.000Z",
  confirmed: true
};

test("allows only a dated, explicitly confirmed reviewable opt-in reference", () => {
  const result = validateConsentEvidence(valid, { now: new Date("2026-10-10T00:00:00.000Z") });
  assert.equal(result.eligible, true);
  assert.equal(result.evidence.evidenceType, "form_submission");
});

test("fails closed when the operator has not confirmed evidence", () => {
  assert.equal(validateConsentEvidence({ ...valid, confirmed: false }).eligible, false);
});

test("rejects public listings and published email addresses as consent", () => {
  const result = validateConsentEvidence({ ...valid, source: "public business listing at example.com" });
  assert.equal(result.eligible, false);
  assert.match(result.errors.join(" "), /not evidence of opt-in/);
});

test("rejects missing or unsupported evidence type and invalid dates", () => {
  const result = validateConsentEvidence({ ...valid, evidenceType: "public_email", consentedAt: "not-a-date" });
  assert.equal(result.eligible, false);
});

test("rejects future consent dates", () => {
  const result = validateConsentEvidence({ ...valid, consentedAt: "2030-01-01T00:00:00.000Z" }, { now: new Date("2026-10-10T00:00:00.000Z") });
  assert.equal(result.eligible, false);
});

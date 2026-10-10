const ALLOWED_EVIDENCE_TYPES = new Set([
  "form_submission",
  "written_request",
  "contract_opt_in",
  "other_reviewable_record"
]);

const PUBLIC_SOURCE_PATTERNS = [
  /public (website|business|directory|listing|email|address)/i,
  /published (email|address)/i,
  /my own notes/i,
  /no consent/i,
  /not consent/i
];

export function validateConsentEvidence(input = {}, { now = new Date() } = {}) {
  const errors = [];
  const source = String(input.source ?? "").trim();
  const evidenceType = String(input.evidenceType ?? "").trim();
  const consentedAt = new Date(input.consentedAt ?? "");
  const validDate = !Number.isNaN(consentedAt.getTime());

  if (input.confirmed !== true) errors.push("Human confirmation of genuine, reviewable opt-in evidence is required");
  if (!ALLOWED_EVIDENCE_TYPES.has(evidenceType)) errors.push("Choose a supported reviewable opt-in evidence type");
  if (source.length < 12 || source.length > 500) errors.push("Evidence reference must be 12–500 characters");
  if (PUBLIC_SOURCE_PATTERNS.some((pattern) => pattern.test(source))) {
    errors.push("A public listing, published address, or operator notes are not evidence of opt-in");
  }
  if (!validDate) errors.push("A valid date of the recipient's opt-in is required");
  if (validDate && consentedAt.getTime() > now.getTime()) errors.push("Opt-in date cannot be in the future");

  return {
    eligible: errors.length === 0,
    errors,
    evidence: errors.length === 0 ? {
      source,
      evidenceType,
      consentedAt: consentedAt.toISOString(),
      confirmed: true
    } : null
  };
}

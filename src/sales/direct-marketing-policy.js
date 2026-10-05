export const DIRECT_MARKETING_MODES = Object.freeze({
  CONSENTED_BUSINESS_OUTREACH: "consented_business_outreach"
});

export function createDirectMarketingPolicy({
  mode = DIRECT_MARKETING_MODES.CONSENTED_BUSINESS_OUTREACH,
  optOutInstruction = "Reply STOP to opt out of future messages."
} = {}) {
  if (!Object.values(DIRECT_MARKETING_MODES).includes(mode)) {
    throw new Error("Unsupported direct marketing mode");
  }

  return Object.freeze({
    mode,
    requireRecipientConsent: true,
    requireConsentEvidence: true,
    requireIdentityDisclosure: true,
    requireValidReplyAddress: true,
    requireSimplifiedOptOut: true,
    optOutInstruction
  });
}

export function validateDirectMarketingEligibility({
  recipient,
  consent,
  consentEvidence,
  sender,
  messageBody,
  policy = createDirectMarketingPolicy()
} = {}) {
  const errors = [];

  if (!recipient?.address) errors.push("Recipient address is required");
  if (policy.requireRecipientConsent && consent !== "allowed") {
    errors.push("Recipient direct-marketing consent is not present");
  }
  if (
    policy.requireConsentEvidence &&
    (!consentEvidence?.source || !consentEvidence?.at)
  ) {
    errors.push("Documented recipient consent evidence is required");
  }
  if (policy.requireIdentityDisclosure && !sender?.address) {
    errors.push("Sender identity/address is required");
  }
  if (policy.requireValidReplyAddress && !sender?.replyTo) {
    errors.push("A valid reply address is required for direct marketing");
  }
  if (
    policy.requireSimplifiedOptOut &&
    (!messageBody || !messageBody.toLowerCase().includes("reply stop"))
  ) {
    errors.push("A simplified STOP opt-out instruction is required");
  }

  return {
    eligible: errors.length === 0,
    errors
  };
}

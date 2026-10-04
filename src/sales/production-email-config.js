const EMAIL_PATTERN = /^[^@\s]+@([^@\s]+)$/;

function senderAddress(value = "") {
  const match = String(value).match(/<([^>]+)>/);
  return String(match ? match[1] : value).trim().toLowerCase();
}

export function readProductionEmailConfig(env = process.env) {
  return {
    environment: String(env.SALES_EMAIL_ENV || "production").trim().toLowerCase(),
    from: String(env.RESEND_FROM || "").trim(),
    sendingDomain: String(env.RESEND_SENDING_DOMAIN || "").trim().toLowerCase(),
    domainVerified: env.RESEND_DOMAIN_VERIFIED === "true"
  };
}

export function extractSenderDomain(from = "") {
  const address = senderAddress(from);
  const match = address.match(EMAIL_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

export function validateProductionEmailConfig(config = {}) {
  const errors = [];
  const environment = config.environment || "production";
  const domain = extractSenderDomain(config.from);

  if (!config.from) errors.push("RESEND_FROM is required");
  if (config.from && !domain) errors.push("RESEND_FROM must contain a valid email address");
  if (!config.sendingDomain) errors.push("RESEND_SENDING_DOMAIN is required");
  if (config.sendingDomain && domain && domain !== config.sendingDomain && !domain.endsWith("." + config.sendingDomain)) {
    errors.push("RESEND_FROM domain must match RESEND_SENDING_DOMAIN");
  }

  if (environment === "production") {
    if (domain === "resend.dev") errors.push("resend.dev is not allowed as the production sender domain");
    if (config.domainVerified !== true) errors.push("RESEND_DOMAIN_VERIFIED must be true before production sending is enabled");
  }

  return {
    ok: errors.length === 0,
    errors,
    environment,
    senderDomain: domain,
    sendingDomain: config.sendingDomain || null,
    domainVerified: config.domainVerified === true
  };
}

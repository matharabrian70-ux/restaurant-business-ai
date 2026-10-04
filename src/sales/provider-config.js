export function readProviderConfig(env = process.env) {
  return {
    enabled: env.SALES_PROVIDER_ENABLED === "true",
    name: String(env.SALES_PROVIDER_NAME || "").trim() || null
  };
}

export function validateProviderConfig(config) {
  if (!config || config.enabled !== true) return { ok: true, enabled: false, errors: [] };
  const errors = [];
  if (!config.name) errors.push("SALES_PROVIDER_NAME is required when provider sending is enabled");
  return { ok: errors.length === 0, enabled: true, errors };
}

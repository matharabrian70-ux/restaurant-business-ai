import { readProviderConfig, validateProviderConfig } from "./provider-config.js";
import { ResendTransport } from "./resend-transport.js";

export function createConfiguredTransport(env = process.env, fetchImpl = globalThis.fetch) {
  const config = readProviderConfig(env);
  const validation = validateProviderConfig(config);
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  if (!config.enabled) return null;

  if (config.name === "resend") {
    return new ResendTransport({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM,
      fetchImpl
    });
  }

  throw new Error("Unsupported sales provider: " + config.name);
}

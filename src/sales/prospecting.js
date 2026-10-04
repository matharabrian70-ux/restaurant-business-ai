import { createLead } from "../core/types.js";

export function createProspect(input) {
  if (!input?.id || !input?.name) throw new Error("Prospect id and name are required");

  return createLead({
    id: input.id,
    name: input.name,
    contact: input.contact ?? null,
    source: input.source ?? "manual",
    website: input.website ?? null,
    notes: input.notes ?? []
  });
}

export function rankProspect(prospect) {
  const signals = prospect?.signals ?? {};
  let score = 0;
  if (signals.hasWebsite === false) score += 20;
  if (signals.hasOnlineOrdering === false) score += 25;
  if (signals.activeSocialPresence) score += 10;
  if (signals.multipleBranches) score += 15;
  if (signals.deliveryAvailable) score += 10;
  if (signals.contactableDecisionMaker) score += 20;

  return {
    ...prospect,
    prospectScore: Math.min(score, 100)
  };
}

import { normalizeResearch, researchCompleteness } from "./research.js";

const WEIGHTS = Object.freeze({
  digitalGap: 30,
  businessFit: 25,
  growthOpportunity: 20,
  contactability: 15,
  dataConfidence: 10
});

export function scoreResearch(input = {}) {
  const research = normalizeResearch(input);
  const signals = input.signals ?? {};
  let digitalGap = 0;
  if (research.hasWebsite === false) digitalGap += 15;
  if (research.hasOnlineOrdering === false) digitalGap += 10;
  if (research.deliveryAvailable === false) digitalGap += 5;

  let businessFit = 0;
  if (research.multipleBranches) businessFit += 10;
  if (signals.restaurantTypeMatch) businessFit += 10;
  if (signals.localMarketMatch) businessFit += 5;

  let growthOpportunity = 0;
  if (signals.activeSocialPresence) growthOpportunity += 5;
  if (signals.weakOnlineConversion) growthOpportunity += 10;
  if (signals.deliveryDemand) growthOpportunity += 5;

  let contactability = 0;
  if (research.email) contactability += 8;
  if (research.phone) contactability += 5;
  if (signals.contactableDecisionMaker) contactability += 2;

  let dataConfidence = 0;
  if (research.name && research.location) dataConfidence += 4;
  if (research.website) dataConfidence += 3;
  if (research.socialLinks?.length) dataConfidence += 3;

  const components = {
    digitalGap: Math.min(digitalGap, 30),
    businessFit: Math.min(businessFit, 25),
    growthOpportunity: Math.min(growthOpportunity, 20),
    contactability: Math.min(contactability, 15),
    dataConfidence: Math.min(dataConfidence, 10)
  };
  const score = Object.entries(components).reduce((sum,[key,value]) => sum + value, 0);
  return {
    score,
    components,
    priority: score >= 75 ? "critical" : score >= 55 ? "high" : score >= 35 ? "normal" : "low"
  };
}

export function researchLead(prospect, researchData = {}) {
  if (!prospect?.id || !prospect?.name) throw new Error("Prospect is required");
  const research = normalizeResearch({ ...researchData, name: researchData.name ?? prospect.name, location: researchData.location ?? prospect.location });
  const completeness = researchCompleteness(research);
  const scoring = scoreResearch(research);
  return {
    prospect: { ...prospect },
    research,
    completeness,
    scoring,
    researched: true
  };
}

export function selectResearchTargets(prospects = [], { minScore = 0 } = {}) {
  return prospects
    .map((prospect) => ({ prospect, scoring: scoreResearch(prospect.research ?? prospect) }))
    .filter(({ scoring }) => scoring.score >= minScore)
    .sort((a,b) => b.scoring.score - a.scoring.score);
}

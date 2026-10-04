const POSITIVE = new Set(["yes", "interested", "tell me more", "send demo", "call me", "okay"]);

export function classifyResponse(text = "") {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return { classification: "unknown", confidence: 0 };
  if ([...POSITIVE].some((phrase) => normalized.includes(phrase))) {
    return { classification: "positive", confidence: 0.9 };
  }
  if (normalized.includes("no") || normalized.includes("not interested")) {
    return { classification: "negative", confidence: 0.9 };
  }
  return { classification: "needs_review", confidence: 0.5 };
}

export function qualificationDecision({ response, buyingSignals = [] }) {
  const result = classifyResponse(response);
  const qualified = result.classification === "positive" && buyingSignals.length > 0;
  return {
    ...result,
    qualified,
    action: qualified ? "human_handoff" : result.classification === "negative" ? "close_lost" : "human_review"
  };
}

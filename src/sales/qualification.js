const POSITIVE = new Set(["yes", "interested", "tell me more", "send demo", "call me", "okay"]);

export function classifyResponse(text = "") {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return { classification: "unknown", confidence: 0 };
  // Check negative intent first: "not interested" also contains "interested".
  if (normalized.includes("not interested") || normalized.includes("no thanks") || normalized === "no" || normalized.startsWith("no ") || normalized.startsWith("no,") || normalized.includes("unsubscribe") || normalized === "stop") {
    return { classification: "negative", confidence: 0.9 };
  }
  if ([...POSITIVE].some((phrase) => normalized.includes(phrase))) {
    return { classification: "positive", confidence: 0.9 };
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

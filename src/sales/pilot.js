export const PILOT_STAGES = Object.freeze([50, 100, 250, 500]);

export const PILOT_STATUS = Object.freeze({
  DISABLED: "disabled",
  ACTIVE: "active",
  PAUSED: "paused",
  EVALUATING: "evaluating",
  COMPLETED: "completed"
});

const DEFAULT_LIMITS = Object.freeze({
  maxBounceRate: 0.10,
  maxComplaintCount: 1,
  maxSuppressionRate: 0.05,
  maxProviderFailures: 3
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function requireHuman(actor) {
  if (actor !== "human") throw new Error("Pilot control requires a human actor");
}

function stageIndex(stageSize) {
  return PILOT_STAGES.indexOf(stageSize);
}

export function createPilot({
  id = "sales-pilot",
  stageSize = 50,
  dailyLimit = 10,
  enabled = false,
  limits = {},
  createdAt = new Date().toISOString()
} = {}) {
  if (!PILOT_STAGES.includes(stageSize)) {
    throw new Error("Pilot stage must be one of 50, 100, 250, or 500");
  }
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > stageSize) {
    throw new Error("dailyLimit must be a positive integer no greater than the pilot stage");
  }

  return {
    id,
    status: enabled ? PILOT_STATUS.ACTIVE : PILOT_STATUS.DISABLED,
    stageSize,
    dailyLimit,
    sentCount: 0,
    sentToday: 0,
    dayKey: todayKey(),
    successfulSends: 0,
    failedSends: 0,
    bouncedCount: 0,
    complaintCount: 0,
    suppressedCount: 0,
    uniqueRecipients: [],
    lastEvaluation: null,
    limits: { ...DEFAULT_LIMITS, ...limits },
    createdAt,
    updatedAt: createdAt
  };
}

function resetDailyCounter(pilot) {
  const key = todayKey();
  if (pilot.dayKey !== key) {
    pilot.dayKey = key;
    pilot.sentToday = 0;
  }
}

export function authorizePilotSend(pilot, { recipient } = {}) {
  if (!pilot) throw new Error("Pilot configuration is required");
  resetDailyCounter(pilot);
  if (pilot.status !== PILOT_STATUS.ACTIVE) throw new Error("Controlled sales pilot is not active");
  if (pilot.sentCount >= pilot.stageSize) throw new Error("Pilot stage recipient cap reached");
  if (pilot.sentToday >= pilot.dailyLimit) throw new Error("Pilot daily send limit reached");

  const normalized = String(recipient ?? "").trim().toLowerCase();
  if (!normalized) throw new Error("Pilot recipient is required");
  if (pilot.uniqueRecipients.includes(normalized)) {
    throw new Error("Recipient has already been attempted in this pilot");
  }

  return {
    authorized: true,
    remainingStageCapacity: pilot.stageSize - pilot.sentCount,
    remainingDailyCapacity: pilot.dailyLimit - pilot.sentToday
  };
}

export function recordPilotSend(pilot, {
  recipient,
  success = true,
  bounced = false,
  complaint = false,
  suppressed = false
} = {}) {
  if (!pilot) throw new Error("Pilot configuration is required");
  resetDailyCounter(pilot);

  const normalized = String(recipient ?? "").trim().toLowerCase();
  if (!normalized) throw new Error("Pilot recipient is required");
  if (pilot.uniqueRecipients.includes(normalized)) {
    throw new Error("Recipient has already been recorded in this pilot");
  }

  pilot.uniqueRecipients.push(normalized);
  pilot.sentCount += 1;
  pilot.sentToday += 1;

  if (success) pilot.successfulSends += 1;
  else pilot.failedSends += 1;
  if (bounced) pilot.bouncedCount += 1;
  if (complaint) pilot.complaintCount += 1;
  if (suppressed) pilot.suppressedCount += 1;

  pilot.updatedAt = new Date().toISOString();
  return clone(pilot);
}

export function evaluatePilot(pilot) {
  if (!pilot) throw new Error("Pilot configuration is required");

  const attempts = pilot.sentCount;
  const bounceRate = attempts ? pilot.bouncedCount / attempts : 0;
  const suppressionRate = attempts ? pilot.suppressedCount / attempts : 0;
  const stopReasons = [];

  if (bounceRate > pilot.limits.maxBounceRate) stopReasons.push("bounce_rate_exceeded");
  if (pilot.complaintCount >= pilot.limits.maxComplaintCount) stopReasons.push("complaint_threshold_reached");
  if (suppressionRate > pilot.limits.maxSuppressionRate) stopReasons.push("suppression_rate_exceeded");
  if (pilot.failedSends >= pilot.limits.maxProviderFailures) stopReasons.push("provider_failure_threshold_reached");

  return {
    safeToContinue: stopReasons.length === 0,
    stopReasons,
    metrics: {
      attempts,
      successfulSends: pilot.successfulSends,
      failedSends: pilot.failedSends,
      bouncedCount: pilot.bouncedCount,
      complaintCount: pilot.complaintCount,
      suppressedCount: pilot.suppressedCount,
      bounceRate,
      suppressionRate
    }
  };
}

export function pausePilot(pilot, { actor = "human", reason = "Paused by operator" } = {}) {
  requireHuman(actor);
  return {
    ...clone(pilot),
    status: PILOT_STATUS.PAUSED,
    pauseReason: reason,
    updatedAt: new Date().toISOString()
  };
}

export function evaluateStage(pilot, { actor = "human" } = {}) {
  requireHuman(actor);
  if (pilot.status !== PILOT_STATUS.ACTIVE && pilot.status !== PILOT_STATUS.EVALUATING) {
    throw new Error("Only an active pilot can enter evaluation");
  }
  const evaluation = evaluatePilot(pilot);
  const status = evaluation.safeToContinue ? PILOT_STATUS.EVALUATING : PILOT_STATUS.PAUSED;
  return {
    ...clone(pilot),
    status,
    lastEvaluation: {
      at: new Date().toISOString(),
      ...evaluation
    },
    updatedAt: new Date().toISOString()
  };
}

export function advancePilotStage(pilot, { actor = "human" } = {}) {
  requireHuman(actor);
  if (pilot.status !== PILOT_STATUS.EVALUATING) {
    throw new Error("Pilot must be evaluated before advancing");
  }

  const evaluation = evaluatePilot(pilot);
  if (!evaluation.safeToContinue) throw new Error("Pilot cannot advance while a stop condition is active");
  if (pilot.sentCount < pilot.stageSize) {
    throw new Error("Current pilot stage must reach its recipient cap before evaluation");
  }

  const index = stageIndex(pilot.stageSize);
  if (index === PILOT_STAGES.length - 1) {
    return {
      ...clone(pilot),
      status: PILOT_STATUS.COMPLETED,
      lastEvaluation: {
        ...(pilot.lastEvaluation ?? {}),
        ...evaluation
      },
      updatedAt: new Date().toISOString()
    };
  }

  const nextStage = PILOT_STAGES[index + 1];
  return {
    ...clone(pilot),
    status: PILOT_STATUS.ACTIVE,
    stageSize: nextStage,
    sentCount: 0,
    sentToday: 0,
    dayKey: todayKey(),
    successfulSends: 0,
    failedSends: 0,
    bouncedCount: 0,
    complaintCount: 0,
    suppressedCount: 0,
    uniqueRecipients: [],
    lastEvaluation: {
      ...(pilot.lastEvaluation ?? {}),
      ...evaluation
    },
    updatedAt: new Date().toISOString()
  };
}

export function getPilotSummary(pilot) {
  resetDailyCounter(pilot);
  const evaluation = evaluatePilot(pilot);
  return {
    id: pilot.id,
    status: pilot.status,
    stageSize: pilot.stageSize,
    dailyLimit: pilot.dailyLimit,
    sentCount: pilot.sentCount,
    sentToday: pilot.sentToday,
    remaining: Math.max(0, pilot.stageSize - pilot.sentCount),
    dailyRemaining: Math.max(0, pilot.dailyLimit - pilot.sentToday),
    ...evaluation
  };
}

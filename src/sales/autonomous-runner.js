import { createDeliverabilityPolicy } from "./deliverability.js";
import { PILOT_STATUS, createPilot } from "./pilot.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class AutonomousSalesRunner {
  constructor({
    pipeline,
    pilot = createPilot({ enabled: true, stageSize: 50, dailyLimit: 10 }),
    enabled = false,
    requireConsent = true,
    channel = "email",
    sender,
    policy = null,
    clock = () => new Date().toISOString()
  } = {}) {
    if (!pipeline) throw new Error("pipeline is required");
    if (!sender) throw new Error("sender is required");

    this.pipeline = pipeline;
    this.pilot = pilot;
    this.enabled = enabled;
    this.requireConsent = requireConsent;
    this.channel = channel;
    this.sender = sender;
    this.policy = policy ?? createDeliverabilityPolicy({
      allowedChannels: [channel],
      requireConsent,
      requireUnsubscribeMechanism: channel === "email",
      hasUnsubscribeMechanism: true
    });
    this.clock = clock;
    this.running = false;
    this.lastRun = null;
  }

  status() {
    return {
      enabled: this.enabled,
      running: this.running,
      pilot: clone(this.pilot),
      lastRun: clone(this.lastRun)
    };
  }

  async run(records = [], {
    researchByProspect = {},
    maxRecords = 10
  } = {}) {
    if (!this.enabled) {
      throw new Error("Autonomous sales mode is disabled");
    }
    if (this.running) {
      throw new Error("Autonomous sales cycle is already running");
    }
    if (!Array.isArray(records)) {
      throw new Error("records must be an array");
    }

    this.running = true;
    const results = {
      startedAt: this.clock(),
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      items: []
    };

    try {
      for (const record of records.slice(0, maxRecords)) {
        results.attempted += 1;

        try {
          const researchData =
            researchByProspect[record.id] ??
            researchByProspect[record.email] ??
            {};

          const added = this.pipeline.addProspect(record, researchData);
          const prepared = this.pipeline.prepareOutreach(
            added.lead.id,
            this.channel
          );

          const recipientAddress =
            this.channel === "email"
              ? added.lead.contact?.email
              : added.lead.contact?.phone;

          if (!recipientAddress) {
            results.skipped += 1;
            results.items.push({
              leadId: added.lead.id,
              outcome: "skipped",
              reason: "missing_recipient"
            });
            continue;
          }

          const approval =
            this.pipeline.authorizeAutonomousOutreach(
              prepared.draft.id,
              { reason: "Autonomous campaign policy authorization" }
            );

          const sent =
            await this.pipeline.sendApprovedOutreach({
              draftId: prepared.draft.id,
              recipientAddress,
              sender: this.sender,
              policy: this.policy,
              consent: record.consentState ?? "unknown"
            });

          results.sent += 1;
          results.items.push({
            leadId: added.lead.id,
            draftId: prepared.draft.id,
            outcome: "sent",
            approvalMode: approval.approval.mode,
            outreachId: sent.record?.outreachId ?? null
          });

          if (this.pilot.status === PILOT_STATUS.PAUSED) break;
        } catch (error) {
          results.failed += 1;
          results.items.push({
            leadId: record.id ?? null,
            outcome: "failed",
            reason: error.message,
            stack: error.stack
          });

          if (this.pilot.status === PILOT_STATUS.PAUSED) break;
        }
      }

      results.completedAt = this.clock();
      this.lastRun = clone(results);
      return clone(results);
    } finally {
      this.running = false;
    }
  }
}

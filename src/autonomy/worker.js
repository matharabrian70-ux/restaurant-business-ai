import { createPilot, authorizePilotSend, recordPilotSend, evaluatePilot, PILOT_STATUS } from "../sales/pilot.js";
import { EndToEndSalesPipeline } from "../sales/end-to-end-pipeline.js";
import { SalesControlPlane } from "../sales/control-plane.js";
import { createSuppressionStore } from "../sales/compliance.js";
import { discoverFromConfiguredSource } from "./discovery-provider.js";
import { PostgresAutonomyStore } from "./postgres-store.js";
import { createHandoff, classifyReply } from "./handover.js";

const DEMO_URL = "https://matharabrian70-ux.github.io/Restaurant-Website-Prototype/";

function parseSender(value = "") {
  const match = String(value).match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export class AutonomousWorker {
  constructor({
    env = process.env,
    store,
    transport,
    fetchImpl = globalThis.fetch,
    notify
  } = {}) {
    this.env = env;
    this.store = store ?? new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
    this.transport = transport;
    this.fetchImpl = fetchImpl;
    this.notify = notify;
  }

  async init() {
    await this.store.init();
    let pilot = await this.store.get("pilot");
    if (!pilot) {
      pilot = createPilot({
        enabled: envBoolean(this.env.AUTONOMOUS_SALES_ENABLED, false),
        stageSize: 50,
        dailyLimit: Number(this.env.AUTONOMOUS_DAILY_LIMIT || 10)
      });
      await this.store.set("pilot", pilot);
    }
    return pilot;
  }

  async discoverAndSend() {
    const pilot = await this.init();
    if (pilot.status !== PILOT_STATUS.ACTIVE) {
      return { status: pilot.status, sent: 0, discovered: 0 };
    }

    const records = await discoverFromConfiguredSource({ env: this.env, fetchImpl: this.fetchImpl });

    const controlPlane = new SalesControlPlane();
    const pipeline = new EndToEndSalesPipeline({
      controlPlane,
      transport: this.transport,
      suppressionStore: createSuppressionStore(),
      pilot
    });

    let sent = 0;
    let skipped = 0;

    for (const record of records) {
      if (sent >= Number(this.env.AUTONOMOUS_DAILY_LIMIT || 10)) break;
      if (!record.email) {
        skipped++;
        continue;
      }

      const identity = record.website
        ? "website:" + record.website.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")
        : record.email
          ? "email:" + record.email.toLowerCase()
          : "place:" + String(record.id);
      const existing = await this.store.getLead(identity);
      if (existing?.last_outreach_at || existing?.handoff_at) {
        skipped++;
        continue;
      }

      const enriched = {
        ...record,
        id: record.id,
        consentState: this.env.AUTONOMOUS_REQUIRE_CONSENT === "true" ? "unknown" : "allowed"
      };

      const added = pipeline.addProspect(enriched, {
        name: record.name,
        location: record.location,
        website: record.website,
        email: record.email,
        notes: ["Autonomous public-business discovery"],
        hasOnlineOrdering: false,
        deliveryAvailable: false,
        multipleBranches: false
      });

      const prepared = pipeline.prepareOutreach(added.lead.id, "email");
      pipeline.authorizeAutonomousOutreach(prepared.draft.id, {
        reason: "Autonomous sales policy"
      });

      const result = await pipeline.sendApprovedOutreach({
        draftId: prepared.draft.id,
        recipientAddress: record.email,
        sender: {
          address: this.env.RESEND_FROM,
          verified: true
        },
        policy: {
          allowedChannels: ["email"],
          requireConsent: this.env.AUTONOMOUS_REQUIRE_CONSENT === "true",
          requireUnsubscribeMechanism: true,
          hasUnsubscribeMechanism: true
        },
        consent: enriched.consentState
      });

      await this.store.upsertLead({
        identity,
        leadId: added.lead.id,
        name: record.name,
        email: record.email,
        website: record.website,
        stage: "contacted",
        payload: enriched,
        lastOutreachAt: new Date().toISOString()
      });

      await this.store.recordEvent(result.record.outreachId, "outreach.sent", result.record);
      sent++;
    }

    pilot = { ...pilot, updatedAt: new Date().toISOString() };
    await this.store.set("pilot", pilot);

    return { status: pilot.status, discovered: records.length, sent, skipped };
  }

  async fetchInboundContent(emailId) {
    if (!this.env.RESEND_API_KEY || !emailId) return {};
    const response = await this.fetchImpl(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: {
          authorization: "Bearer " + this.env.RESEND_API_KEY
        }
      }
    );
    if (!response.ok) return {};
    return response.json().catch(() => ({}));
  }

  async handleInbound(event) {
    if (event?.type !== "email.received") return { ignored: true };

    const eventId = event.data?.email_id ?? event.id;
    if (!eventId) throw new Error("Inbound event id is required");

    const fresh = await this.store.recordEvent(eventId, "email.received", event);
    if (!fresh) return { duplicate: true };

    const sender = parseSender(event.data?.from);
    const lead = await this.store.findLeadByEmail(sender);
    if (!lead) return { matched: false, handoff: false };

    const received = await this.fetchInboundContent(event.data?.email_id);
    const reply = {
      subject: event.data?.subject ?? received.subject ?? "",
      body: received.text ?? event.data?.text ?? received.html ?? event.data?.html ?? ""
    };

    const classification = classifyReply(reply);

    if (classification.classification === "negative") {
      await this.store.upsertLead({
        ...lead,
        stage: "closed_lost",
        payload: { ...lead.payload, suppression: "unsubscribed" },
        lastOutreachAt: lead.last_outreach_at,
        handoffAt: lead.handoff_at
      });
      return { matched: true, classification: classification.classification, handoff: false };
    }

    if (!classification.handoff) {
      return { matched: true, classification: classification.classification, handoff: false };
    }

    const handoff = createHandoff({
      lead,
      reply,
      classification
    });

    await this.store.upsertLead({
      ...lead,
      stage: "human_handoff",
      payload: { ...lead.payload, handoff },
      lastOutreachAt: lead.last_outreach_at,
      handoffAt: handoff.handoffAt
    });

    if (this.notify) {
      await this.notify(handoff);
    }

    return { matched: true, classification: "positive", handoff: true, handoff };
  }
}

function envBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true";
}

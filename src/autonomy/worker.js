import { createPilot, authorizePilotSend, recordPilotSend, evaluatePilot, PILOT_STATUS } from "../sales/pilot.js";
import { EndToEndSalesPipeline } from "../sales/end-to-end-pipeline.js";
import { SalesControlPlane } from "../sales/control-plane.js";
import { createSuppressionStore } from "../sales/compliance.js";
import { discoverFromConfiguredSource } from "./discovery-provider.js";
import { PostgresAutonomyStore } from "./postgres-store.js";
import { createHandoff, classifyReply } from "./handover.js";
import { createDirectMarketingPolicy, validateDirectMarketingEligibility } from "../sales/direct-marketing-policy.js";

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
    notify,
    discover = discoverFromConfiguredSource
  } = {}) {
    this.env = env;
    this.store = store ?? new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
    this.transport = transport;
    this.fetchImpl = fetchImpl;
    this.notify = notify;
    this.discover = discover;
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
      return pilot;
    }

    // The environment kill switch must be authoritative even when an older
    // active pilot is already persisted in Postgres.
    if (
      envBoolean(this.env.AUTONOMOUS_SALES_ENABLED, false) === false &&
      pilot.status === PILOT_STATUS.ACTIVE
    ) {
      pilot = {
        ...pilot,
        status: PILOT_STATUS.DISABLED,
        pauseReason: "AUTONOMOUS_SALES_ENABLED is false",
        updatedAt: new Date().toISOString()
      };
      await this.store.set("pilot", pilot);
    }

    return pilot;
  }

  async discoverAndSend() {
    let pilot = await this.init();
    if (pilot.status !== PILOT_STATUS.ACTIVE) {
      return { status: pilot.status, sent: 0, discovered: 0 };
    }

    // In production, the scheduled discovery cron owns provider calls. The sales
    // worker consumes the persisted queue so discovery and sales do not diverge.
    // Test stores without listLeads retain the injectable discovery seam.
    let records;
    if (typeof this.store.listLeads === "function") {
      const persisted = await this.store.listLeads({ limit: 500 });
      records = persisted
        .filter((item) =>
          item.payload?.discoveryOnly === true &&
          ["discovered", "researched"].includes(item.stage) &&
          !item.last_outreach_at &&
          !item.handoff_at
        )
        .map((item) => ({
          ...(item.payload ?? {}),
          id: item.lead_id,
          name: item.name,
          email: item.email ?? item.payload?.email ?? null,
          website: item.website ?? item.payload?.website ?? null,
          location: item.payload?.location ?? item.payload?.discoveryMarket ?? "Unknown location",
          source: item.payload?.source ?? "public_business_directory",
          sourceUrl: item.payload?.sourceUrl ?? "https://foursquare.com/",
          businessType: item.payload?.businessType ?? "restaurant",
          consentState: item.payload?.consentState ?? "unknown"
        }));
    } else {
      records = await this.discover({ env: this.env, fetchImpl: this.fetchImpl });
    }

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

      // Persisted provider/recipient suppressions must win over consent and approval.
      if (typeof this.store.isSuppressed === "function" && await this.store.isSuppressed(record.email)) {
        await this.store.recordEvent(
          "blocked:suppressed:" + identity,
          "outreach.blocked",
          { leadId: record.id, recipient: record.email, reasons: ["Recipient is on the persistent suppression list."] }
        );
        skipped++;
        continue;
      }

      // Public-directory discovery never supplies marketing consent. A durable
      // consent ledger is the only additional source that can upgrade a record
      // to allowed, and its evidence is carried through to the send gate.
      const recordedConsent = await this.store.getConsentByEmail(record.email);
      const enriched = {
        ...record,
        id: record.id,
        consentState: recordedConsent?.state ?? record.consentState ?? "unknown",
        consentEvidence: recordedConsent
          ? {
              source: recordedConsent.source,
              at: recordedConsent.consented_at,
              method: recordedConsent.method,
              evidenceRef: recordedConsent.evidence_ref
            }
          : (record.consentEvidence ?? null)
      };

      const added = pipeline.addProspect(enriched, {
        name: record.name,
        location: record.location,
        website: record.website,
        email: record.email,
        notes: [],
        hasOnlineOrdering: false,
        deliveryAvailable: false,
        multipleBranches: false
      });

      const prepared = pipeline.prepareOutreach(added.lead.id, "email");

      const directMarketingPolicy = createDirectMarketingPolicy();
      const eligibility = validateDirectMarketingEligibility({
        recipient: { address: record.email },
        consent: enriched.consentState,
        consentEvidence: enriched.consentEvidence,
        sender: {
          address: this.env.RESEND_FROM,
          replyTo: this.env.RESEND_REPLY_TO || this.env.RESEND_FROM
        },
        messageBody: prepared.draft.body,
        policy: directMarketingPolicy
      });

      if (!eligibility.eligible) {
        controlPlane.cancelOutreachApproval(prepared.draft.id, {
          actor: "agent",
          reason: "Autonomous outreach skipped: " + eligibility.errors.join("; ")
        });
        await this.store.recordEvent(
          "blocked:" + prepared.draft.id,
          "outreach.blocked",
          {
            draftId: prepared.draft.id,
            leadId: added.lead.id,
            reasons: eligibility.errors
          }
        );
        skipped++;
        continue;
      }

      await this.store.recordEvent(
        "draft:" + prepared.draft.id,
        "outreach.drafted",
        {
          draftId: prepared.draft.id,
          leadId: added.lead.id,
          recipient: record.email,
          subject: prepared.draft.subject,
          createdAt: new Date().toISOString()
        }
      );

      pipeline.authorizeAutonomousOutreach(prepared.draft.id, {
        reason: "Autonomous sales policy with recorded consent"
      });

      await this.store.recordEvent(
        "approval:" + prepared.draft.id,
        "outreach.approved",
        {
          draftId: prepared.draft.id,
          leadId: added.lead.id,
          mode: "autonomous_policy",
          approvedAt: new Date().toISOString()
        }
      );

      const result = await pipeline.sendApprovedOutreach({
        draftId: prepared.draft.id,
        recipientAddress: record.email,
        sender: {
          address: this.env.RESEND_FROM,
          replyTo: this.env.RESEND_REPLY_TO || this.env.RESEND_FROM,
          verified: true
        },
        policy: {
          allowedChannels: ["email"],
          requireConsent: this.env.AUTONOMOUS_REQUIRE_CONSENT === "true",
          requireUnsubscribeMechanism: true,
          hasUnsubscribeMechanism: true
        },
        consent: enriched.consentState,
        consentEvidence: enriched.consentEvidence,
        directMarketingPolicy
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
    const type = event?.type;
    if (!type || !type.startsWith("email.")) return { ignored: true };

    const data = event.data || {};
    const eventId = event.id || data.email_id || (type + ":" + String(data.from || data.to || "unknown"));
    const fresh = await this.store.recordEvent(eventId, type, event);
    if (!fresh) return { duplicate: true };

    const recipientsRaw = data.to ?? data.email?.to ?? data.recipient ?? [];
    const recipients = (Array.isArray(recipientsRaw) ? recipientsRaw : [recipientsRaw])
      .flatMap((item) => typeof item === "string" ? [item] : Array.isArray(item) ? item : [])
      .map((item) => {
        const match = String(item).match(/<([^>]+)>/);
        return String(match?.[1] || item).trim().toLowerCase();
      })
      .filter((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address));

    if (type === "email.bounced" || type === "email.complained") {
      const reason = type === "email.complained" ? "complaint" : "bounced";
      let suppressed = 0;
      for (const email of recipients) {
        if (typeof this.store.suppressEmail === "function") {
          await this.store.suppressEmail({ email, reason, source: "resend_webhook", at: new Date().toISOString() });
          suppressed++;
        }
      }
      return { processed: true, type, suppressed, recipients: recipients.length };
    }

    if (type !== "email.received") {
      return { processed: true, type, suppressed: 0 };
    }

    const sender = parseSender(data.from);
    const lead = await this.store.findLeadByEmail(sender);
    if (!lead) return { matched: false, handoff: false };

    const received = await this.fetchInboundContent(data.email_id);
    const reply = {
      subject: data.subject ?? received.subject ?? "",
      body: received.text ?? data.text ?? received.html ?? data.html ?? ""
    };
    const classification = classifyReply(reply);

    if (classification.classification === "negative") {
      const body = String(reply.body || "").toLowerCase();
      const explicitOptOut = /\b(stop|unsubscribe|remove me|do not contact|don't contact|opt out|opt-out)\b/.test(body);
      await this.store.upsertLead({
        ...lead,
        stage: "closed_lost",
        payload: { ...lead.payload, replyClassification: "negative", suppression: explicitOptOut ? "unsubscribed" : null },
        lastOutreachAt: lead.last_outreach_at,
        handoffAt: lead.handoff_at
      });
      await this.store.revokeConsent({
        email: sender,
        source: explicitOptOut ? "recipient explicit opt-out reply" : "recipient negative reply",
        at: new Date().toISOString(),
        method: "reply_classification"
      });
      if (explicitOptOut && typeof this.store.suppressEmail === "function") {
        await this.store.suppressEmail({ email: sender, reason: "unsubscribed", source: "recipient_reply", at: new Date().toISOString() });
      }
      return { matched: true, classification: classification.classification, handoff: false, suppressed: explicitOptOut };
    }

    if (!classification.handoff) {
      return { matched: true, classification: classification.classification, handoff: false };
    }

    const handoff = createHandoff({ lead, reply, classification });
    await this.store.upsertLead({
      ...lead,
      stage: "human_handoff",
      payload: { ...lead.payload, handoff },
      lastOutreachAt: lead.last_outreach_at,
      handoffAt: handoff.handoffAt
    });
    if (this.notify) await this.notify(handoff);
    return { matched: true, classification: "positive", handoff: true, handoff };
  }}

function envBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return value === "true";
}

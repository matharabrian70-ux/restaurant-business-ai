import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

import { createConfiguredTransport } from "./src/sales/provider-factory.js";
import { sendControlledTestEmail, sendControlledProposalEmail } from "./src/sales/test-send.js";
import { SalesControlPlane } from "./src/sales/control-plane.js";
import { createControlCentreApi } from "./src/sales/control-centre-api.js";
import { renderControlCentre } from "./src/sales/control-centre-ui.js";
import { AutonomousWorker } from "./src/autonomy/worker.js";
import { createHandoffNotifier } from "./src/autonomy/notify.js";
import { verifyResendWebhook } from "./src/autonomy/resend-webhook.js";
import { runDiscoveryOnlyTest } from "./src/autonomy/discovery-test.js";
import { PostgresAutonomyStore } from "./src/autonomy/postgres-store.js";
import { ComplianceStore } from "./src/sales/compliance-store.js";
import { createManualSalesRuntime } from "./src/sales/manual-batch.js";
import { extractSenderAddress } from "./src/sales/production-email-config.js";

const port = Number(process.env.PORT || 10000);

function tokensMatch(expected, supplied) {
  if (!expected || !supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function autonomyTokenMatches(env, req) {
  const auth = req.headers.authorization || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return tokensMatch(env.AUTONOMY_CONTROL_TOKEN, supplied);
}

export function buildServer(
  env = process.env,
  transport = null,
  controlPlane = new SalesControlPlane()
) {
  const configuredTransport =
    transport || createConfiguredTransport(env);

  const complianceStore = new ComplianceStore();
  const manualSalesRuntime = createManualSalesRuntime({
    controlPlane,
    transport: configuredTransport,
    suppressionStore: complianceStore.suppressions,
    env
  });

  const handleControlRequest = createControlCentreApi({
    controlPlane,
    controlToken: env.CONTROL_PLANE_TOKEN,
    timingSafeEqual
  });

  async function attemptApprovedManualSend(draftId, recipientAddress) {
    const gates = manualSalesRuntime.getSendingStatus();
    if (!gates.enabled) return manualSalesRuntime.sendApprovedDraft({ draftId });
    if (!env.DATABASE_URL) {
      return manualSalesRuntime.recordSendOutcome(draftId, {
        status: "blocked",
        reason: "Persistent consent and suppression checks are unavailable because DATABASE_URL is not configured."
      });
    }
    const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
    try {
      await store.init();
      if (await store.isSuppressed(recipientAddress)) {
        const suppression = await store.getSuppression(recipientAddress);
        return manualSalesRuntime.recordSendOutcome(draftId, {
          status: "blocked",
          reason: "Recipient is suppressed (" + suppression.reason + "); no message was sent."
        });
      }
      const consent = await store.getConsentByEmail(recipientAddress);
      if (!consent || consent.state !== "allowed" || !consent.source || !consent.consented_at) {
        return manualSalesRuntime.recordSendOutcome(draftId, {
          status: "blocked",
          reason: "No current, persisted recipient consent evidence is recorded; no message was sent."
        });
      }
      return await manualSalesRuntime.sendApprovedDraft({ draftId });
    } catch (error) {
      return manualSalesRuntime.recordSendOutcome(draftId, {
        status: "blocked",
        reason: "Safety preflight failed closed; no message was sent. " + error.message
      });
    } finally {
      await store.close().catch(() => {});
    }
  }

  return http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json"
      });

      res.end(JSON.stringify({
        status: "ok",
        service: "restaurant-business-ai",
        providerEnabled:
          env.SALES_PROVIDER_ENABLED === "true"
      }));

      return;
    }

    if (req.method === "GET" && pathname === "/control/metrics") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const store = new PostgresAutonomyStore({
        connectionString: env.DATABASE_URL
      });

      try {
        await store.init();
        const [persistentLeads, events] = await Promise.all([
          store.listLeads({ limit: 500 }),
          store.listEvents({ limit: 2000 })
        ]);

        const queue = controlPlane.listQueue({ limit: 100 });
        const approvals = controlPlane.listApprovals();
        const preparedStates = manualSalesRuntime.listPreparedDrafts();
        const preparedDrafts = preparedStates.flatMap(state => state.drafts || []);

        const eventCount = (type) =>
          events.filter(event => event.event_type === type).length;

        const interested = persistentLeads.filter(lead =>
          ["engaged", "human_handoff", "closed_won"].includes(lead.stage)
        ).length;

        const customers = persistentLeads.filter(
          lead => lead.stage === "closed_won"
        ).length;

        const revenueEvents = events.filter(event =>
          ["customer.payment", "revenue.recorded"].includes(event.event_type)
        );
        const revenue = revenueEvents.reduce((sum, event) => {
          const amount = Number(event.payload?.amount ?? event.payload?.revenue ?? 0);
          return Number.isFinite(amount) ? sum + amount : sum;
        }, 0);

        const metrics = {
          leads: Math.max(queue.length, persistentLeads.length),
          drafted: Math.max(
            preparedDrafts.length,
            eventCount("outreach.drafted")
          ),
          approved: Math.max(
            approvals.filter(a => a.status === "approved").length,
            eventCount("outreach.approved")
          ),
          sent: eventCount("outreach.sent"),
          delivered: eventCount("email.delivered"),
          replied: eventCount("email.received"),
          interested,
          customers,
          revenue,
          pendingApprovals: approvals.filter(a => a.status === "pending").length,
          blocked: eventCount("outreach.blocked"),
          failed: eventCount("outreach.failed"),
          bounced: eventCount("email.bounced"),
          complained: eventCount("email.complained"),
          lastActivityAt: events[0]?.created_at ?? null,
          lastActivityType: events[0]?.event_type ?? null
        };

        await store.close();
        res.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store"
        });
        res.end(JSON.stringify({ metrics }));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(503, {"content-type":"application/json"});
        res.end(JSON.stringify({
          error: "metrics_unavailable",
          detail: error.message
        }));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/control") {
      if (!env.CONTROL_PLANE_TOKEN) {
        res.writeHead(503, {
          "content-type": "text/plain; charset=utf-8"
        });

        res.end(
          "Control Centre is not configured."
        );

        return;
      }

      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });

      res.end(renderControlCentre());

      return;
    }

    if (req.method === "GET" && pathname === "/control/pilot/drafts") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      res.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"});
      res.end(JSON.stringify({
        drafts: manualSalesRuntime.listPreparedDrafts()
      }));
      return;
    }

    if (req.method === "POST" && pathname === "/control/pilot/prepare") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      try {
        const result = manualSalesRuntime.preparePilotBatch({ limit: 25 });
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/control/pilot/consent") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      let store = null;
      try {
        const body = JSON.parse(await readBody(req) || "{}");
        const states = manualSalesRuntime.listPreparedDrafts();
        const state = states.find((item) => item.pilotRecord.id === body.id);
        if (!state?.lead?.contact?.email) throw new Error("Prepared prospect with an email is required");
        const source = String(body.source || "").trim();
        if (source.length < 12) throw new Error("Provide a specific, verifiable consent evidence source (at least 12 characters)");
        if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required to persist consent evidence");
        store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
        await store.init();
        const consent = await store.recordConsent({
          email: state.lead.contact.email,
          source,
          at: body.at || new Date().toISOString(),
          method: "human_control_centre_documented_consent"
        });
        const result = manualSalesRuntime.recordRecipientConsent({
          id: body.id,
          source,
          at: body.at || new Date().toISOString()
        });
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ ...result, email: state.lead.contact.email, persisted: true, evidenceRef: consent.evidence_ref }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error.message }));
      } finally {
        if (store) await store.close().catch(() => {});
      }
      return;
    }

    if (req.method === "POST" && pathname === "/control/autonomy/consent") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const store = new PostgresAutonomyStore({
        connectionString: env.DATABASE_URL
      });

      try {
        const body = JSON.parse(await readBody(req) || "{}");
        const result = await store.recordConsent({
          email: body.email,
          source: body.source,
          at: body.at,
          method: body.method
        });
        await store.close();
        res.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"});
        res.end(JSON.stringify({
          status: "recorded",
          consent: result
        }));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/control/autonomy/revoke-consent") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const store = new PostgresAutonomyStore({
        connectionString: env.DATABASE_URL
      });

      try {
        const body = JSON.parse(await readBody(req) || "{}");
        const result = await store.revokeConsent({
          email: body.email,
          source: body.source || "operator recorded recipient opt-out",
          at: body.at,
          method: body.method || "opt_out"
        });
        await store.close();
        res.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"});
        res.end(JSON.stringify({
          status: "revoked",
          consent: result
        }));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/control/autonomy/consent") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const email = requestUrl.searchParams.get("email") || "";
      const store = new PostgresAutonomyStore({
        connectionString: env.DATABASE_URL
      });

      try {
        const consent = await store.getConsentByEmail(email);
        await store.close();
        res.writeHead(200, {"content-type": "application/json", "cache-control": "no-store"});
        res.end(JSON.stringify({ consent }));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/control/pilot/send-eligible") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (env.SALES_B2B_OUTREACH_ENABLED !== "true") {
        res.writeHead(403, {"content-type": "application/json"});
        res.end(JSON.stringify({
          error: "B2B direct outreach is disabled",
          eligible: 0
        }));
        return;
      }

      try {
        const result = await manualSalesRuntime.sendApprovedBatch({
          limit: 25,
          sender: {
            address: extractSenderAddress(env.RESEND_FROM),
            replyTo: env.RESEND_REPLY_TO || extractSenderAddress(env.RESEND_FROM),
            verified: env.RESEND_DOMAIN_VERIFIED === "true"
          }
        });

        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }


    if (req.method === "POST" && pathname === "/control/send-kill-switch") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req) || "{}");
        const sending = manualSalesRuntime.setUiKillSwitchOn(body.paused);
        let auditWarning = null;
        if (env.DATABASE_URL) {
          const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
          try {
            await store.init();
            await store.recordEvent(
              "send-kill-switch:" + new Date().toISOString(),
              body.paused ? "outreach.kill_switch_paused" : "outreach.kill_switch_resumed",
              { paused: body.paused, actor: "human_control_centre", reasons: sending.reasons }
            );
          } catch (error) {
            auditWarning = "Switch changed in this running instance, but audit persistence failed: " + error.message;
          } finally {
            await store.close().catch(() => {});
          }
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ sending, auditWarning }));
      } catch (error) {
        res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error.message || "kill_switch_action_failed" }));
      }
      return;
    }

    if (req.method === "GET" && pathname === "/control/send-status") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ sending: manualSalesRuntime.getSendingStatus() }));
      return;
    }

    if (req.method === "GET" && pathname === "/control/activity") {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
      try {
        await store.init();
        const events = await store.listEvents({ limit: 100 });
        const prepared = manualSalesRuntime.listPreparedDrafts().flatMap((state) =>
          (state.drafts || []).map((draft) => ({
            id: "draft:" + draft.id,
            type: draft.sendOutcome?.status || draft.status || "draft",
            created_at: draft.sendOutcome?.updatedAt || draft.approvedAt || draft.createdAt || null,
            payload: {
              draftId: draft.id,
              leadId: draft.leadId,
              recipient: state.lead?.contact?.email || null,
              subject: draft.subject || "",
              reason: draft.sendOutcome?.reason || (draft.status === "draft" ? "Awaiting human approval." : "")
            }
          }))
        );
        await store.close();
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ activity: [...events.map((event) => ({
          id: event.event_id,
          type: event.event_type,
          created_at: event.created_at,
          payload: event.payload
        })), ...prepared].sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        ).slice(0, 100) }));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(503, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "activity_unavailable", detail: error.message }));
      }
      return;
    }

    const approvalActionMatch = req.method === "POST"
      ? pathname.match(/^\/control\/approvals\/([^/]+)\/decide$/)
      : null;
    if (approvalActionMatch) {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req) || "{}");
        if (typeof body.approved !== "boolean") throw new Error("approved_boolean_required");
        const draftId = decodeURIComponent(approvalActionMatch[1]);
        const decision = manualSalesRuntime.decideDraft(
          draftId,
          body.approved,
          typeof body.reason === "string" ? body.reason.slice(0, 500) : ""
        );
        let sendOutcome = decision.sendOutcome;
        if (body.approved) {
          sendOutcome = await attemptApprovedManualSend(draftId, decision.lead?.contact?.email || "");
        }
        let persistenceWarning = null;
        if (env.DATABASE_URL) {
          const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
          try {
            await store.init();
            const eventType = !body.approved
              ? "outreach.rejected"
              : sendOutcome?.status === "sent"
                ? "outreach.sent"
                : sendOutcome?.status === "failed"
                  ? "outreach.failed"
                  : sendOutcome?.status === "blocked"
                    ? "outreach.blocked"
                    : "outreach.approved";
            await store.recordEvent(
              "control-ui:" + draftId + ":" + eventType + ":" + new Date().toISOString(),
              eventType,
              {
                draftId,
                leadId: decision.approval?.leadId || decision.lead?.id || null,
                recipient: decision.lead?.contact?.email || null,
                reason: sendOutcome?.reason || body.reason || "",
                sendStatus: sendOutcome?.status || (body.approved ? "approved" : "rejected")
              }
            );
          } catch (error) {
            persistenceWarning = "Action completed but activity persistence failed: " + error.message;
          } finally {
            await store.close().catch(() => {});
          }
        } else {
          persistenceWarning = "DATABASE_URL is not configured; action activity was not persisted.";
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({
          approval: decision.approval,
          sendOutcome: sendOutcome || { status: body.approved ? "approved" : "rejected" },
          persistenceWarning
        }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error.message || "approval_action_failed" }));
      }
      return;
    }


    const retrySendMatch = req.method === "POST"
      ? pathname.match(/^\/control\/approvals\/([^/]+)\/send$/)
      : null;
    if (retrySendMatch) {
      const authorization = req.headers.authorization || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      try {
        const draftId = decodeURIComponent(retrySendMatch[1]);
        const state = manualSalesRuntime.listPreparedDrafts().find((item) => (item.drafts || []).some((draft) => draft.id === draftId));
        const recipientAddress = state?.lead?.contact?.email || "";
        const sendOutcome = await attemptApprovedManualSend(draftId, recipientAddress);
        let persistenceWarning = null;
        if (env.DATABASE_URL) {
          const store = new PostgresAutonomyStore({ connectionString: env.DATABASE_URL });
          try {
            await store.init();
            const eventType = sendOutcome.status === "sent" ? "outreach.sent" :
              sendOutcome.status === "failed" ? "outreach.failed" : "outreach.blocked";
            await store.recordEvent(
              "control-ui:" + draftId + ":" + eventType + ":" + new Date().toISOString(),
              eventType,
              {
                draftId,
                recipient: null,
                reason: sendOutcome.reason || "",
                sendStatus: sendOutcome.status
              }
            );
          } catch (error) {
            persistenceWarning = "Send result returned but activity could not be persisted: " + error.message;
          } finally {
            await store.close().catch(() => {});
          }
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ sendOutcome, persistenceWarning }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: error.message || "send_retry_failed" }));
      }
      return;
    }

    if (pathname.startsWith("/control/")) {
      const handled = await handleControlRequest(
        req,
        res
      );

      if (handled) return;
    }

    if (req.method === "POST" && pathname === "/autonomy/discovery-test") {
      if (!autonomyTokenMatches(env, req)) {
        res.writeHead(401, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const store = new PostgresAutonomyStore({
        connectionString: env.DATABASE_URL
      });

      try {
        const result = await runDiscoveryOnlyTest({
          env,
          store
        });
        await store.close();
        res.writeHead(200, {"content-type":"application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        await store.close().catch(() => {});
        res.writeHead(503, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/autonomy/run") {
      if (!autonomyTokenMatches(env, req)) {
        res.writeHead(401, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      try {
        const worker = new AutonomousWorker({
          env,
          transport: configuredTransport,
          notify: env.AUTONOMY_HANDOFF_RECIPIENT
            ? createHandoffNotifier({
                transport: configuredTransport,
                recipient: env.AUTONOMY_HANDOFF_RECIPIENT,
                sender: env.RESEND_FROM
              })
            : null
        });
        const result = await worker.discoverAndSend();
        await worker.store.close();
        res.writeHead(200, {"content-type":"application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(503, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (req.method === "POST" && pathname === "/webhooks/resend") {
      const payload = await readBody(req);

      try {
        verifyResendWebhook({
          payload,
          id: req.headers["svix-id"],
          timestamp: req.headers["svix-timestamp"],
          signature: req.headers["svix-signature"],
          secret: env.RESEND_WEBHOOK_SECRET
        });

        const event = JSON.parse(payload);
        const worker = new AutonomousWorker({
          env,
          transport: configuredTransport,
          notify: env.AUTONOMY_HANDOFF_RECIPIENT
            ? createHandoffNotifier({
                transport: configuredTransport,
                recipient: env.AUTONOMY_HANDOFF_RECIPIENT,
                sender: env.RESEND_FROM
              })
            : null
        });
        await worker.store.init();
        const result = await worker.handleInbound(event);
        await worker.store.close();

        res.writeHead(200, {"content-type":"application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, {"content-type":"application/json"});
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (
      req.method === "POST" &&
      pathname === "/test-email"
    ) {
      const auth =
        req.headers.authorization || "";

      const suppliedToken =
        auth.startsWith("Bearer ")
          ? auth.slice(7)
          : "";

      if (
        !tokensMatch(
          env.SALES_TEST_TOKEN,
          suppliedToken
        )
      ) {
        res.writeHead(401, {
          "content-type": "application/json"
        });

        res.end(JSON.stringify({
          error: "unauthorized"
        }));

        return;
      }

      try {
        const result =
          await sendControlledTestEmail({
            env,
            transport: configuredTransport
          });

        res.writeHead(200, {
          "content-type": "application/json"
        });

        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(403, {
          "content-type": "application/json"
        });

        res.end(JSON.stringify({
          error: error.message
        }));
      }

      return;
    }


    if (req.method === "POST" && pathname === "/test-proposal-email") {
      const auth = req.headers.authorization || "";
      const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!tokensMatch(env.SALES_TEST_TOKEN, suppliedToken)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      try {
        const result = await sendControlledProposalEmail({
          env,
          transport: configuredTransport
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    res.writeHead(404, {
      "content-type": "application/json"
    });

    res.end(JSON.stringify({
      error: "not_found"
    }));
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const server = buildServer();

  server.listen(
    port,
    "0.0.0.0",
    () => {
      console.log(
        `restaurant-business-ai listening on port ${port}`
      );
    }
  );
}

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
    suppressionStore: complianceStore.suppressions
  });

  const handleControlRequest = createControlCentreApi({
    controlPlane,
    controlToken: env.CONTROL_PLANE_TOKEN,
    timingSafeEqual
  });

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
      const suppliedToken = authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

      if (!tokensMatch(env.CONTROL_PLANE_TOKEN, suppliedToken)) {
        res.writeHead(401, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      try {
        const body = JSON.parse(await readBody(req) || "{}");
        const result = manualSalesRuntime.recordRecipientConsent({
          id: body.id,
          source: body.source,
          at: body.at
        });
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(400, {"content-type": "application/json"});
        res.end(JSON.stringify({ error: error.message }));
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

import { AUDIT_ACTORS } from "./audit.js";

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function tokensMatch(expected, supplied, timingSafeEqual) {
  if (!expected || !supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export function createControlCentreApi({
  controlPlane,
  controlToken,
  timingSafeEqual
}) {
  if (!controlPlane) {
    throw new Error("Control plane is required");
  }

  return async function handleControlRequest(req, res) {
    if (!req.url?.startsWith("/control")) {
      return false;
    }

    const authorization = req.headers.authorization || "";
    const suppliedToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!tokensMatch(controlToken, suppliedToken, timingSafeEqual)) {
      json(res, 401, { error: "unauthorized" });
      return true;
    }

    try {
      if (req.method === "GET" && req.url === "/control/queue") {
        json(res, 200, {
          leads: controlPlane.listQueue()
        });
        return true;
      }

      if (req.method === "GET" && req.url === "/control/approvals") {
        json(res, 200, {
          approvals: controlPlane.listApprovals()
        });
        return true;
      }

      if (
        req.method === "GET" &&
        req.url.startsWith("/control/leads/")
      ) {
        const leadId = decodeURIComponent(
          req.url.slice("/control/leads/".length)
        );

        const lead = controlPlane.getLead(leadId);

        if (!lead) {
          json(res, 404, { error: "lead_not_found" });
          return true;
        }

        json(res, 200, {
          lead,
          audit: controlPlane.getAuditLog(leadId)
        });

        return true;
      }

      if (
        req.method === "POST" &&
        req.url.startsWith("/control/approvals/") &&
        req.url.endsWith("/decide")
      ) {
        const prefix = "/control/approvals/";
        const suffix = "/decide";

        const draftId = decodeURIComponent(
          req.url.slice(prefix.length, -suffix.length)
        );

        const body = await readJson(req);

        if (typeof body.approved !== "boolean") {
          json(res, 400, {
            error: "approved must be a boolean"
          });
          return true;
        }

        const approval = controlPlane.decideOutreachApproval(
          draftId,
          body.approved,
          {
            actor: AUDIT_ACTORS.HUMAN,
            reason: typeof body.reason === "string"
              ? body.reason.slice(0, 1000)
              : ""
          }
        );

        json(res, 200, { approval });
        return true;
      }

      json(res, 404, { error: "control_route_not_found" });
      return true;
    } catch (error) {
      json(res, 400, {
        error: error.message
      });

      return true;
    }
  };
}

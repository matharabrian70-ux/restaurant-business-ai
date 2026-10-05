import { timingSafeEqual } from "node:crypto";
import { AUDIT_ACTORS } from "./audit.js";
import { LEAD_STAGES } from "../core/types.js";

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });

  res.end(JSON.stringify(body));
}

function tokensMatch(expected, supplied) {
  if (!expected || !supplied) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    suppliedBuffer
  );
}

async function parseJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer
    .concat(chunks)
    .toString("utf8");

  if (!raw.trim()) {
    return {};
  }

  if (raw.length > 10000) {
    throw new Error("Request body too large");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
}

export function createControlCentreApi({
  controlPlane,
  controlToken
}) {
  if (!controlPlane) {
    throw new Error("controlPlane is required");
  }

  return async function handleControlCentre(req, res) {
    if (!req.url?.startsWith("/control")) {
      return false;
    }

    const authorization =
      req.headers?.authorization || "";

    const suppliedToken =
      authorization.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";

    if (!tokensMatch(controlToken, suppliedToken)) {
      json(res, 401, {
        error: "unauthorized"
      });

      return true;
    }

    if (
      req.method === "GET" &&
      req.url === "/control/queue"
    ) {
      const queue =
        controlPlane.listQueue({
          limit: 100
        });

      const stats = {
        total: queue.length,

        pendingApproval:
          queue.filter(
            lead =>
              lead.stage ===
              LEAD_STAGES.READY_FOR_OUTREACH
          ).length,

        engaged:
          queue.filter(
            lead =>
              lead.stage ===
              LEAD_STAGES.ENGAGED
          ).length,

        humanHandoff:
          queue.filter(
            lead =>
              lead.stage ===
              LEAD_STAGES.HUMAN_HANDOFF
          ).length,

        closedWon:
          queue.filter(
            lead =>
              lead.stage ===
              LEAD_STAGES.CLOSED_WON
          ).length
      };

      json(res, 200, {
        stats,
        queue
      });

      return true;
    }

    const leadMatch =
      req.url.match(
        /^\/control\/leads\/([^/]+)$/
      );

    if (
      req.method === "GET" &&
      leadMatch
    ) {
      const leadId =
        decodeURIComponent(
          leadMatch[1]
        );

      const lead =
        controlPlane.getLead(leadId);

      if (!lead) {
        json(res, 404, {
          error: "lead_not_found"
        });

        return true;
      }

      json(res, 200, {
        lead,
        audit:
          controlPlane.getAuditLog(
            leadId
          ),
        approvals:
          controlPlane.listApprovals({
            leadId
          })
      });

      return true;
    }

    if (
      req.method === "GET" &&
      req.url === "/control/approvals"
    ) {
      json(res, 200, {
        approvals:
          controlPlane.listApprovals()
      });

      return true;
    }

    if (
      req.method === "POST" &&
      req.url === "/control/approvals/approve-all"
    ) {
      try {
        const body = await parseJsonBody(req);
        const result = controlPlane.approveAllPendingOutreach({
          limit: Number.isInteger(body.limit) ? body.limit : 25,
          reason:
            typeof body.reason === "string"
              ? body.reason.slice(0, 500)
              : "Human operator approved the current outreach batch"
        });

        json(res, 200, result);
      } catch (error) {
        json(res, 400, { error: error.message });
      }

      return true;
    }

    const approvalMatch =
      req.url.match(
        /^\/control\/approvals\/([^/]+)\/decide$/
      );

    if (
      req.method === "POST" &&
      approvalMatch
    ) {
      try {
        const draftId =
          decodeURIComponent(
            approvalMatch[1]
          );

        const body =
          await parseJsonBody(req);

        if (
          typeof body.approved !==
          "boolean"
        ) {
          json(res, 400, {
            error:
              "approved_boolean_required"
          });

          return true;
        }

        const approval =
          controlPlane.decideOutreachApproval(
            draftId,
            body.approved,
            {
              actor:
                AUDIT_ACTORS.HUMAN,

              reason:
                typeof body.reason ===
                "string"
                  ? body.reason.slice(0, 500)
                  : ""
            }
          );

        json(res, 200, {
          approval
        });
      } catch (error) {
        json(res, 400, {
          error: error.message
        });
      }

      return true;
    }

    json(res, 404, {
      error: "not_found"
    });

    return true;
  };
}


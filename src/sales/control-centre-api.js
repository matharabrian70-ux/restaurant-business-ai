import { AUDIT_ACTORS } from "./audit.js";
import { LEAD_STAGES } from "../core/types.js";

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 10000) reject(new Error("Request body too large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

export function createControlCentreApi({ controlPlane, isAuthorized, getStats = null }) {
  if (!controlPlane) throw new Error("controlPlane is required");

  return async function handleControlCentre(req, res) {
    if (!req.url?.startsWith("/control")) return false;

    if (!isAuthorized(req)) {
      json(res, 401, { error: "unauthorized" });
      return true;
    }

    if (req.method === "GET" && req.url === "/control/queue") {
      const queue = controlPlane.listQueue({ limit: 100 });
      const stats = getStats ? getStats(queue) : {
        total: queue.length,
        pendingApproval: queue.filter(lead => lead.stage === LEAD_STAGES.READY_FOR_OUTREACH).length,
        engaged: queue.filter(lead => lead.stage === LEAD_STAGES.ENGAGED).length,
        humanHandoff: queue.filter(lead => lead.stage === LEAD_STAGES.HUMAN_HANDOFF).length,
        closedWon: queue.filter(lead => lead.stage === LEAD_STAGES.CLOSED_WON).length
      };
      json(res, 200, { stats, queue });
      return true;
    }

    const leadMatch = req.url.match(/^\/control\/leads\/([^/]+)$/);
    if (req.method === "GET" && leadMatch) {
      const leadId = decodeURIComponent(leadMatch[1]);
      const lead = controlPlane.getLead(leadId);
      if (!lead) {
        json(res, 404, { error: "lead_not_found" });
        return true;
      }
      json(res, 200, {
        lead,
        audit: controlPlane.getAuditLog(leadId),
        approvals: controlPlane.listApprovals({ leadId })
      });
      return true;
    }

    if (req.method === "GET" && req.url === "/control/approvals") {
      json(res, 200, { approvals: controlPlane.listApprovals() });
      return true;
    }

    const approvalMatch = req.url.match(/^\/control\/approvals\/([^/]+)\/decide$/);
    if (req.method === "POST" && approvalMatch) {
      try {
        const draftId = decodeURIComponent(approvalMatch[1]);
        const body = await parseJsonBody(req);
        if (typeof body.approved !== "boolean") {
          json(res, 400, { error: "approved_boolean_required" });
          return true;
        }

        const approval = controlPlane.decideOutreachApproval(
          draftId,
          body.approved,
          {
            actor: AUDIT_ACTORS.HUMAN,
            reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : ""
          }
        );
        json(res, 200, { approval });
      } catch (error) {
        json(res, 400, { error: error.message });
      }
      return true;
    }

    json(res, 404, { error: "not_found" });
    return true;
  };
}

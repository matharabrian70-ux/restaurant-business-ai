import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { createControlCentreApi } from "../src/sales/control-centre-api.js";
import { LEAD_STAGES } from "../src/core/types.js";

function createMockResponse() {
  return {
    status: null,
    headers: null,
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    }
  };
}

async function createApi() {
  const controlPlane = new SalesControlPlane({
    clock: (() => {
      let i = 0;
      return () =>
        `2026-10-04T00:00:0${i++}Z`;
    })()
  });

  const api = createControlCentreApi({
    controlPlane,
    controlToken: "test-control-token",
    timingSafeEqual: (a, b) => {
      if (a.length !== b.length) return false;

      let result = 0;

      for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
      }

      return result === 0;
    }
  });

  return {
    api,
    controlPlane
  };
}

test("Control Centre requires authentication", async () => {
  const { api } = await createApi();

  const req = {
    method: "GET",
    url: "/control/queue",
    headers: {}
  };

  const res = createMockResponse();

  const handled = await api(req, res);

  assert.equal(handled, true);
  assert.equal(res.status, 401);
});

test("Control Centre returns authorized lead queue", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-1",
    name: "Test Restaurant",
    priority: "high"
  });

  const req = {
    method: "GET",
    url: "/control/queue",
    headers: {
      authorization:
        "Bearer test-control-token"
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 200);

  const body = JSON.parse(res.body);

  assert.equal(body.leads.length, 1);
  assert.equal(
    body.leads[0].id,
    "lead-1"
  );
});

test("human approval can be decided through Control Centre", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-2",
    name: "Approval Restaurant"
  });

  controlPlane.transitionLead(
    "lead-2",
    { type: "researched" }
  );

  controlPlane.requestOutreachApproval(
    "lead-2",
    "draft-2"
  );

  const req = {
    method: "POST",
    url:
      "/control/approvals/draft-2/decide",
    headers: {
      authorization:
        "Bearer test-control-token"
    },

    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          approved: true,
          reason: "Reviewed by operator"
        })
      );
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 200);

  const body = JSON.parse(res.body);

  assert.equal(
    body.approval.status,
    "approved"
  );

  assert.equal(
    body.approval.decidedBy,
    "human"
  );

  assert.equal(
    controlPlane.getApproval("draft-2").status,
    "approved"
  );
});

test("browser cannot choose agent as approval actor", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-3",
    name: "Security Restaurant"
  });

  controlPlane.transitionLead(
    "lead-3",
    { type: "researched" }
  );

  controlPlane.requestOutreachApproval(
    "lead-3",
    "draft-3"
  );

  const req = {
    method: "POST",
    url:
      "/control/approvals/draft-3/decide",
    headers: {
      authorization:
        "Bearer test-control-token"
    },

    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          approved: true,
          actor: "agent"
        })
      );
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal

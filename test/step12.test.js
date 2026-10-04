import test from "node:test";
import assert from "node:assert/strict";
import { SalesControlPlane } from "../src/sales/control-plane.js";
import { createControlCentreApi } from "../src/sales/control-centre-api.js";

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
    controlToken: "test-control-token"
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

  assert.equal(body.queue.length, 1);
  assert.equal(
    body.queue[0].id,
    "lead-1"
  );

  assert.equal(body.stats.total, 1);
});

test("Control Centre can retrieve a lead", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-2",
    name: "Details Restaurant"
  });

  const req = {
    method: "GET",
    url: "/control/leads/lead-2",
    headers: {
      authorization:
        "Bearer test-control-token"
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 200);

  const body = JSON.parse(res.body);

  assert.equal(body.lead.id, "lead-2");
  assert.equal(
    body.lead.name,
    "Details Restaurant"
  );

  assert.ok(Array.isArray(body.audit));
  assert.ok(Array.isArray(body.approvals));
});

test("human approval can be decided through Control Centre", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-3",
    name: "Approval Restaurant"
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
    url: "/control/approvals/draft-3/decide",
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
    controlPlane.getApproval("draft-3").status,
    "approved"
  );
});

test("browser cannot choose agent as approval actor", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-4",
    name: "Security Restaurant"
  });

  controlPlane.transitionLead(
    "lead-4",
    { type: "researched" }
  );

  controlPlane.requestOutreachApproval(
    "lead-4",
    "draft-4"
  );

  const req = {
    method: "POST",
    url: "/control/approvals/draft-4/decide",
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

  assert.equal(res.status, 200);

  const body = JSON.parse(res.body);

  assert.equal(
    body.approval.decidedBy,
    "human"
  );

  assert.equal(
    controlPlane.getApproval("draft-4").status,
    "approved"
  );
});

test("invalid approval payload is rejected", async () => {
  const { api, controlPlane } =
    await createApi();

  controlPlane.addLead({
    id: "lead-5",
    name: "Validation Restaurant"
  });

  controlPlane.transitionLead(
    "lead-5",
    { type: "researched" }
  );

  controlPlane.requestOutreachApproval(
    "lead-5",
    "draft-5"
  );

  const req = {
    method: "POST",
    url: "/control/approvals/draft-5/decide",
    headers: {
      authorization:
        "Bearer test-control-token"
    },

    async *[Symbol.asyncIterator]() {
      yield Buffer.from(
        JSON.stringify({
          approved: "yes"
        })
      );
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 400);

  const body = JSON.parse(res.body);

  assert.equal(
    body.error,
    "approved_boolean_required"
  );
});

test("unknown lead returns 404", async () => {
  const { api } = await createApi();

  const req = {
    method: "GET",
    url: "/control/leads/does-not-exist",
    headers: {
      authorization:
        "Bearer test-control-token"
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 404);

  const body = JSON.parse(res.body);

  assert.equal(
    body.error,
    "lead_not_found"
  );
});

test("unknown control route returns 404", async () => {
  const { api } = await createApi();

  const req = {
    method: "GET",
    url: "/control/unknown",
    headers: {
      authorization:
        "Bearer test-control-token"
    }
  };

  const res = createMockResponse();

  await api(req, res);

  assert.equal(res.status, 404);

  const body = JSON.parse(res.body);

  assert.equal(
    body.error,
    "not_found"
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { renderControlCentre } from "../src/sales/control-centre-ui.js";

test("Control Centre browser script parses and exposes actionable delivery diagnostics", () => {
  const html = renderControlCentre();
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, "inline Control Centre script exists");
  try { new vm.Script(match[1], { filename: "control-centre-inline.js" }); }
  catch (error) { throw new Error(error.stack); }
  for (const marker of [
    'id="sendStatus"',
    'id="activityLog"',
    'id="sentCount"',
    'id="blockedCount"',
    'Approve & attempt send',
    'Retry send',
    'Record documented consent',
    '/control/send-status',
    '/control/activity'
  ]) assert.ok(html.includes(marker), "missing UI feature: " + marker);
});

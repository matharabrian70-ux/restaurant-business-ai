import test from "node:test";
import assert from "node:assert/strict";
import { buildContext, buildTwiml } from "./morning-brief.js";

test("buildContext keeps the Nairobi timezone and supplied inputs", () => {
  const context = buildContext({
    date: new Date("2026-10-17T04:00:00.000Z"),
    goals: "Close one qualified restaurant opportunity",
    tasks: "10 calls; 2 follow-ups",
    salesTarget: "10 qualified conversations",
  });

  assert.equal(context.date, "2026-10-17");
  assert.equal(context.timezone, "Africa/Nairobi");
  assert.equal(context.goals, "Close one qualified restaurant opportunity");
  assert.equal(context.tasks, "10 calls; 2 follow-ups");
  assert.equal(context.salesTarget, "10 qualified conversations");
});

test("buildTwiml escapes user-controlled text", () => {
  const twiml = buildTwiml("Focus <today> & win > yesterday");
  assert.match(twiml, /Focus &lt;today&gt; &amp; win &gt; yesterday/);
  assert.doesNotMatch(twiml, /Focus <today>/);
  assert.match(twiml, /<Response>/);
  assert.match(twiml, /<Say/);
});

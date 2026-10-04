import test from "node:test";
import assert from "node:assert/strict";
import { verifyResendWebhook } from "../src/autonomy/resend-webhook.js";
import { createHmac } from "node:crypto";

test("Resend webhook verification accepts a valid Svix signature", () => {
  const payload = JSON.stringify({ type: "email.received", data: { email_id: "evt-1" } });
  const id = "msg_1";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secretBytes = Buffer.from("step21-test-secret");
  const secret = "whsec_" + secretBytes.toString("base64");
  const signature = createHmac("sha256", secretBytes)
    .update(id + "." + timestamp + "." + payload)
    .digest("base64");

  assert.equal(
    verifyResendWebhook({
      payload,
      id,
      timestamp,
      signature: "v1," + signature,
      secret
    }),
    true
  );
});

test("Resend webhook verification rejects invalid signatures", () => {
  assert.throws(
    () => verifyResendWebhook({
      payload: "{}",
      id: "msg_1",
      timestamp: String(Math.floor(Date.now() / 1000)),
      signature: "v1,invalid",
      secret: "whsec_" + Buffer.from("step21-test-secret").toString("base64")
    }),
    /Invalid webhook signature/
  );
});

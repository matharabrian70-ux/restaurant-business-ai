export function createHandoffNotifier({ transport, recipient, sender }) {
  if (!transport?.send) throw new Error("Notification transport is required");
  if (!recipient) throw new Error("Handoff notification recipient is required");

  return async (handoff) => {
    const subject = `🔥 HOT RESTAURANT LEAD — ${handoff.restaurant}`;
    const body = [
      "A restaurant has replied positively to the autonomous sales system.",
      "",
      `Restaurant: ${handoff.restaurant}`,
      `Email: ${handoff.email}`,
      `Website: ${handoff.website ?? "not provided"}`,
      "",
      "Buying signals:",
      ...(handoff.buyingSignals ?? []).map((signal) => `- ${signal}`),
      "",
      "Their reply:",
      handoff.reply,
      "",
      "This is now your handover. Contact the restaurant personally."
    ].join("\n");

    return transport.send({
      id: `HANDOFF-${handoff.leadId}`,
      leadId: handoff.leadId,
      channel: "email",
      body,
      recipient,
      subject,
      from: sender,
      idempotencyKey: `HANDOFF-${handoff.leadId}`
    });
  };
}

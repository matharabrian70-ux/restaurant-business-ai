import { Transport } from "./transport.js";

export class EmailTransport extends Transport {
  constructor({ sendEmail, provider = "email" } = {}) {
    super();
    if (typeof sendEmail !== "function") throw new Error("EmailTransport requires an injected sendEmail function");
    this.provider = provider;
    this.sendEmail = sendEmail;
  }

  async send({ recipient, subject, body, leadId, outreachId }) {
    if (!recipient || !body) throw new Error("recipient and body are required");
    return this.sendEmail({ recipient, subject: subject || "", body, leadId, outreachId });
  }
}

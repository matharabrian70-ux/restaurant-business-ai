export class Transport {
  constructor(name) {
    this.name = name;
  }

  async send(message) {
    if (!message || !message.id) throw new Error("Message is required");
    throw new Error("Transport is not configured");
  }
}

export class DryRunTransport extends Transport {
  constructor() {
    super("dry-run");
  }

  async send(message) {
    if (!message?.id || !message?.channel || !message?.body) {
      throw new Error("Complete message is required");
    }
    return {
      provider: this.name,
      status: "simulated",
      messageId: "DRY-" + message.id
    };
  }
}

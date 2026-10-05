const CHANNELS = Object.freeze(["email", "whatsapp", "sms", "manual"]);

const PROTOTYPE_URL =
  "https://matharabrian70-ux.github.io/Restaurant-Website-Prototype/";

const PROTOTYPE_ATTACHMENT_URL =
  "https://github.com/matharabrian70-ux/Restaurant-Website-Prototype/archive/refs/heads/main.zip";

const PROTOTYPE_ATTACHMENT = Object.freeze({
  path: PROTOTYPE_ATTACHMENT_URL,
  filename: "Restaurant-Website-Prototype.zip"
});

const CUSTOMER_MENU_URL =
  "https://matharabrian70-ux.github.io/restaurant-ordering-platform/menu.html";

const CUSTOMER_CHECKOUT_URL =
  "https://matharabrian70-ux.github.io/restaurant-ordering-platform/cart.html";

function clean(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function researchSignals(research = {}) {
  const notes = Array.isArray(research.notes)
    ? research.notes.filter(Boolean).map(String)
    : [];

  const hasOrdering = research.hasOnlineOrdering === true;
  const hasDelivery = research.deliveryAvailable === true;
  const multipleBranches = research.multipleBranches === true;

  let angle = "direct-ordering";
  if (hasOrdering && hasDelivery) angle = "optimization";
  else if (hasOrdering) angle = "owned-channel";
  else if (!hasOrdering && hasDelivery) angle = "direct-sales";
  else if (!hasOrdering) angle = "digital-ordering";

  return {
    notes,
    hasOrdering,
    hasDelivery,
    multipleBranches,
    angle
  };
}

function buildMessageParts({ restaurantName, research = {} }) {
  const signals = researchSignals(research);
  const firstNote = clean(signals.notes[0]);
  const secondNote = clean(signals.notes[1]);

  const opening = firstNote
    ? `I took a look at ${restaurantName} before reaching out. ${firstNote}`
    : `I took a look at ${restaurantName} before reaching out and wanted to share a practical idea rather than send you a generic sales email.`;

  const solutionByAngle = {
    optimization:
      "Because you already have an online ordering/delivery path, I would not suggest replacing something that works. The opportunity is to make the direct channel feel more like a complete restaurant operating system: branded ordering, clearer delivery handling, customer order tracking, promotions, and a manager dashboard that gives your team better control.",
    "owned-channel":
      "If customers are already being directed to order digitally, the next step is to turn that into a stronger owned channel: a branded ordering experience that sits under your restaurant's identity, captures the order cleanly, and gives management better visibility instead of leaving the customer journey fragmented across separate tools.",
    "direct-sales":
      "The system I build is designed to turn a restaurant website into a direct sales channel. Customers can browse the menu, place an order, receive order updates, and follow delivery, while the restaurant team gets a manager dashboard for orders, menu changes, promotions and delivery operations.",
    "digital-ordering":
      "The main opportunity I see is giving customers a simple way to discover the menu and order directly from the restaurant. The system combines a branded customer menu with checkout, order management, delivery operations, tracking, promotions and reporting."
  };

  const branchLine = signals.multipleBranches
    ? "For a restaurant with multiple locations, the same platform can also give management a branch-by-branch view while keeping the customer experience consistent."
    : "The same platform can be structured around your current operation first and expanded later if you add branches.";

  const proof = secondNote
    ? `Another detail I noticed: ${secondNote}`
    : "";

  const paragraphs = [
    `Hello ${restaurantName} team,`,
    opening,
    solutionByAngle[signals.angle],
    branchLine,
    proof,
    "I have put together a working restaurant prototype so you can see the kind of customer experience I mean rather than having to imagine it from a sales description.",
    "The important part is that this is not just a restaurant website. The goal is to give the restaurant an owned digital ordering and operations layer that can be branded around your business and adapted to how your team actually works.",
    "If this looks relevant, I would be happy to show you the system and discuss what I would change specifically for your restaurant. There is no obligation to proceed.",
    "If you are not the person who handles this, I would appreciate it if you could point me to the manager or person responsible for digital operations.",
    "If you would rather not receive messages from me, just reply STOP and I will not follow up.",
    "Regards,",
    "Brian Mathara",
    "Mathara Digital"
  ].filter(Boolean);

  return {
    paragraphs,
    prototypeUrl: PROTOTYPE_URL,
    customerMenuUrl: CUSTOMER_MENU_URL,
    customerCheckoutUrl: CUSTOMER_CHECKOUT_URL,
    prototypeAttachment: PROTOTYPE_ATTACHMENT
  };
}

function buildEmail({ restaurantName, research = {} }) {
  const {
    paragraphs,
    prototypeUrl,
    customerMenuUrl,
    customerCheckoutUrl
  } = buildMessageParts({ restaurantName, research });
  return [
    paragraphs[0],
    "",
    ...paragraphs.slice(1, 4).flatMap((paragraph) => [paragraph, ""]),
    "Explore the working restaurant experience below. Use any of the green links to open the website pages:",
    "",
    "This is the Website Prototype:",
    prototypeUrl,
    "",
    "This is the Customer Menu:",
    customerMenuUrl,
    "",
    "This is the Checkout System:",
    customerCheckoutUrl,
    "",
    ...paragraphs.slice(5).flatMap((paragraph) => [paragraph, ""])
  ].join("\n").trim();
}

function buildHtmlEmail({ restaurantName, research = {} }) {
  const {
    paragraphs,
    prototypeUrl,
    customerMenuUrl,
    customerCheckoutUrl
  } = buildMessageParts({ restaurantName, research });
  const [greeting, ...rest] = paragraphs;
  const closingIndex = rest.findIndex((paragraph) => paragraph === "Regards,");
  const bodyParagraphs = closingIndex >= 0 ? rest.slice(0, closingIndex) : rest;
  const closing = closingIndex >= 0 ? rest.slice(closingIndex) : [];

  const bodyHtml = bodyParagraphs
    .map((paragraph) => `<p style="margin:0 0 18px;">${escapeHtml(paragraph)}</p>`)
    .join("");

  const closingHtml = closing
    .map((paragraph) => `<p style="margin:0 0 6px;">${escapeHtml(paragraph)}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
      <div style="background:#ffffff;border:1px solid #e3e7ed;border-radius:14px;padding:34px;box-shadow:0 2px 8px rgba(20,30,50,.05);">
        <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b6b8a;margin-bottom:22px;">
          Mathara Digital
        </div>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 24px;color:#111827;">
          A digital ordering idea for ${escapeHtml(restaurantName)}
        </h1>
        <p style="margin:0 0 22px;">${escapeHtml(greeting)}</p>
        ${bodyHtml}
        <div style="margin:8px 0 28px;padding:20px;background:#f7faf8;border:1px solid #dce9df;border-radius:12px;">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#172033;">See the working prototype</div>
          <div style="font-size:14px;line-height:1.5;color:#5b6575;margin-bottom:16px;">
            Open the live prototype or use the attached prototype package to explore it locally.
          </div>
          <div style="font-size:14px;line-height:1.5;color:#5b6575;margin-bottom:18px;">
            The website prototype is the first thing to explore. Use any of the green buttons below to open the website pages.
          </div>
          <div style="margin:0;">
            <div style="margin:0 0 10px;">
              <a href="${escapeHtml(prototypeUrl)}"
                 style="display:block;background:#168a4a;color:#ffffff;text-decoration:none;font-weight:700;text-align:center;padding:13px 18px;border-radius:999px;">
                This is the Website Prototype →
              </a>
            </div>
            <div style="margin:0 0 10px;">
              <a href="${escapeHtml(customerMenuUrl)}"
                 style="display:block;background:#168a4a;color:#ffffff;text-decoration:none;font-weight:700;text-align:center;padding:13px 18px;border-radius:999px;">
                This is the Customer Menu →
              </a>
            </div>
            <div style="margin:0;">
              <a href="${escapeHtml(customerCheckoutUrl)}"
                 style="display:block;background:#168a4a;color:#ffffff;text-decoration:none;font-weight:700;text-align:center;padding:13px 18px;border-radius:999px;">
                This is the Checkout System →
              </a>
            </div>
          </div>
        </div>
        ${closingHtml}
      </div>
    </div>
  </body>
</html>`;

}

function buildSubject(restaurantName, research = {}) {
  const { angle } = researchSignals(research);
  const subjects = {
    optimization: `An idea for improving ${restaurantName}'s direct ordering`,
    "owned-channel": `A stronger direct ordering channel for ${restaurantName}`,
    "direct-sales": `A direct ordering idea for ${restaurantName}`,
    "digital-ordering": `A digital ordering idea for ${restaurantName}`
  };
  return subjects[angle] ?? `A quick idea for ${restaurantName}`;
}

export function createOutreachDraft({ lead, research = {}, channel = "email" }) {
  if (!lead?.id) throw new Error("Lead is required");
  if (!CHANNELS.includes(channel)) throw new Error("Unsupported outreach channel");

  const restaurantName = clean(research.name) || clean(lead.name) || "your restaurant";
  const body = buildEmail({ restaurantName, research });
  const html = buildHtmlEmail({ restaurantName, research });

  return {
    id: `OUT-${lead.id}-${channel}`,
    leadId: lead.id,
    channel,
    subject: buildSubject(restaurantName, research),
    body,
    html,
    attachments: channel === "email" ? [PROTOTYPE_ATTACHMENT] : [],
    status: "draft",
    createdAt: new Date().toISOString(),
    requiresHumanApproval: true,
    personalization: {
      strategy: researchSignals(research).angle,
      researched: Boolean(research.researchedAt || research.notes?.length || research.website)
    }
  };
}

export function approveOutreach(draft, approver = "human") {
  if (!draft?.id) throw new Error("Outreach draft is required");
  if (approver !== "human") throw new Error("Only a human can approve outreach");
  return {
    ...draft,
    status: "approved",
    approvedBy: approver,
    approvedAt: new Date().toISOString()
  };
}

export function markOutreachSent(draft, sendResult = {}) {
  if (draft?.status !== "approved") throw new Error("Outreach must be human-approved before sending");
  return {
    ...draft,
    status: "sent",
    sentAt: new Date().toISOString(),
    sendResult
  };
}

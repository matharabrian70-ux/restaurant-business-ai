import twilio from "twilio";

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  MORNING_AGENT_TO_NUMBER,
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-5-mini",
  DAILY_GOALS = "Protect the most important work; make measurable progress on sales.",
  DAILY_TASKS = "Complete the highest-priority work first.",
  SALES_TARGET = "Make the planned sales calls and follow-ups.",
  MORNING_AGENT_ENABLED = "false",
} = process.env;

function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clean(text, max = 1800) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function buildContext({ date = new Date(), goals = DAILY_GOALS, tasks = DAILY_TASKS, salesTarget = SALES_TARGET } = {}) {
  return {
    date: date.toISOString().slice(0, 10),
    timezone: "Africa/Nairobi",
    goals: clean(goals),
    tasks: clean(tasks),
    salesTarget: clean(salesTarget),
  };
}

export async function generatePlan(context) {
  required("OPENAI_API_KEY", OPENAI_API_KEY);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "You are a concise personal morning planning agent. Create a realistic spoken briefing. Prioritize 1-3 outcomes, schedule the supplied tasks sensibly, include the sales target, identify one thing to avoid, and end with a short readiness question. Never invent calendar events, deadlines, numbers, or completed work. If information is missing, say so briefly.",
        },
        {
          role: "user",
          content: JSON.stringify(context),
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no briefing text");
  return clean(text, 3200);
}

export function buildTwiml(briefing) {
  const safe = xmlEscape(briefing);
  return `<Response><Say language="en-KE" voice="Polly.Joanna">${safe}</Say><Pause length="1"/><Say language="en-KE" voice="Polly.Joanna">Have a productive day.</Say></Response>`;
}

export async function placeCall(briefing) {
  required("TWILIO_ACCOUNT_SID", TWILIO_ACCOUNT_SID);
  required("TWILIO_AUTH_TOKEN", TWILIO_AUTH_TOKEN);
  required("TWILIO_FROM_NUMBER", TWILIO_FROM_NUMBER);
  required("MORNING_AGENT_TO_NUMBER", MORNING_AGENT_TO_NUMBER);

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client.calls.create({
    from: TWILIO_FROM_NUMBER,
    to: MORNING_AGENT_TO_NUMBER,
    twiml: buildTwiml(briefing),
  });
}

export async function run() {
  if (MORNING_AGENT_ENABLED !== "true") {
    console.log("Morning agent disabled; set MORNING_AGENT_ENABLED=true to place calls.");
    return { enabled: false };
  }

  const context = buildContext();
  const briefing = await generatePlan(context);
  const call = await placeCall(briefing);
  console.log(JSON.stringify({
    ok: true,
    date: context.date,
    callSid: call.sid,
    briefing,
  }));
  return { enabled: true, callSid: call.sid, briefing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

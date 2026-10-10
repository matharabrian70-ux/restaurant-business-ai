function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderControlCentre() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sales Control Centre</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
      background: #f5f7f9;
      color: #17202a;
    }

    header {
      background: #111827;
      color: white;
      padding: 20px 24px;
    }

    header h1 {
      margin: 0;
      font-size: 22px;
    }

    header p {
      margin: 5px 0 0;
      opacity: .7;
      font-size: 13px;
    }

    main {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 18px;
    }

    .auth,
    .card {
      background: white;
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,.06);
      margin-bottom: 18px;
    }

    .auth {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    input,
    textarea,
    button {
      font: inherit;
    }

    input {
      flex: 1;
      min-width: 240px;
      padding: 11px 13px;
      border: 1px solid #d6dbe1;
      border-radius: 9px;
    }

    button {
      border: 0;
      border-radius: 9px;
      padding: 11px 16px;
      cursor: pointer;
      font-weight: 600;
    }

    .primary {
      background: #16a34a;
      color: white;
    }

    .danger {
      background: #dc2626;
      color: white;
    }

    .muted {
      background: #e5e7eb;
      color: #111827;
    }

    .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-bottom:18px; }
    .status-banner { border:1px solid #fed7aa; background:#fff7ed; color:#9a3412; padding:14px 16px; border-radius:12px; margin-bottom:18px; line-height:1.5; }
    .status-banner.safe { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
    .status-pill { display:inline-flex; border-radius:999px; padding:4px 9px; font-size:12px; font-weight:700; background:#e5e7eb; color:#374151; }
    .status-pill.sent,.status-pill.delivered { background:#dcfce7; color:#166534; }
    .status-pill.blocked,.status-pill.failed,.status-pill.bounced { background:#fee2e2; color:#991b1b; }
    .status-pill.approved,.status-pill.pending { background:#fef3c7; color:#92400e; }
    .activity-row { border-bottom:1px solid #e5e7eb; padding:12px 0; display:grid; grid-template-columns:minmax(120px,.7fr) minmax(0,2fr); gap:10px; }
    .activity-row:last-child { border-bottom:0; }
    button:disabled { opacity:.55; cursor:wait; }
    .small { font-size:12px; color:#667085; }

    .funnel {
      display: grid;
      grid-template-columns: repeat(9, minmax(110px, 1fr));
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .funnel-step {
      min-width: 110px;
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      position: relative;
    }

    .funnel-step strong {
      display: block;
      font-size: 24px;
      margin-top: 5px;
    }

    .funnel-arrow {
      position: absolute;
      right: -8px;
      top: 50%;
      transform: translateY(-50%);
      color: #98a2b3;
      font-weight: 700;
      z-index: 2;
    }

    .activity {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
      padding: 10px 12px;
      background: #f8fafc;
      border-radius: 9px;
      color: #667085;
      font-size: 13px;
    }

    .stat {
      background: white;
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,.05);
    }

    .stat strong {
      display: block;
      font-size: 28px;
      margin-top: 6px;
    }

    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .lead,
    .approval {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 10px;
    }

    .lead {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }

    .lead-name {
      font-weight: 700;
    }

    .meta {
      color: #667085;
      font-size: 13px;
      margin-top: 4px;
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .approval-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    #message {
      margin-top: 10px;
      font-size: 14px;
    }

    @media (max-width: 800px) {
      .stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .funnel {
        grid-template-columns: repeat(9, minmax(130px, 1fr));
      }

      .lead {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <header>
    <h1>Sales Control Centre</h1>
    <p>Human oversight for the Restaurant Business AI sales pipeline</p>
  </header>

  <main>
    <section class="auth">
      <input
        id="token"
        type="password"
        placeholder="Control Centre token"
        autocomplete="off"
      >

      <button class="primary" onclick="connect()">
        Connect
      </button>

      <button class="muted" onclick="disconnect()">
        Disconnect
      </button>

      <button class="primary" onclick="preparePilot()">
        Prepare approved 25
      </button>

      <button class="primary" onclick="approveAllPending()">
        Approve all pending
      </button>

      <div id="message" role="status" aria-live="polite" aria-atomic="true"></div>
    </section>

    <section class="status-banner" id="sendStatus" role="status" aria-live="polite">Connect to check sending gates.</section>
    <section class="stats">
      <div class="stat">Leads<strong id="leadCount">0</strong></div>
      <div class="stat">Pending approvals<strong id="pendingCount">0</strong></div>
      <div class="stat">Sent<strong id="sentCount">0</strong></div>
      <div class="stat">Delivered<strong id="deliveredCount">0</strong></div>
      <div class="stat">Blocked<strong id="blockedCount">0</strong></div>
      <div class="stat">Failed<strong id="failedCount">0</strong></div>
      <div class="stat">High priority<strong id="highCount">0</strong></div>
      <div class="stat">Human handoffs<strong id="handoffCount">0</strong></div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Live Sales Funnel</h2>
        <button class="muted" onclick="loadMetrics()">Refresh metrics</button>
      </div>
      <div id="funnel" class="funnel">
        Connect to load live pipeline metrics.
      </div>
      <div id="activity" class="activity">
        <span>Last activity: —</span>
        <span>Pipeline state: waiting</span>
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Lead Queue</h2>
        <button class="muted" onclick="loadAll()">Refresh</button>
      </div>

      <div id="queue">
        Connect to load the queue.
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>AI-Generated Outreach</h2>
        <button class="muted" onclick="loadDrafts()">Refresh drafts</button>
      </div>

      <div id="drafts">
        Prepare the approved pilot batch to generate personalized drafts.
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Outreach Approvals</h2>
      </div>

      <div id="approvals">
        Connect to load approvals.
      </div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Send Activity & Block Reasons</h2>
        <button class="muted" onclick="loadActivity()">Refresh activity</button>
      </div>
      <div id="activityLog">Connect to load send activity.</div>
    </section>

    <section class="card">
      <div class="section-title">
        <h2>Lead Details</h2>
      </div>

      <div id="details">
        Select a lead to inspect it.
      </div>
    </section>
  </main>

<script>
  const TOKEN_KEY = "sales_control_centre_token";

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  let isLoadingAll = false;
  const pendingActions = new Set();

  function setMessage(message) {
    document.getElementById("message").textContent = message;
  }

  function setActionBusy(key, button, busy) {
    if (button) button.disabled = busy;
    if (busy) pendingActions.add(key);
    else pendingActions.delete(key);
  }

  function connect() {
    const token = document.getElementById("token").value.trim();

    if (!token) {
      setMessage("Enter the Control Centre token.");
      return;
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    document.getElementById("token").value = "";

    setMessage("Connected.");
    loadAll();
  }

  function disconnect() {
    sessionStorage.removeItem(TOKEN_KEY);
    document.getElementById("queue").textContent =
      "Disconnected.";
    document.getElementById("approvals").textContent =
      "Disconnected.";
    document.getElementById("details").textContent =
      "Select a lead to inspect it.";
    setMessage("Disconnected.");
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}), "Authorization": "Bearer " + token };
    if (options.body) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(path, { ...options, headers, signal: controller.signal, cache: "no-store" });
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Request timed out after 12 seconds. Check Render logs before retrying.");
      throw new Error("Network request failed: " + error.message);
    } finally { clearTimeout(timeout); }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { error: raw || "Server returned an unreadable response" }; }
    if (!response.ok) throw new Error((data.error || "Request failed") + (data.detail ? " — " + data.detail : ""));
    return data;
  }

  async function loadAll() {
    if (!getToken()) { setMessage("Not connected."); return; }
    if (isLoadingAll) return;
    isLoadingAll = true;
    try {
      const [queueData, approvalData, draftData, metricData, sendingData, activityData] = await Promise.all([
        api("/control/queue"), api("/control/approvals"), api("/control/pilot/drafts"),
        api("/control/metrics"), api("/control/send-status"), api("/control/activity")
      ]);
      renderQueue(queueData.queue || []);
      renderApprovals(approvalData.approvals || [], draftData.drafts || []);
      renderDrafts(draftData.drafts || []);
      updateStats(queueData.queue || [], approvalData.approvals || [], metricData.metrics || {});
      renderMetrics(metricData.metrics || {});
      renderSendingStatus(sendingData.sending || {});
      renderActivity(activityData.activity || []);
      setMessage("Synchronized at " + new Date().toLocaleTimeString() + ".");
    } catch (error) {
      setMessage("Could not synchronize: " + error.message);
    } finally { isLoadingAll = false; }
  }

  function updateStats(leads, approvals, metrics = {}) {
    document.getElementById("leadCount").textContent =
      leads.length;

    document.getElementById("pendingCount").textContent =
      approvals.filter(a => a.status === "pending").length;

    document.getElementById("highCount").textContent =
      leads.filter(
        lead => lead.priority === "high" ||
                lead.priority === "critical"
      ).length;

    document.getElementById("handoffCount").textContent =
      leads.filter(lead => lead.stage === "human_handoff").length;
    document.getElementById("sentCount").textContent = metrics.sent ?? 0;
    document.getElementById("deliveredCount").textContent = metrics.delivered ?? 0;
    document.getElementById("blockedCount").textContent = metrics.blocked ?? 0;
    document.getElementById("failedCount").textContent = metrics.failed ?? 0;
  }

  function renderQueue(leads) {
    const container = document.getElementById("queue");

    if (!leads.length) {
      container.textContent = "No leads in the queue.";
      return;
    }

    container.innerHTML = leads.map(lead => \`
      <div class="lead">
        <div>
          <div class="lead-name">
            \${escapeHtml(lead.name)}
          </div>

          <div class="meta">
            Stage: \${escapeHtml(lead.stage)}
            · Priority: \${escapeHtml(lead.priority)}
          </div>

          <div class="meta">
            Next action: \${escapeHtml(lead.nextAction)}
          </div>
        </div>

        <div class="actions">
          <button
            class="muted"
            onclick="loadLead('\${encodeURIComponent(lead.id)}')">
            View
          </button>
        </div>
      </div>
    \`).join("");
  }

  function renderApprovals(approvals, states = []) {
    const container = document.getElementById("approvals");
    const draftLookup = new Map(states.flatMap(state => (state.drafts || []).map(draft => [
      draft.id, { draft, lead: state.lead, email: state.lead?.contact?.email || "" }
    ])));
    if (!approvals.length) { container.textContent = "No outreach approvals."; return; }
    container.innerHTML = approvals.map(approval => {
      const pending = approval.status === "pending";
      const match = draftLookup.get(approval.draftId) || {};
      const draft = match.draft || {};
      const outcome = draft.sendOutcome || {};
      const sendStatus = outcome.status || (draft.status === "sent" ? "sent" : draft.status || "not attempted");
      const reason = outcome.reason || "";
      const subject = draft.subject || "Subject not available";
      const recipient = match.email || "No recipient address";
      const badge = '<span class="status-pill ' + escapeHtml(sendStatus) + '">' + escapeHtml(sendStatus) + '</span>';
      const actions = pending
        ? '<div class="approval-actions"><button class="primary" onclick="decideApproval(\'' + encodeURIComponent(approval.draftId) + '\',true,this)">Approve & attempt send</button><button class="danger" onclick="decideApproval(\'' + encodeURIComponent(approval.draftId) + '\',false,this)">Reject</button></div>'
        : (approval.status === "approved" && sendStatus !== "sent"
          ? '<div class="approval-actions"><button class="primary" onclick="retrySend(\'' + encodeURIComponent(approval.draftId) + '\',this)">Retry send</button></div>'
          : "");
      return '<div class="approval"><strong>' + escapeHtml(match.lead?.name || approval.leadId) + '</strong>' +
        '<div class="meta">Draft: ' + escapeHtml(approval.draftId) + '</div>' +
        '<div class="meta">To: ' + escapeHtml(recipient) + '</div>' +
        '<div class="meta">Subject: ' + escapeHtml(subject) + '</div>' +
        '<div class="meta">Approval: <span class="status-pill ' + escapeHtml(approval.status) + '">' + escapeHtml(approval.status) + '</span> · Send: ' + badge + '</div>' +
        (reason ? '<div class="meta" style="color:#b91c1c">Reason: ' + escapeHtml(reason) + '</div>' : "") +
        actions + '</div>';
    }).join("");
  }

  function renderSendingStatus(sending) {
    const box = document.getElementById("sendStatus");
    const gates = [
      "Kill switch: " + (sending.killSwitchOn ? "ON" : "OFF"),
      "Provider: " + (sending.providerEnabled ? "enabled" : "disabled"),
      "B2B outreach: " + (sending.b2bOutreachEnabled ? "enabled" : "disabled"),
      "Test mode: " + (sending.testMode ? "ON" : "OFF"),
      "Sender domain verified: " + (sending.senderDomainVerified ? "yes" : "no")
    ];
    box.className = "status-banner" + (sending.enabled ? " safe" : "");
    box.innerHTML = "<strong>Live sending " + (sending.enabled ? "READY" : "BLOCKED") + "</strong><div>" +
      gates.map(escapeHtml).join(" · ") + "</div>" +
      (sending.reasons && sending.reasons.length
        ? "<ul>" + sending.reasons.map(reason => "<li>" + escapeHtml(reason) + "</li>").join("") + "</ul>"
        : "<p>Global gates are open. Per-recipient consent and suppression checks still apply.</p>");
  }

  async function loadActivity() {
    try {
      const data = await api("/control/activity");
      renderActivity(data.activity || []);
      setMessage("Activity refreshed at " + new Date().toLocaleTimeString() + ".");
    } catch (error) { setMessage("Activity refresh failed: " + error.message); }
  }

  function renderActivity(items) {
    const container = document.getElementById("activityLog");
    if (!items.length) { container.textContent = "No send attempts recorded."; return; }
    container.innerHTML = items.slice(0, 50).map(item => {
      const payload = item.payload || {};
      const type = item.type || "unknown";
      const status = payload.sendStatus || type.replace("outreach.", "");
      const reason = payload.reason || payload.error || "";
      return '<div class="activity-row"><div><span class="status-pill ' + escapeHtml(status) + '">' + escapeHtml(status) +
        '</span><div class="small">' + escapeHtml(item.created_at ? new Date(item.created_at).toLocaleString() : "Time unavailable") +
        '</div></div><div><strong>' + escapeHtml(payload.subject || payload.leadName || payload.leadId || payload.draftId || type) +
        '</strong><div class="meta">To: ' + escapeHtml(payload.recipient || "not recorded") +
        '</div><div class="meta">Event: ' + escapeHtml(type) + '</div>' +
        (reason ? '<div class="meta" style="color:#b91c1c">Reason: ' + escapeHtml(reason) + '</div>' : '') +
        '</div></div>';
    }).join("");
  }

  async function retrySend(encodedDraftId, button) {
    const draftId = decodeURIComponent(encodedDraftId);
    if (button && button.disabled) return;
    setActionBusy(draftId, button, true);
    setMessage("Retrying send for " + draftId + "…");
    try {
      const result = await api("/control/approvals/" + encodeURIComponent(draftId) + "/send", {
        method: "POST", body: JSON.stringify({})
      });
      setMessage("Send status: " + result.sendOutcome.status + ". " + (result.sendOutcome.reason || ""));
      await loadAll();
    } catch (error) { setMessage("Retry failed: " + error.message); }
    finally { setActionBusy(draftId, button, false); }
  }


  async function preparePilot() {
    try {
      const result = await api("/control/pilot/prepare", {
        method: "POST",
        body: JSON.stringify({})
      });

      setMessage(
        "Prepared " + result.prepared +
        " personalized drafts; " + result.noVerifiedEmail +
        " held because no verified public business email was found."
      );

      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function approveAllPending() {
    if (!confirm("Approve all currently pending outreach drafts? This records one explicit human batch approval.")) {
      return;
    }

    try {
      const result = await api("/control/approvals/approve-all", {
        method: "POST",
        body: JSON.stringify({
          limit: 25,
          reason: "Human operator explicitly approved the current 25-prospect batch"
        })
      });

      setMessage("Approved " + result.approved + " outreach drafts.");
      await loadAll();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadMetrics() {
    try {
      const data = await api("/control/metrics");
      renderMetrics(data.metrics);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function renderMetrics(metrics) {
    const labels = [
      ["Leads", metrics.leads],
      ["Drafted", metrics.drafted],
      ["Approved", metrics.approved],
      ["Sent", metrics.sent],
      ["Delivered", metrics.delivered],
      ["Replied", metrics.replied],
      ["Interested", metrics.interested],
      ["Customer", metrics.customers],
      ["Revenue", Number(metrics.revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})]
    ];

    document.getElementById("funnel").innerHTML = labels.map((item, index) =>
      '<div class="funnel-step">' +
        '<div>' + escapeHtml(item[0]) + '</div>' +
        '<strong>' + escapeHtml(item[1]) + '</strong>' +
        (index < labels.length - 1 ? '<span class="funnel-arrow">→</span>' : "") +
      '</div>'
    ).join("");

    const last = metrics.lastActivityAt
      ? new Date(metrics.lastActivityAt).toLocaleString()
      : "No persistent activity recorded yet";
    const type = metrics.lastActivityType || "waiting";
    document.getElementById("activity").innerHTML =
      "<span>Last activity: " + escapeHtml(last) + "</span>" +
      "<span>State: " + escapeHtml(type) +
      " · Pending approvals: " + escapeHtml(metrics.pendingApprovals) +
      " · Blocked: " + escapeHtml(metrics.blocked) +
      " · Bounced: " + escapeHtml(metrics.bounced) +
      " · Complaints: " + escapeHtml(metrics.complained) + "</span>";
  }

  async function loadDrafts() {
    try {
      const data = await api("/control/pilot/drafts");
      renderDrafts(data.drafts);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function renderDrafts(states) {
    const container = document.getElementById("drafts");
    const drafts = states.flatMap(state =>
      (state.drafts || []).map(draft => ({
        ...draft,
        restaurant: state.lead?.name || draft.leadId,
        email: state.lead?.contact?.email || "",
        pilotId: state.pilotRecord?.id || "",
        consentRecord: state.consentRecord || null
      }))
    );
    if (!drafts.length) { container.textContent = "No personalized drafts prepared yet."; return; }
    container.innerHTML = drafts.map(draft => {
      const consentStatus = draft.consentRecord
        ? "Evidence recorded: " + draft.consentRecord.source
        : "No documented consent evidence recorded";
      const sendOutcome = draft.sendOutcome || {};
      return '<div class="approval">' +
        '<strong>' + escapeHtml(draft.restaurant) + '</strong>' +
        '<div class="meta">To: ' + escapeHtml(draft.email) + '</div>' +
        '<div class="meta">Subject: ' + escapeHtml(draft.subject) + '</div>' +
        '<div class="meta">Draft status: ' + escapeHtml(draft.status) + '</div>' +
        '<div class="meta">Consent: ' + escapeHtml(consentStatus) + '</div>' +
        (sendOutcome.reason ? '<div class="meta" style="color:#b91c1c">Last send result: ' + escapeHtml(sendOutcome.status) + ' — ' + escapeHtml(sendOutcome.reason) + '</div>' : '') +
        '<div class="actions" style="margin-top:10px">' +
          (!draft.consentRecord && draft.pilotId ? '<button class="muted" onclick="recordConsent(\'' + encodeURIComponent(draft.pilotId) + '\',this)">Record documented consent…</button>' : '') +
        '</div>' +
        '<details style="margin-top:10px"><summary>Preview email</summary>' +
          '<pre style="white-space:pre-wrap;font:inherit;line-height:1.5;margin-top:10px">' + escapeHtml(draft.body) + '</pre>' +
        '</details>' +
      '</div>';
    }).join("");
  }

  async function recordConsent(encodedPilotId, button) {
    const id = decodeURIComponent(encodedPilotId);
    if (button && button.disabled) return;
    const source = prompt("Enter the specific, verifiable evidence that this recipient agreed to receive marketing email (for example, a recorded opt-in form or written request). A public website listing or published email address is not consent.");
    if (!source || source.trim().length < 12) {
      setMessage("Consent not recorded. A specific evidence source of at least 12 characters is required.");
      return;
    }
    setActionBusy("consent:" + id, button, true);
    setMessage("Recording consent evidence for " + id + "…");
    try {
      const result = await api("/control/pilot/consent", {
        method: "POST",
        body: JSON.stringify({ id, source: source.trim(), at: new Date().toISOString() })
      });
      setMessage("Consent evidence saved for " + result.email + " and persisted to PostgreSQL. This does not send email.");
      await loadAll();
    } catch (error) {
      setMessage("Consent could not be recorded: " + error.message);
    } finally { setActionBusy("consent:" + id, button, false); }
  }

  async function decideApproval(encodedDraftId, approved, button) {
    const draftId = decodeURIComponent(encodedDraftId);
    if (button && button.disabled) return;
    if (approved && !confirm("Approve this draft and attempt delivery? It will only send if the kill switch, provider, consent and compliance gates pass.")) return;
    setActionBusy(draftId, button, true);
    setMessage((approved ? "Approving and attempting send: " : "Rejecting: ") + draftId + "…");
    try {
      const result = await api("/control/approvals/" + encodeURIComponent(draftId) + "/decide", {
        method: "POST",
        body: JSON.stringify({
          approved,
          reason: approved ? "Approved by human operator from Control Centre" : "Rejected by human operator from Control Centre"
        })
      });
      const outcome = result.sendOutcome || {};
      setMessage(approved
        ? "Approval recorded. Send status: " + (outcome.status || "unknown") + ". " + (outcome.reason || "")
        : "Draft rejected; it will not be sent.");
      await loadAll();
    } catch (error) {
      setMessage("Action failed for " + draftId + ": " + error.message);
    } finally { setActionBusy(draftId, button, false); }
  }

  async function loadLead(encodedLeadId) {
    const leadId = decodeURIComponent(encodedLeadId);

    try {
      const data = await api(
        "/control/leads/" +
        encodeURIComponent(leadId)
      );

      document.getElementById("details").innerHTML = \`
        <div class="lead">
          <div>
            <div class="lead-name">
              \${escapeHtml(data.lead.name)}
            </div>

            <div class="meta">
              ID: \${escapeHtml(data.lead.id)}
            </div>

            <div class="meta">
              Stage: \${escapeHtml(data.lead.stage)}
            </div>

            <div class="meta">
              Source: \${escapeHtml(data.lead.source)}
            </div>

            <div class="meta">
              Website: \${escapeHtml(data.lead.website || "None")}
            </div>

            <div class="meta">
              Next action: \${escapeHtml(data.lead.nextAction)}
            </div>
          </div>
        </div>

        <h3>Audit history</h3>

        \${data.audit.length
          ? data.audit.map(event => \`
            <div class="approval">
              <strong>
                \${escapeHtml(event.action)}
              </strong>

              <div class="meta">
                Actor: \${escapeHtml(event.actor)}
              </div>

              <div class="meta">
                Time: \${escapeHtml(event.timestamp)}
              </div>
            </div>
          \`).join("")
          : "<p>No audit events.</p>"
        }
      \`;
    } catch (error) {
      setMessage(error.message);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Keep the operational view moving without requiring a manual refresh.
  setInterval(() => {
    if (getToken() && !isLoadingAll && pendingActions.size === 0) loadAll();
  }, 20000);
</script>
</body>
</html>`;
}

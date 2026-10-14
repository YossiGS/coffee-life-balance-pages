// Only the public project key belongs in this file. Tokens stay in page memory.
const PROJECT = "https://bxdrahegynkcfuzcrezb.supabase.co";
const PUBLIC_KEY = "sb_publishable_xAeUOEPCb0jEO1NO0uPQ4A_-cUqb9sg";
const CALLBACK = "https://coffeelifebalance.com/partner.html";
const VERIFIER_KEY = "clb-partner-pkce";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const status = document.querySelector("#status");
const login = document.querySelector("#login");
const logout = document.querySelector("#logout");
const form = document.querySelector("#redeem");
const dashboard = document.querySelector("#dashboard");
const picker = document.querySelector("#venue-picker");
const venueSelect = document.querySelector("#venue");
const dashStatus = document.querySelector("#dash-status");
const dashBody = document.querySelector("#dash-body");
const NUMBER = new Intl.NumberFormat("he-IL");
const DAY = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric" });
const WHEN = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
const RELATIVE = new Intl.RelativeTimeFormat("he", { numeric: "auto" });
const PROGRAM_STATES = { active: "פעילה", paused: "מושהית", draft: "טיוטה", ended: "הסתיימה" };
const CARD_STATES = { pending: "ממתין להכנה", written: "נכתב", verified: "נבדק", active: "פעיל", revoked: "בוטל" };
let session;
let user;
let busy = false;
let venues = [];
let current;
let ticket = 0;
const LOAD_FAILED = "לא ניתן לטעון את הנתונים. בדקו חיבור ונסו שוב.";

function message(text) { status.textContent = text; }
function signedIn(yes) {
  login.hidden = yes; logout.hidden = !yes; form.hidden = !yes;
  if (!yes) { ticket++; venues = []; current = null; dashboard.hidden = true; picker.hidden = true; dashBody.replaceChildren(); dashStatus.textContent = ""; }
}
async function request(path, body, token) {
  const response = await fetch(PROJECT + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result?.message ?? "Request failed"), { code: result?.code });
  return result;
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
login.addEventListener("click", async () => {
  if (busy) return;
  busy = true; login.disabled = true;
  try {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    sessionStorage.setItem(VERIFIER_KEY, JSON.stringify({ verifier, created: Date.now() }));
    const url = new URL(PROJECT + "/auth/v1/authorize");
    url.search = new URLSearchParams({ provider: "google", redirect_to: CALLBACK, code_challenge: challenge, code_challenge_method: "s256" });
    location.assign(url);
  } catch { message("לא ניתן להתחיל כניסה. יש לאפשר אחסון זמני בלשונית ולנסות שוב."); busy = false; login.disabled = false; }
});
logout.addEventListener("click", async () => {
  const token = session?.access_token;
  session = null; user = null; signedIn(false); form.reset();
  sessionStorage.removeItem(VERIFIER_KEY);
  message("יצאת מהעמוד.");
  if (token) {
    try {
      const response = await fetch(PROJECT + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: PUBLIC_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Logout not confirmed");
    } catch { message("פרטי הכניסה נמחקו מהעמוד. ביטול ההרשאה בשרת לא אושר; אפשר לבטל כניסות בהגדרות החשבון."); }
  }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !session || !user) return;
  const code = document.querySelector("#code").value.trim();
  if (!UUID.test(code)) { message("יש להזין קוד מימוש תקין."); return; }
  if (!window.confirm("האם אתם מוסרים כעת את ההטבה השמורה ללקוח?")) return;
  busy = true; form.querySelector("button").disabled = true; logout.disabled = true;
  try {
    const result = await request("/rest/v1/rpc/campaign_command", {
      expected_user: user.id, operation: "redeem", entry: { token: code },
    }, await accessToken());
    message(result.already_redeemed ? "הקוד כבר מומש. אין למסור הטבה נוספת." : "המימוש אושר. אפשר למסור ללקוח את ההטבה: " + result.title_he);
    form.reset();
  } catch { message("המימוש לא אושר. בדקו הרשאה לבית הקפה, קוד, תוקף וחיבור, ונסו שוב. ניסיון חוזר אינו מממש הטבה פעמיים."); }
  finally { busy = false; form.querySelector("button").disabled = false; logout.disabled = false; }
});
async function accessToken() {
  if (session.expires_at <= Date.now() / 1000 + 60) {
    const renewed = await request("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    session = { ...renewed, expires_at: Date.now() / 1000 + renewed.expires_in };
  }
  return session.access_token;
}
async function loyalty(operation, entry) {
  return request("/rest/v1/rpc/loyalty_command", { expected_user: user.id, operation, entry }, await accessToken());
}

// Dashboard: every server string goes through textContent; no customer identities exist in the payload.
function el(tag, attributes = {}, ...children) {
  const node = tag === "svg" || tag === "rect" || tag === "text"
    ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  for (const child of children) if (child != null) node.append(child);
  return node;
}
function text(tag, value, attributes) { const node = el(tag, attributes); node.textContent = String(value ?? ""); return node; }
function count(value) { return NUMBER.format(Number(value) || 0); }
function dayLabel(day) { return DAY.format(new Date(day + "T12:00:00Z")); }
function ago(seconds) {
  if (!seconds) return "עדיין לא נסרק";
  const minutes = Math.round((seconds - Date.now() / 1000) / 60);
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
  if (Math.abs(minutes) < 1440) return RELATIVE.format(Math.round(minutes / 60), "hour");
  return RELATIVE.format(Math.round(minutes / 1440), "day");
}
function card(title, ...children) { return el("section", { class: "card" }, text("h3", title), ...children); }
function chart(daily) {
  const max = Math.max(1, ...daily.map(d => Number(d.stamps) || 0));
  const total = daily.reduce((sum, d) => sum + (Number(d.stamps) || 0), 0);
  const svg = el("svg", { viewBox: "0 0 280 130", role: "img", class: "chart",
    "aria-label": `חותמות ב־14 הימים האחרונים: ${count(total)} בסך הכול, שיא של ${count(max)} ביום.` });
  daily.forEach((d, i) => {
    const height = Math.round((Number(d.stamps) || 0) / max * 100);
    svg.append(el("rect", { x: i * 20 + 2, y: 105 - height, width: 16, height: Math.max(height, 1), rx: 3 }));
    if (i % 3 === 1 || i === daily.length - 1) svg.append(text("text", dayLabel(d.day), { x: i * 20 + 10, y: 124, "text-anchor": "middle" }));
  });
  const table = el("table", { class: "visually-hidden" },
    el("thead", {}, el("tr", {}, text("th", "יום", { scope: "col" }), text("th", "חותמות", { scope: "col" }))),
    el("tbody", {}, ...daily.map(d => el("tr", {}, text("th", dayLabel(d.day), { scope: "row" }), text("td", count(d.stamps))))));
  return el("div", { dir: "ltr" }, svg, table);
}
function render(data, enter) {
  const program = data.program;
  const tiles = [["חברי מועדון", data.members], ["לקוחות חוזרים", data.returning_members], ["חותמות היום", data.stamps_today],
    ["חותמות ב־7 ימים", data.stamps_7d], ["חותמות ב־30 ימים", data.stamps_30d], ["הטבות שהונפקו", data.rewards_issued],
    ["הטבות שמומשו", data.rewards_redeemed], ["הטבות ממתינות", data.rewards_outstanding]];
  const kpis = el("ul", { class: "kpis" }, ...tiles.map(([label, value]) => el("li", {}, text("strong", count(value)), text("span", label))));
  const sections = [kpis, card("חותמות ב־14 הימים האחרונים", chart(data.daily ?? []))];
  if (program) {
    const summary = el("dl", { class: "facts" },
      text("dt", "הטבה"), text("dd", program.reward_title_he || program.reward_title_en),
      text("dt", "חותמות להטבה"), text("dd", count(program.stamps_per_reward)),
      text("dt", "תוקף ההטבה"), text("dd", `${count(program.reward_valid_days)} ימים`));
    const badge = text("span", PROGRAM_STATES[program.state] ?? program.state, { class: `badge ${program.state}` });
    let toggle = null;
    if (data.role !== "staff" && (program.state === "active" || program.state === "paused")) {
      toggle = text("button", program.state === "active" ? "השהיית התוכנית" : "חידוש התוכנית", { type: "button", id: "program-toggle", class: "secondary" });
      toggle.addEventListener("click", () => setProgramState(program, toggle));
    }
    sections.push(card("תוכנית הנאמנות", badge, summary, toggle));
  } else sections.push(card("תוכנית הנאמנות", text("p", "עדיין לא הוגדרה תוכנית לבית הקפה.")));
  const cards = data.cards ?? [];
  sections.push(card("כרטיסי NFC", cards.length ? el("ul", { class: "rows" }, ...cards.map(c => el("li", {},
    text("span", c.label), text("span", CARD_STATES[c.state] ?? c.state, { class: "badge" }), text("span", ago(c.last_tap_at), { class: "muted" }))))
    : text("p", "אין כרטיסים פעילים.")));
  const redemptions = data.recent_redemptions ?? [];
  sections.push(card("מימושים אחרונים", redemptions.length ? el("ul", { class: "rows" }, ...redemptions.map(r => el("li", {},
    text("span", r.title_he || r.title_en), text("span", WHEN.format(new Date(r.redeemed_at * 1000)), { class: "muted" }))))
    : text("p", "עדיין אין מימושים.")));
  dashBody.className = enter ? "enter" : "";
  dashBody.replaceChildren(...sections);
}
async function loadDashboard(enter = false) {
  if (!session || !user || !current) return;
  const mine = ++ticket;
  try {
    const data = await loyalty("partner_dashboard", { venue_id: current.venue_id });
    if (mine !== ticket) return;
    render(data, enter);
    if (dashStatus.textContent === LOAD_FAILED) dashStatus.textContent = "";
  } catch { if (mine === ticket) dashStatus.textContent = LOAD_FAILED; }
}
async function setProgramState(program, button) {
  const pausing = program.state === "active";
  if (!window.confirm(pausing ? "להשהות את תוכנית הנאמנות? לקוחות לא יקבלו חותמות עד לחידוש." : "לחדש את תוכנית הנאמנות?")) return;
  button.disabled = true;
  try {
    await loyalty("partner_set_program_state", { venue_id: current.venue_id, state: pausing ? "paused" : "active", revision: program.revision });
    dashStatus.textContent = pausing ? "התוכנית הושהתה." : "התוכנית חודשה.";
    await loadDashboard();
  } catch (error) {
    dashStatus.textContent = error.code === "40001" || /changed/i.test(error.message) ? "התוכנית השתנתה, רעננו" : "השינוי לא נשמר. בדקו הרשאה וחיבור ונסו שוב.";
    button.disabled = false;
  }
}
async function loadVenues() {
  try { venues = await loyalty("partner_venues", {}); } catch { venues = []; }
  if (!Array.isArray(venues) || !venues.length) return;
  venueSelect.replaceChildren(...venues.map((v, i) => text("option", v.name_he || v.name, { value: i })));
  picker.hidden = venues.length < 2;
  dashboard.hidden = false;
  current = venues[0];
  await loadDashboard(true);
}
venueSelect.addEventListener("change", () => { current = venues[Number(venueSelect.value)]; loadDashboard(true); });
setInterval(() => { if (document.visibilityState === "visible") loadDashboard(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadDashboard(); });
async function initialize() {
  const parameters = new URLSearchParams(location.search);
  const code = parameters.get("code");
  history.replaceState(null, "", location.pathname);
  if (!code) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(VERIFIER_KEY) ?? "null");
    sessionStorage.removeItem(VERIFIER_KEY);
    if (!saved || Date.now() - saved.created > 300000 || typeof saved.verifier !== "string") throw new Error("Expired login");
    const tokens = await request("/auth/v1/token?grant_type=pkce", { auth_code: code, code_verifier: saved.verifier });
    user = await request("/auth/v1/user", undefined, tokens.access_token);
    if (!UUID.test(user.id)) throw new Error("Invalid account");
    session = { ...tokens, expires_at: Date.now() / 1000 + tokens.expires_in };
    signedIn(true); message("נכנסת. אפשר להזין קוד לקוח; ההרשאה לבית הקפה נבדקת בכל מימוש.");
    await loadVenues();
  } catch { session = null; user = null; signedIn(false); message("הכניסה לא הושלמה. יש להתחיל כניסה מחדש באותה לשונית."); }
}
initialize();

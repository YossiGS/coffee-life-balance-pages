// Only the public project key belongs in this file. Tokens stay in page memory.
const PROJECT = "https://bxdrahegynkcfuzcrezb.supabase.co";
const PUBLIC_KEY = "sb_publishable_xAeUOEPCb0jEO1NO0uPQ4A_-cUqb9sg";
const CALLBACK = "https://coffelifebalance.space/partner.html";
const VERIFIER_KEY = "clb-partner-pkce";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const status = document.querySelector("#status");
const login = document.querySelector("#login");
const logout = document.querySelector("#logout");
const form = document.querySelector("#redeem");
let session;
let user;
let busy = false;

function message(text) { status.textContent = text; }
function signedIn(yes) { login.hidden = yes; logout.hidden = !yes; form.hidden = !yes; }
async function request(path, body, token) {
  const response = await fetch(PROJECT + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error("Request failed");
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
    if (session.expires_at <= Date.now() / 1000 + 60) {
      const renewed = await request("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      session = { ...renewed, expires_at: Date.now() / 1000 + renewed.expires_in };
    }
    const result = await request("/rest/v1/rpc/campaign_command", {
      expected_user: user.id, operation: "redeem", entry: { token: code },
    }, session.access_token);
    message(result.already_redeemed ? "הקוד כבר מומש. אין למסור הטבה נוספת." : "המימוש אושר. אפשר למסור ללקוח את ההטבה: " + result.title_he);
    form.reset();
  } catch { message("המימוש לא אושר. בדקו הרשאה לבית הקפה, קוד, תוקף וחיבור, ונסו שוב. ניסיון חוזר אינו מממש הטבה פעמיים."); }
  finally { busy = false; form.querySelector("button").disabled = false; logout.disabled = false; }
});
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
  } catch { session = null; user = null; signedIn(false); message("הכניסה לא הושלמה. יש להתחיל כניסה מחדש באותה לשונית."); }
}
initialize();

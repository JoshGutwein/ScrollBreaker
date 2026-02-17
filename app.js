/* ================== STORAGE KEYS ================== */
const K_POINTS = "sb_points";

const K_TRIAL_START = "sb_trialStartMs";
const K_TRIAL_POP_SEEN = "sb_trialPopupSeen";
const K_SUBSCRIBED = "sb_subscribed";

const K_CODES = {
  starbucks: "sb_code_starbucks",
  dunkin: "sb_code_dunkin",
  amazon: "sb_code_amazon"
};

/* Focus session */
const K_SESS_ACTIVE = "sb_sess_active";             // "true"/"false"
const K_SESS_TOTAL_MINS = "sb_sess_totalMins";      // number
const K_SESS_REMAIN_SECS = "sb_sess_remainSecs";    // number
const K_SESS_SEC_IN_MIN = "sb_sess_secInMin";       // 0..59
const K_SESS_THIS_MIN_DIRTY = "sb_sess_thisMinDirty"; // "true"/"false"
const K_SESS_CLEAN_MINS = "sb_sess_cleanMins";      // number
const K_SESS_DIRTY_MINS = "sb_sess_dirtyMins";      // number

/* ================== HELPERS ================== */
function getNum(key, fallback=0){
  const v = localStorage.getItem(key);
  return v === null ? fallback : Number(v);
}
function getStr(key, fallback=""){
  const v = localStorage.getItem(key);
  return v === null ? fallback : v;
}
function setStr(key, v){ localStorage.setItem(key, String(v)); }
function setNum(key, v){ localStorage.setItem(key, String(Number(v))); }

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function formatMMSS(totalSeconds){
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function daysBetween(msA, msB){
  return Math.floor(Math.abs(msA - msB) / (1000*60*60*24));
}

/* ================== TRIAL / PAYWALL ================== */
const TRIAL_DAYS = 7;

function isSubscribed(){
  return getStr(K_SUBSCRIBED, "false") === "true";
}
function trialStarted(){
  return localStorage.getItem(K_TRIAL_START) !== null;
}
function trialDaysLeft(){
  if (!trialStarted()) return TRIAL_DAYS;
  const start = getNum(K_TRIAL_START, Date.now());
  const used = daysBetween(Date.now(), start);
  return Math.max(0, TRIAL_DAYS - used);
}
function isPaywalled(){
  if (isSubscribed()) return false;
  if (!trialStarted()) return false;
  return trialDaysLeft() <= 0;
}

function enforcePaywall(){
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (file === "" || file === "index.html" || file === "checkout.html") return;
  if (isPaywalled()) location.href = "checkout.html";
}

/* ================== POINTS ================== */
function points(){ return getNum(K_POINTS, 0); }
function addPoints(n){
  setNum(K_POINTS, points() + Number(n));
}

/* ================== HEADER BADGES ================== */
function renderHeaderBadges(){
  setText("pointsBadge", points());
  const plan = document.getElementById("planBadge");
  if (!plan) return;

  if (isSubscribed()) plan.innerText = "Pro";
  else if (!trialStarted()) plan.innerText = "Trial: not started";
  else {
    const left = trialDaysLeft();
    plan.innerText = left > 0 ? `Trial: ${left} day(s) left` : "Trial ended";
  }
}

/* ================== REWARDS ================== */
function makeCode(brand){
  const n = Math.floor(1000 + Math.random()*9000);
  return `SB-${brand.toUpperCase()}-${n}`;
}

function revealMilestone(requiredPoints, brand){
  if (points() < requiredPoints){
    alert(`Locked. You need ${requiredPoints} points.`);
    return;
  }
  const key = K_CODES[brand];
  if (!localStorage.getItem(key)){
    localStorage.setItem(key, makeCode(brand));
  }
  renderRewardsUI();
}

function renderRewardsUI(){
  // If rewards page has these IDs, update them
  setText("totalPoints", points());

  const r50 = document.getElementById("reward50");
  const r100 = document.getElementById("reward100");
  const r150 = document.getElementById("reward150");

  if (r50) r50.classList.toggle("locked", points() < 50);
  if (r100) r100.classList.toggle("locked", points() < 100);
  if (r150) r150.classList.toggle("locked", points() < 150);

  setText("code_starbucks", localStorage.getItem(K_CODES.starbucks) || "—");
  setText("code_dunkin", localStorage.getItem(K_CODES.dunkin) || "—");
  setText("code_amazon", localStorage.getItem(K_CODES.amazon) || "—");
}

function copyAllCodes(){
  const s = localStorage.getItem(K_CODES.starbucks) || "—";
  const d = localStorage.getItem(K_CODES.dunkin) || "—";
  const a = localStorage.getItem(K_CODES.amazon) || "—";
  navigator.clipboard.writeText(`Starbucks: ${s}\nDunkin: ${d}\nAmazon: ${a}`);
  alert("Copied codes!");
}

/* ================== FOCUS SESSION LOGIC ==================
   - user sets minutes
   - countdown runs
   - you earn points ONLY at the end
   - each minute is "clean" unless touch happens during that minute
*/
function sessActive(){ return getStr(K_SESS_ACTIVE, "false") === "true"; }

function startSession(totalMins){
  const mins = Number(totalMins);
  if (!Number.isFinite(mins) || mins < 1){
    alert("Enter a valid number of minutes.");
    return;
  }

  setStr(K_SESS_ACTIVE, "true");
  setNum(K_SESS_TOTAL_MINS, mins);
  setNum(K_SESS_REMAIN_SECS, mins * 60);
  setNum(K_SESS_SEC_IN_MIN, 0);
  setStr(K_SESS_THIS_MIN_DIRTY, "false");
  setNum(K_SESS_CLEAN_MINS, 0);
  setNum(K_SESS_DIRTY_MINS, 0);

  setText("sessionResult", "");
  const res = document.getElementById("sessionResult");
  if (res) res.style.display = "none";

  renderSessionUI();
}

function startSessionFromInput(){
  const input = document.getElementById("sessionMinutes");
  if (!input) return;
  startSession(input.value);
}

function cancelSession(){
  setStr(K_SESS_ACTIVE, "false");
  renderSessionUI();
}

function markThisMinuteDirty(){
  if (!sessActive()) return;
  setStr(K_SESS_THIS_MIN_DIRTY, "true");
  renderSessionUI();
}

function tickOneSecond(){
  if (!sessActive()) return;

  let remain = getNum(K_SESS_REMAIN_SECS, 0);
  if (remain <= 0){
    completeSession();
    return;
  }

  // decrement one second
  remain -= 1;
  setNum(K_SESS_REMAIN_SECS, remain);

  // advance second-in-minute
  let secInMin = getNum(K_SESS_SEC_IN_MIN, 0);
  secInMin += 1;

  if (secInMin >= 60 || remain === 0){
    // A minute ended (or session ended)
    const dirty = getStr(K_SESS_THIS_MIN_DIRTY, "false") === "true";
    let cleanM = getNum(K_SESS_CLEAN_MINS, 0);
    let dirtyM = getNum(K_SESS_DIRTY_MINS, 0);

    if (dirty) dirtyM += 1;
    else cleanM += 1;

    setNum(K_SESS_CLEAN_MINS, cleanM);
    setNum(K_SESS_DIRTY_MINS, dirtyM);

    // reset minute tracking
    setStr(K_SESS_THIS_MIN_DIRTY, "false");
    secInMin = 0;
  }

  setNum(K_SESS_SEC_IN_MIN, secInMin);

  // if ended exactly now
  if (remain === 0){
    completeSession();
    return;
  }

  renderSessionUI();
}

function completeSession(){
  // stop session
  setStr(K_SESS_ACTIVE, "false");

  const cleanM = getNum(K_SESS_CLEAN_MINS, 0);
  const dirtyM = getNum(K_SESS_DIRTY_MINS, 0);

  // Award points ONLY NOW
  if (cleanM > 0) addPoints(cleanM);

  const msg = `Session complete! Clean minutes: ${cleanM} (+${cleanM} points). Dirty minutes: ${dirtyM} (0 points).`;

  const res = document.getElementById("sessionResult");
  if (res){
    res.style.display = "block";
    res.innerHTML = `<b>${msg}</b>`;
  } else {
    alert(msg);
  }

  renderHeaderBadges();
  renderRewardsUI();
  renderSessionUI();
}

function renderSessionUI(){
  // Update session widgets if they exist on dashboard
  const active = sessActive();
  const remain = getNum(K_SESS_REMAIN_SECS, 0);
  const cleanM = getNum(K_SESS_CLEAN_MINS, 0);
  const dirtyM = getNum(K_SESS_DIRTY_MINS, 0);
  const dirtyThis = getStr(K_SESS_THIS_MIN_DIRTY, "false") === "true";

  setText("timeLeft", active ? formatMMSS(remain) : "—");
  setText("cleanMins", cleanM);
  setText("dirtyMins", dirtyM);
  setText("thisMinuteStatus", active ? (dirtyThis ? "DIRTY (0 points)" : "CLEAN (will earn)") : "—");
}

let sessionTimer = null;
function ensureTimer(){
  // only run timer on pages that have session UI OR if session active
  const hasSessionUI = document.getElementById("timeLeft") !== null;
  if (!hasSessionUI && !sessActive()) return;

  if (sessionTimer) return;
  sessionTimer = setInterval(() => {
    if (sessActive()) tickOneSecond();
    else renderSessionUI();
  }, 1000);
}

/* Demo controls */
function demoTouch(){
  markThisMinuteDirty();
}
function fastForwardMinute(){
  if (!sessActive()){
    alert("Start a session first.");
    return;
  }
  // tick 60 times quickly
  for (let i=0;i<60;i++) tickOneSecond();
}

function resetToday(){
  localStorage.removeItem(K_POINTS);

  // reset rewards codes
  localStorage.removeItem(K_CODES.starbucks);
  localStorage.removeItem(K_CODES.dunkin);
  localStorage.removeItem(K_CODES.amazon);

  // reset session
  setStr(K_SESS_ACTIVE, "false");
  setNum(K_SESS_REMAIN_SECS, 0);
  setNum(K_SESS_SEC_IN_MIN, 0);
  setStr(K_SESS_THIS_MIN_DIRTY, "false");
  setNum(K_SESS_CLEAN_MINS, 0);
  setNum(K_SESS_DIRTY_MINS, 0);

  alert("Reset done.");
  location.reload();
}

/* ================== CHECKOUT (demo) ================== */
function submitCheckout(){
  const name = (document.getElementById("ccName")?.value || "").trim();
  const num = (document.getElementById("ccNumber")?.value || "").replace(/\s+/g,"");
  const exp = (document.getElementById("ccExp")?.value || "").trim();
  const cvc = (document.getElementById("ccCVC")?.value || "").trim();

  // basic validation (still demo)
  if (!name){ alert("Enter the name on the card."); return; }
  if (num.length < 12){ alert("Enter a valid card number."); return; }
  if (!exp){ alert("Enter expiry (MM/YY)."); return; }
  if (cvc.length < 3){ alert("Enter a valid CVC."); return; }

  setStr(K_SUBSCRIBED, "true");
  alert("Subscription activated (prototype).");
  location.href = "dashboard.html";
}

/* ================== INIT ================== */
document.addEventListener("DOMContentLoaded", () => {
  enforcePaywall();
  renderHeaderBadges();
  renderRewardsUI();
  renderSessionUI();
  ensureTimer();
});

/* Expose to HTML */
window.startSessionFromInput = startSessionFromInput;
window.cancelSession = cancelSession;

window.demoTouch = demoTouch;
window.fastForwardMinute = fastForwardMinute;
window.resetToday = resetToday;

window.revealMilestone = revealMilestone;
window.copyAllCodes = copyAllCodes;

window.submitCheckout = submitCheckout;

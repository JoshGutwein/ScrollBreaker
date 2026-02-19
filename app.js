/* ================== STORAGE KEYS ================== */
const K_POINTS = "bp_points";
const K_STREAK = "bp_streak";
const K_LAST_DAY = "bp_last_day";          // YYYY-MM-DD
const K_TODAY_CLEAN_MINS = "bp_today_clean_mins"; // number

// Focus session (timer)
const K_SESS_ACTIVE = "bp_sess_active"; // "true"/"false"
const K_SESS_REMAIN_SECS = "bp_sess_remain_secs";
const K_SESS_SEC_IN_MIN = "bp_sess_sec_in_min";
const K_SESS_THIS_MIN_DIRTY = "bp_sess_this_min_dirty";
const K_SESS_CLEAN_MINS = "bp_sess_clean_mins";
const K_SESS_DIRTY_MINS = "bp_sess_dirty_mins";

// Settings
const K_STREAK_TARGET = "bp_set_streak_target"; // default 60
const K_BED_START = "bp_set_bed_start";         // default 21 (9pm)
const K_BED_END = "bp_set_bed_end";             // default 23 (11pm)
const K_BED_MULT = "bp_set_bed_mult";           // default 2

const K_WORK_START = "bp_set_work_start";       // default 8
const K_WORK_END = "bp_set_work_end";           // default 15
const K_WORK_MULT = "bp_set_work_mult";         // default 2

const K_LATE_HOUR = "bp_set_late_hour";         // default 0 (midnight)
const K_LATE_PENALTY = "bp_set_late_penalty";   // default 10 (points removed when undock after 12)
const K_LATE_MULT = "bp_set_late_mult";         // default 0 (minutes after midnight earn 0 points)

// Rewards codes
const K_CODES = {
  starbucks: "bp_code_starbucks",
  dunkin: "bp_code_dunkin",
  amazon: "bp_code_amazon"
};

/* ================== HELPERS ================== */
function getNum(key, fallback=0){
  const v = localStorage.getItem(key);
  return v === null ? fallback : Number(v);
}
function getStr(key, fallback=""){
  const v = localStorage.getItem(key);
  return v === null ? fallback : v;
}
function setNum(key, v){ localStorage.setItem(key, String(Number(v))); }
function setStr(key, v){ localStorage.setItem(key, String(v)); }

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function pad2(n){ return String(n).padStart(2,"0"); }
function formatMMSS(totalSeconds){
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${pad2(m)}:${pad2(s)}`;
}

function todayKey(d=new Date()){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

/* ================== SETTINGS DEFAULTS ================== */
function ensureDefaults(){
  if (localStorage.getItem(K_STREAK_TARGET) === null) setNum(K_STREAK_TARGET, 60);

  if (localStorage.getItem(K_BED_START) === null) setNum(K_BED_START, 21);
  if (localStorage.getItem(K_BED_END) === null) setNum(K_BED_END, 23);
  if (localStorage.getItem(K_BED_MULT) === null) setNum(K_BED_MULT, 2);

  if (localStorage.getItem(K_WORK_START) === null) setNum(K_WORK_START, 8);
  if (localStorage.getItem(K_WORK_END) === null) setNum(K_WORK_END, 15);
  if (localStorage.getItem(K_WORK_MULT) === null) setNum(K_WORK_MULT, 2);

  if (localStorage.getItem(K_LATE_HOUR) === null) setNum(K_LATE_HOUR, 0);
  if (localStorage.getItem(K_LATE_PENALTY) === null) setNum(K_LATE_PENALTY, 10);
  if (localStorage.getItem(K_LATE_MULT) === null) setNum(K_LATE_MULT, 0);
}

/* ================== DAY ROLLOVER + STREAK ==================
Rule: if yesterday clean mins >= target, streak +1, else streak resets to 0.
We check rollover whenever the app opens and whenever a session ticks.
*/
function rolloverIfNeeded(){
  const last = getStr(K_LAST_DAY, "");
  const today = todayKey();

  if (last === "") {
    setStr(K_LAST_DAY, today);
    return;
  }
  if (last === today) return;

  const target = getNum(K_STREAK_TARGET, 60);
  const yesterdayMins = getNum(K_TODAY_CLEAN_MINS, 0);

  if (yesterdayMins >= target) {
    setNum(K_STREAK, getNum(K_STREAK, 0) + 1);
  } else {
    setNum(K_STREAK, 0);
  }

  // reset for new day
  setNum(K_TODAY_CLEAN_MINS, 0);
  setStr(K_LAST_DAY, today);
}

/* ================== POINTS + MULTIPLIERS ================== */
function points(){ return getNum(K_POINTS, 0); }
function addPoints(n){
  const next = Math.max(0, points() + Number(n));
  setNum(K_POINTS, next);
}

function hourNow(){ return new Date().getHours(); }

function inWindow(h, start, end){
  // start inclusive, end exclusive
  return h >= start && h < end;
}

function minuteMultiplierByTime(dateObj){
  const h = dateObj.getHours();

  const bedStart = getNum(K_BED_START, 21);
  const bedEnd = getNum(K_BED_END, 23);
  const bedMult = getNum(K_BED_MULT, 2);

  const workStart = getNum(K_WORK_START, 8);
  const workEnd = getNum(K_WORK_END, 15);
  const workMult = getNum(K_WORK_MULT, 2);

  const lateHour = getNum(K_LATE_HOUR, 0);
  const lateMult = getNum(K_LATE_MULT, 0);

  // Late-night rule first
  if (h >= lateHour && h < 6) return lateMult; // default 0 points between 12am–6am

  // Bedtime bonus
  if (inWindow(h, bedStart, bedEnd)) return bedMult;

  // Work/school focus bonus
  if (inWindow(h, workStart, workEnd)) return workMult;

  return 1;
}

/* ================== FOCUS SESSION ==================
You earn points only when a clean minute completes (at minute boundary),
and the multiplier depends on time-of-day for THAT minute.
*/
function sessActive(){ return getStr(K_SESS_ACTIVE, "false") === "true"; }

function startSession(totalMins){
  const mins = Number(totalMins);
  if (!Number.isFinite(mins) || mins < 1){
    alert("Enter a valid number of minutes.");
    return;
  }
  rolloverIfNeeded();

  setStr(K_SESS_ACTIVE, "true");
  setNum(K_SESS_REMAIN_SECS, mins * 60);
  setNum(K_SESS_SEC_IN_MIN, 0);
  setStr(K_SESS_THIS_MIN_DIRTY, "false");
  setNum(K_SESS_CLEAN_MINS, 0);
  setNum(K_SESS_DIRTY_MINS, 0);

  const res = document.getElementById("sessionResult");
  if (res) { res.style.display = "none"; res.innerHTML = ""; }

  renderAll();
}

function startSessionFromInput(){
  const input = document.getElementById("sessionMinutes");
  if (!input) return;
  startSession(input.value);
}

function cancelSession(){
  // If they cancel, treat it as "undock now"
  if (sessActive()) applyLatePenaltyIfNeeded("cancel");
  setStr(K_SESS_ACTIVE, "false");
  renderAll();
}

function demoTouch(){
  if (!sessActive()) return;
  setStr(K_SESS_THIS_MIN_DIRTY, "true");
  renderAll();
}

function tickOneSecond(){
  rolloverIfNeeded();
  if (!sessActive()) return;

  let remain = getNum(K_SESS_REMAIN_SECS, 0);
  if (remain <= 0){
    completeSession();
    return;
  }

  // decrement 1 second
  remain -= 1;
  setNum(K_SESS_REMAIN_SECS, remain);

  // advance second-in-minute
  let secInMin = getNum(K_SESS_SEC_IN_MIN, 0) + 1;

  const minuteEnded = (secInMin >= 60) || (remain === 0);

  if (minuteEnded){
    const dirty = getStr(K_SESS_THIS_MIN_DIRTY, "false") === "true";
    let cleanM = getNum(K_SESS_CLEAN_MINS, 0);
    let dirtyM = getNum(K_SESS_DIRTY_MINS, 0);

    if (dirty){
      dirtyM += 1;
      setNum(K_SESS_DIRTY_MINS, dirtyM);
    } else {
      cleanM += 1;
      setNum(K_SESS_CLEAN_MINS, cleanM);

      // Count toward today clean minutes (streak requirement)
      setNum(K_TODAY_CLEAN_MINS, getNum(K_TODAY_CLEAN_MINS, 0) + 1);

      // Award points for THIS clean minute using time multiplier
      const mult = minuteMultiplierByTime(new Date());
      addPoints(mult);
    }

    // reset per-minute tracking
    setStr(K_SESS_THIS_MIN_DIRTY, "false");
    secInMin = 0;
  }

  setNum(K_SESS_SEC_IN_MIN, secInMin);

  if (remain === 0){
    completeSession();
    return;
  }

  renderAll();
}

function completeSession(){
  // Session ends — apply penalty if they undock after midnight rule
  applyLatePenaltyIfNeeded("complete");

  setStr(K_SESS_ACTIVE, "false");

  const cleanM = getNum(K_SESS_CLEAN_MINS, 0);
  const dirtyM = getNum(K_SESS_DIRTY_MINS, 0);

  const res = document.getElementById("sessionResult");
  if (res){
    res.style.display = "block";
    res.innerHTML = `<b>Session complete!</b><br>
      Clean minutes: ${cleanM} (earned points)<br>
      Dirty minutes: ${dirtyM} (0 points)<br>
      <span class="muted">Points depend on time (bedtime bonus, work/school bonus, late-night rules).</span>`;
  }

  renderAll();
}

function applyLatePenaltyIfNeeded(reason){
  const h = hourNow();
  const lateHour = getNum(K_LATE_HOUR, 0);
  const penalty = getNum(K_LATE_PENALTY, 10);

  // "Lose points if take off after 12"
  if (h >= lateHour && h < 6){
    addPoints(-penalty);
    const res = document.getElementById("sessionResult");
    if (res){
      res.style.display = "block";
      res.innerHTML = `<b>Late-night penalty applied</b><br>
        You ended a session after ${lateHour}:00. (-${penalty} points)<br>
        <span class="muted">Reason: ${reason}</span>`;
    }
  }
}

let timerHandle = null;
function ensureTimer(){
  const hasSessionUI = document.getElementById("timeLeft") !== null;
  if (!hasSessionUI && !sessActive()) return;

  if (timerHandle) return;
  timerHandle = setInterval(() => {
    if (sessActive()) tickOneSecond();
    else renderAll();
  }, 1000);
}

function fastForwardMinute(){
  if (!sessActive()){
    alert("Start a session first.");
    return;
  }
  for (let i=0;i<60;i++) tickOneSecond();
}

/* ================== REWARDS ================== */
function makeCode(brand){
  const n = Math.floor(1000 + Math.random()*9000);
  return `BP-${brand.toUpperCase()}-${n}`;
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
  renderRewards();
}
function renderRewards(){
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

/* ================== CHECKOUT (demo) ================== */
function submitCheckout(){
  const name = (document.getElementById("ccName")?.value || "").trim();
  const num = (document.getElementById("ccNumber")?.value || "").replace(/\s+/g,"");
  const exp = (document.getElementById("ccExp")?.value || "").trim();
  const cvc = (document.getElementById("ccCVC")?.value || "").trim();

  if (!name){ alert("Enter the name on the card."); return; }
  if (num.length < 12){ alert("Enter a valid card number."); return; }
  if (!exp){ alert("Enter expiry (MM/YY)."); return; }
  if (cvc.length < 3){ alert("Enter a valid CVC."); return; }

  alert("Subscription activated (prototype).");
  // If you later want a real payment flow, you’ll use Stripe on a real server.
}

/* ================== RESET ================== */
function resetAll(){
  localStorage.clear();
  ensureDefaults();
  alert("Reset done.");
  location.reload();
}

/* ================== RENDER ================== */
function renderHeader(){
  setText("pointsBadge", points());
  setText("streakBadge", getNum(K_STREAK, 0));
  setText("todayMinsBadge", getNum(K_TODAY_CLEAN_MINS, 0));
}

function renderDashboard(){
  const active = sessActive();
  const remain = getNum(K_SESS_REMAIN_SECS, 0);
  const cleanM = getNum(K_SESS_CLEAN_MINS, 0);
  const dirtyM = getNum(K_SESS_DIRTY_MINS, 0);
  const dirtyThis = getStr(K_SESS_THIS_MIN_DIRTY, "false") === "true";

  setText("timeLeft", active ? formatMMSS(remain) : "—");
  setText("cleanMins", cleanM);
  setText("dirtyMins", dirtyM);
  setText("thisMinuteStatus", active ? (dirtyThis ? "DIRTY (0 pts)" : "CLEAN (earns pts)") : "—");

  setText("todayCleanMins", getNum(K_TODAY_CLEAN_MINS, 0));
  setText("streakDays", getNum(K_STREAK, 0));
  setText("pointsTotal", points());

  // show current multiplier message
  const multEl = document.getElementById("multNow");
  if (multEl){
    const mult = minuteMultiplierByTime(new Date());
    multEl.innerText = `Right now: ${mult}x per clean minute`;
  }
}

function renderSettings(){
  const ids = [
    ["streakTarget", K_STREAK_TARGET],
    ["bedStart", K_BED_START],
    ["bedEnd", K_BED_END],
    ["bedMult", K_BED_MULT],
    ["workStart", K_WORK_START],
    ["workEnd", K_WORK_END],
    ["workMult", K_WORK_MULT],
    ["lateHour", K_LATE_HOUR],
    ["latePenalty", K_LATE_PENALTY],
    ["lateMult", K_LATE_MULT]
  ];
  for (const [id, key] of ids){
    const el = document.getElementById(id);
    if (el) el.value = getNum(key);
  }
}

function saveSettings(){
  const pairs = [
    ["streakTarget", K_STREAK_TARGET],
    ["bedStart", K_BED_START],
    ["bedEnd", K_BED_END],
    ["bedMult", K_BED_MULT],
    ["workStart", K_WORK_START],
    ["workEnd", K_WORK_END],
    ["workMult", K_WORK_MULT],
    ["lateHour", K_LATE_HOUR],
    ["latePenalty", K_LATE_PENALTY],
    ["lateMult", K_LATE_MULT]
  ];
  for (const [id, key] of pairs){
    const v = Number(document.getElementById(id)?.value);
    if (Number.isFinite(v)) setNum(key, v);
  }
  alert("Saved settings!");
  renderAll();
}

function renderAll(){
  rolloverIfNeeded();
  renderHeader();
  renderDashboard();
  renderRewards();
  renderSettings();
}

document.addEventListener("DOMContentLoaded", () => {
  ensureDefaults();
  rolloverIfNeeded();
  renderAll();
  ensureTimer();
});

/* ================== EXPOSE BUTTONS ================== */
window.startSessionFromInput = startSessionFromInput;
window.cancelSession = cancelSession;
window.demoTouch = demoTouch;
window.fastForwardMinute = fastForwardMinute;

window.revealMilestone = revealMilestone;
window.copyAllCodes = copyAllCodes;

window.saveSettings = saveSettings;

window.submitCheckout = submitCheckout;
window.resetAll = resetAll;

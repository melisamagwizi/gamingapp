// Toxic Gaming 2.0 Firebase client. Add your Firebase project's web config below (see SETUP.md).
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

// Shop pricing. Keep in sync with validRate() in firestore.rules.
const SHOP_TZ = "Africa/Harare";
const RATES = { "PlayStation 5": 2, "PlayStation 4": 1.5 };
const PS4_PROMO_RATE = 1, PROMO_START_HOUR = 8, PROMO_END_HOUR = 12;
const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=Luxor+House+Shop+13A+Bulawayo+Zimbabwe";

const configured = !firebaseConfig.apiKey.startsWith("REPLACE_");
let auth, db, user = null, profile = null, stopFns = [];
let sessions = [], vips = [], events = [], audit = [];

const $ = id => document.getElementById(id);
const money = n => "$" + Number(n || 0).toFixed(2);
const isMaster = () => profile?.role === "master";
const actorName = () => (profile?.displayName || user?.email || "").slice(0, 80);

function toast(s) { $("toast").textContent = s; $("toast").style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => $("toast").style.display = "none", 3200); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function toDate(v) { return v?.toDate ? v.toDate() : v ? new Date(v) : null; }
function timeStr(d) { return d ? d.toLocaleTimeString([], { timeZone: SHOP_TZ, hour: "2-digit", minute: "2-digit" }) : "—"; }

// Shop-local calendar day (YYYY-MM-DD) and hour, independent of the phone's timezone setting.
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: SHOP_TZ, hour: "2-digit", hourCycle: "h23" });
const shopDay = d => dayFmt.format(d);
const shopHour = d => Number(hourFmt.format(d));

function rateFor(consoleName, when, xrate) {
  if (consoleName === "PlayStation 4") { const h = shopHour(when); return h >= PROMO_START_HOUR && h < PROMO_END_HOUR ? PS4_PROMO_RATE : RATES[consoleName]; }
  return RATES[consoleName] ?? Number(xrate);
}

// Charge per started minute (minimum 1) between the server-set start and end times.
function bill(s, end) {
  const start = toDate(s.startedAt);
  if (!start || !end) return { minutes: 0, total: 0 };
  const minutes = Math.max(1, Math.ceil((end - start) / 60000));
  return { minutes, total: Math.round(minutes / 60 * Number(s.rate) * 100) / 100 };
}

function friendlyError(e) {
  const code = e?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Incorrect email or password.";
  if (code.includes("too-many-requests")) return "Too many attempts. Try again in a few minutes.";
  if (code.includes("network")) return "No internet connection.";
  if (code.includes("permission-denied")) return "Not allowed. Check your role, or the phone's date and time.";
  return e?.message || "Something went wrong.";
}

// In-page dialog (native confirm/prompt are unreliable in WebViews). Resolves to the typed text
// when `input` is given, otherwise true; resolves to null/false when dismissed.
function ask({ title, message = "", input, ok = "OK", danger = false }) {
  const dlg = $("dlg"), field = $("dlgInput");
  $("dlgTitle").textContent = title; $("dlgMsg").textContent = message;
  field.hidden = input === undefined; field.value = input ?? "";
  $("dlgOk").textContent = ok; $("dlgOk").className = danger ? "danger" : "primary";
  dlg.returnValue = ""; dlg.showModal(); if (input !== undefined) field.focus();
  return new Promise(res => dlg.addEventListener("close", () => {
    const yes = dlg.returnValue === "ok";
    res(input === undefined ? yes : yes ? field.value : null);
  }, { once: true }));
}

// Disable the clicked button while an async action runs, to prevent double submissions.
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(friendlyError(e)); } finally { if (btn) btn.disabled = false; }
}

if (configured) {
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb); db = getFirestore(fb);
  onAuthStateChanged(auth, async u => {
    if (!u) {
      clearListeners(); user = null; profile = null; sessions = vips = events = audit = [];
      $("login").classList.remove("hide"); $("appUI").classList.add("hide"); $("who").textContent = "Not signed in";
      return;
    }
    user = u;
    try {
      const snap = await getDoc(doc(db, "users", u.uid));
      profile = snap.exists() ? snap.data() : null;
    } catch (e) { profile = null; }
    if (!profile || !["master", "staff"].includes(profile.role)) { toast("This account has no role yet. Ask the owner to set it up."); await signOut(auth); return; }
    $("login").classList.add("hide"); $("appUI").classList.remove("hide");
    $("who").textContent = actorName() + " • " + profile.role.toUpperCase();
    document.querySelectorAll(".master-only").forEach(x => x.classList.toggle("hide", !isMaster()));
    listenAll();
  });
} else {
  $("login").insertAdjacentHTML("beforeend", '<p class="warn">Firebase setup is required before sign-in works. Follow SETUP.md.</p>');
}

$("loginForm").onsubmit = ev => {
  ev.preventDefault();
  if (!configured) return toast("Firebase is not configured yet.");
  busy(ev.submitter, () => signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value));
};
$("resetBtn").onclick = ev => {
  if (!configured) return toast("Configure Firebase first.");
  if (!$("email").value.trim()) return toast("Enter your email.");
  busy(ev.currentTarget, async () => { await sendPasswordResetEmail(auth, $("email").value.trim()); toast("Password reset email sent."); });
};
$("logoutBtn").onclick = () => signOut(auth);
document.querySelectorAll("nav [data-tab]").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav [data-tab],.tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); $(b.dataset.tab).classList.add("active");
});
$("console").onchange = () => $("xrateWrap").classList.toggle("hide", $("console").value !== "Xbox");
$("mapLink").href = MAPS_URL;
$("qr").onerror = () => $("qr").hidden = true;
$("qr").src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(MAPS_URL);

function clearListeners() { stopFns.forEach(f => f()); stopFns = []; }
function listenAll() {
  clearListeners();
  const watch = (name, max, cb) => stopFns.push(onSnapshot(
    query(collection(db, name), orderBy("createdAt", "desc"), limit(max)),
    s => { cb(s.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))); render(); },
    e => toast("Sync error: " + friendlyError(e))));
  watch("sessions", 500, a => sessions = a);
  watch("vips", 300, a => vips = a);
  watch("events", 200, a => events = a);
  if (isMaster()) watch("audit", 200, a => audit = a);
}

async function log(action, detail) {
  try { await addDoc(collection(db, "audit"), { action, detail: String(detail).slice(0, 400), actorUid: user.uid, actorName: actorName(), createdAt: serverTimestamp() }); }
  catch (e) { console.warn("audit log failed", e); }
}

$("startBtn").onclick = ev => {
  const player = $("player").value.trim(), c = $("console").value;
  if (!player) return toast("Enter the player name.");
  const rate = rateFor(c, new Date(), $("xrate").value);
  if (!(rate > 0)) return toast("Enter a valid Xbox hourly rate.");
  busy(ev.currentTarget, async () => {
    await addDoc(collection(db, "sessions"), {
      player, console: c, station: $("station").value.trim(), rate, status: "active",
      createdBy: user.uid, staffName: actorName(),
      startedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    await log("session_start", `${player} • ${c} @ ${money(rate)}/hr`);
    ["player", "station", "xrate"].forEach(i => $(i).value = "");
    toast("Session started.");
  });
};

const sessionActions = {
  async finish(s) {
    const { total } = bill(s, new Date());
    if (!(await ask({ title: "Finish session", message: `Finish ${s.player}'s session? Amount due now: ${money(total)}.`, ok: "Finish" }))) return;
    await updateDoc(doc(db, "sessions", s.id), { status: "finished", endedAt: serverTimestamp(), finishedBy: user.uid, updatedAt: serverTimestamp() });
    await log("session_finish", `${s.player} • ≈${money(total)}`);
    toast("Session finished. Collect " + money(total) + ".");
  },
  async edit(s) {
    const name = await ask({ title: "Rename player", input: s.player, ok: "Next" });
    if (!name?.trim()) return;
    const reason = await ask({ title: "Reason for change", message: "Required. Saved in the audit log.", input: "", ok: "Save" });
    if (!reason?.trim()) return toast("A reason is required.");
    await updateDoc(doc(db, "sessions", s.id), { player: name.trim().slice(0, 80), lastEditedBy: user.uid, lastEditReason: reason.trim().slice(0, 200), updatedAt: serverTimestamp() });
    await log("session_edit", `${s.player} → ${name.trim()}; ${reason.trim()}`);
    toast("Session updated.");
  },
  async cancel(s) {
    const reason = await ask({ title: "Cancel session", message: `Why is ${s.player}'s session being cancelled? Required. No charge is recorded.`, input: "", ok: "Cancel session", danger: true });
    if (!reason?.trim()) return;
    await updateDoc(doc(db, "sessions", s.id), { status: "cancelled", cancelledAt: serverTimestamp(), cancelReason: reason.trim().slice(0, 200), cancelledBy: user.uid, updatedAt: serverTimestamp() });
    await log("session_cancel", `${s.player}; ${reason.trim()}`);
    toast("Session cancelled.");
  }
};
$("activeRows").onclick = ev => {
  const btn = ev.target.closest("button[data-act]"); if (!btn) return;
  const s = sessions.find(x => x.id === btn.dataset.id);
  if (s) busy(btn, () => sessionActions[btn.dataset.act](s));
};

$("vipBtn").onclick = ev => {
  const name = $("vn").value.trim(), date = $("vd").value;
  if (!name || !date) return toast("Enter the customer name and date.");
  busy(ev.currentTarget, async () => {
    await addDoc(collection(db, "vips"), { name, phone: $("vp").value.trim(), date, time: $("vt").value, type: $("vtype").value, notes: $("vnotes").value.trim(), createdBy: user.uid, createdAt: serverTimestamp() });
    await log("vip_created", `${name} • ${date} ${$("vt").value}`);
    ["vn", "vp", "vd", "vt", "vnotes"].forEach(i => $(i).value = "");
    toast("VIP booking saved.");
  });
};
$("vipRows").onclick = ev => {
  const btn = ev.target.closest("button[data-del]"); if (!btn || !isMaster()) return;
  const v = vips.find(x => x.id === btn.dataset.del);
  if (v) busy(btn, async () => {
    if (!(await ask({ title: "Delete booking", message: `Delete the booking for ${v.name} on ${v.date}?`, ok: "Delete", danger: true }))) return;
    await deleteDoc(doc(db, "vips", v.id)); await log("vip_deleted", `${v.name} • ${v.date}`);
  });
};

$("eventBtn").onclick = ev => {
  const name = $("en").value.trim(), date = $("ed").value;
  if (!name || !date) return toast("Enter the event name and date.");
  busy(ev.currentTarget, async () => {
    await addDoc(collection(db, "events"), { name, game: $("eg").value.trim(), date, time: $("et").value, fee: Math.max(0, Number($("ef").value) || 0), capacity: Math.max(0, Math.floor(Number($("ecap").value) || 0)), details: $("edetail").value.trim(), createdBy: user.uid, createdAt: serverTimestamp() });
    await log("event_created", `${name} • ${date}`);
    ["en", "eg", "ed", "et", "ef", "ecap", "edetail"].forEach(i => $(i).value = "");
    toast("Event saved.");
  });
};
$("eventRows").onclick = ev => {
  const btn = ev.target.closest("button[data-del]"); if (!btn || !isMaster()) return;
  const e = events.find(x => x.id === btn.dataset.del);
  if (e) busy(btn, async () => {
    if (!(await ask({ title: "Delete event", message: `Delete ${e.name} on ${e.date}?`, ok: "Delete", danger: true }))) return;
    await deleteDoc(doc(db, "events", e.id)); await log("event_deleted", `${e.name} • ${e.date}`);
  });
};

function render() {
  if (!user) return;
  const now = new Date(), today = shopDay(now);
  const active = sessions.filter(s => s.status === "active");
  const finished = sessions.filter(s => s.status === "finished" && toDate(s.endedAt));
  const doneToday = finished.filter(s => shopDay(toDate(s.endedAt)) === today);
  const upcomingVips = vips.filter(v => v.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  $("count").textContent = active.length;
  $("revenue").textContent = money(doneToday.reduce((a, s) => a + bill(s, toDate(s.endedAt)).total, 0));
  $("vcount").textContent = upcomingVips.length;

  $("activeRows").innerHTML = active.map(s => {
    const { minutes, total } = bill(s, now), own = s.createdBy === user.uid, id = esc(s.id);
    const manage = isMaster() || own ? ` <button data-act="edit" data-id="${id}">Edit</button> <button class="danger" data-act="cancel" data-id="${id}">Cancel</button>` : "";
    return `<tr><td>${esc(s.player)}<br><span class="muted">${esc(s.station)}</span></td><td>${esc(s.console)}</td><td>${timeStr(toDate(s.startedAt))}</td><td>${minutes} min</td><td>${money(s.rate)}</td><td>${money(total)}</td><td class="actions"><button class="primary" data-act="finish" data-id="${id}">Finish</button>${manage}</td></tr>`;
  }).join("") || '<tr><td colspan="7">No active sessions.</td></tr>';

  $("doneRows").innerHTML = doneToday.map(s => {
    const end = toDate(s.endedAt), { minutes, total } = bill(s, end);
    return `<tr><td>${esc(s.player)}</td><td>${esc(s.console)}</td><td>${timeStr(toDate(s.startedAt))} / ${timeStr(end)}</td><td>${Math.floor(minutes / 60)}h ${minutes % 60}m</td><td>${money(total)}</td><td>${esc(s.staffName)}</td></tr>`;
  }).join("") || '<tr><td colspan="6">No completed sessions today.</td></tr>';

  $("vipRows").innerHTML = upcomingVips.map(v => `<div class="card"><b>${esc(v.name)}</b> • ${esc(v.type)}<p>${esc(v.date)} ${esc(v.time)} • ${esc(v.phone)}</p><p class="muted">${esc(v.notes)}</p>${isMaster() ? `<button class="danger" data-del="${esc(v.id)}">Delete</button>` : ""}</div>`).join("") || '<p class="muted">No upcoming bookings.</p>';

  $("eventRows").innerHTML = events.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(e => `<div class="card"><b>${esc(e.name)}</b> <span class="muted">${esc(e.date)} ${esc(e.time)}</span><p>${esc(e.game)} • Entry ${money(e.fee)} • Max players: ${e.capacity ? esc(e.capacity) : "—"}</p><p>${esc(e.details)}</p>${isMaster() ? `<button class="danger" data-del="${esc(e.id)}">Delete</button>` : ""}</div>`).join("") || '<p class="muted">No events registered.</p>';

  if (isMaster()) {
    $("auditRows").innerHTML = audit.map(a => `<p>${toDate(a.createdAt)?.toLocaleString([], { timeZone: SHOP_TZ }) ?? ""} — <b>${esc(a.action)}</b> — ${esc(a.actorName)}: ${esc(a.detail)}</p>`).join("") || '<p class="muted">No audit entries yet.</p>';
    const days = {};
    for (const s of sessions) {
      const when = toDate(s.status === "finished" ? s.endedAt : s.cancelledAt);
      if (!when || s.status === "active") continue;
      const d = days[shopDay(when)] ??= { n: 0, mins: 0, total: 0, cancelled: 0 };
      if (s.status === "cancelled") { d.cancelled++; continue; }
      const b = bill(s, when); d.n++; d.mins += b.minutes; d.total += b.total;
    }
    $("repRows").innerHTML = Object.keys(days).sort().reverse().map(k => `<tr><td>${k}</td><td>${days[k].n}</td><td>${days[k].mins}</td><td>${money(days[k].total)}</td><td>${days[k].cancelled}</td></tr>`).join("") || '<tr><td colspan="5">No completed sessions yet.</td></tr>';
  }
}
setInterval(render, 15000);

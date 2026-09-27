// Demo stand-in for Firebase, used only by the browser test build (see build-demo.mjs).
// Keeps data in this browser, enforces the same checks as firestore.rules, and lets the
// test panel move the shop clock. Exposes the Firebase functions app.js imports on `FB`.
const FB = (() => {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable: demo still works in memory */ } },
    del(k) { try { localStorage.removeItem(k); } catch { } }
  };

  // Simulated clock: every `new Date()` / `Date.now()` in the app is shifted by `offset`.
  const RealDate = Date;
  let offset = Number(store.get("tg_demo_offset")) || 0;
  class SimDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = SimDate;

  const USERS = {
    owner: { role: "master", displayName: "Owner", email: "owner@demo.shop" },
    amy: { role: "staff", displayName: "Amy", email: "amy@demo.shop" },
    ben: { role: "staff", displayName: "Ben", email: "ben@demo.shop" }
  };
  const COLLS = ["sessions", "vips", "events", "audit"];
  let db, seq, user = null;
  const listeners = [], authCbs = [], secLog = [];
  const onChange = new Set();

  const ts = ms => ({ toDate: () => new RealDate(ms), toMillis: () => ms });
  const wrap = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && v.__ts ? ts(v.__ts) : v]));
  const resolve = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && v.__st ? { __ts: SimDate.now() } : v]));
  const save = () => store.set("tg_demo_db", JSON.stringify({ db, seq }));

  function harareHour(ms) { return new RealDate(ms + 2 * 3600e3).getUTCHours(); }
  function seed() {
    const now = SimDate.now(), min = 60e3, day = 864e5, at = ms => ({ __ts: ms });
    const ymd = ms => new RealDate(ms + 2 * 3600e3).toISOString().slice(0, 10);
    const ps4Start = now - 12 * min, ps4Rate = harareHour(ps4Start) >= 8 && harareHour(ps4Start) < 12 ? 1 : 1.5;
    db = { sessions: {}, vips: {}, events: {}, audit: {} }; seq = 0;
    const add = (c, d) => db[c]["s" + (++seq)] = d;
    add("sessions", { player: "Sample · Kuda", console: "Xbox", station: "XB-1", rate: 2.5, status: "finished", createdBy: "amy", staffName: "Amy", startedAt: at(now - 130 * min), endedAt: at(now - 60 * min), finishedBy: "amy", createdAt: at(now - 130 * min), updatedAt: at(now - 60 * min) });
    add("sessions", { player: "Sample · Tino", console: "PlayStation 5", station: "PS5-1", rate: 2, status: "active", createdBy: "amy", staffName: "Amy", startedAt: at(now - 42 * min), createdAt: at(now - 42 * min), updatedAt: at(now - 42 * min) });
    add("sessions", { player: "Sample · Farai", console: "PlayStation 4", station: "PS4-2", rate: ps4Rate, status: "active", createdBy: "ben", staffName: "Ben", startedAt: at(ps4Start), createdAt: at(ps4Start), updatedAt: at(ps4Start) });
    add("vips", { name: "Sample · Rudo", phone: "+263 77 000 0000", date: ymd(now + day), time: "18:00", type: "VIP Room", notes: "2 hours, 4 players", createdBy: "amy", createdAt: at(now - 5 * min) });
    add("events", { name: "Sample · EA FC Cup", game: "EA SPORTS FC, PS5", date: ymd(now + 7 * day), time: "14:00", fee: 5, capacity: 16, details: "Knockout, single legs. Winner takes the entry pot.", createdBy: "owner", createdAt: at(now - 10 * min) });
    save();
  }
  function load() {
    try { const s = JSON.parse(store.get("tg_demo_db")); if (s?.db && COLLS.every(c => s.db[c])) { db = s.db; seq = s.seq; return; } } catch { }
    seed();
  }
  load();
  user = USERS[store.get("tg_demo_user")] ? { uid: store.get("tg_demo_user"), email: USERS[store.get("tg_demo_user")].email } : null;

  // ---- Same checks as firestore.rules --------------------------------------------------
  const denied = why => Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied", why });
  const role = () => USERS[user?.uid]?.role;
  function utcMinute() { const d = new RealDate(SimDate.now()); return d.getUTCHours() * 60 + d.getUTCMinutes(); }
  function validRate(d) {
    const m = utcMinute();
    if (d.console === "PlayStation 5") return d.rate === 2;
    if (d.console === "PlayStation 4") return (d.rate === 1 && m >= 358 && m < 602) || (d.rate === 1.5 && (m < 362 || m >= 598));
    return d.console === "Xbox" && typeof d.rate === "number" && d.rate > 0 && d.rate <= 50;
  }
  const only = (keys, allowed) => keys.every(k => allowed.includes(k));
  function check(op, coll, before, data) {
    const r = role(), uid = user?.uid;
    if (!r) throw denied("not signed in / no role");
    if (coll === "audit") { if (op !== "create" || data.actorUid !== uid) throw denied("audit entries are append-only and must be your own"); return; }
    if (coll === "vips" || coll === "events") {
      if (op === "create") { if (data.createdBy !== uid) throw denied("createdBy must be you"); return; }
      if (r !== "master") throw denied(`only the owner can ${op} ${coll === "vips" ? "VIP bookings" : "events"}`);
      return;
    }
    // sessions
    if (op === "delete") throw denied("sessions can never be deleted");
    if (op === "create") {
      if (data.createdBy !== uid || data.status !== "active") throw denied("invalid new session");
      if (!validRate(data)) throw denied(`rate ${data.rate}/hr is not the shop rate for ${data.console} at this time`);
      return;
    }
    if (r === "master") return;
    if (before.status !== "active") throw denied("staff cannot change a finished or cancelled session");
    const keys = Object.keys(data);
    if (only(keys, ["status", "endedAt", "finishedBy", "updatedAt"]) && data.status === "finished") return;
    if (before.createdBy !== uid) throw denied("only the staff member who started this session can change it (anyone may finish it)");
    if (only(keys, ["player", "lastEditedBy", "lastEditReason", "updatedAt"]) && data.lastEditReason?.trim()) return;
    if (only(keys, ["status", "cancelledAt", "cancelReason", "cancelledBy", "updatedAt"]) && data.status === "cancelled" && data.cancelReason?.trim()) return;
    throw denied(`staff cannot change ${keys.filter(k => k !== "updatedAt").join(", ")}`);
  }
  function guarded(op, coll, before, data, fn) {
    const who = USERS[user?.uid]?.displayName || "Signed out";
    const what = `${who}: ${op} ${coll}${data?.status && op === "update" ? " → " + data.status : ""}${data?.rate !== undefined && op === "update" ? " (rate → " + data.rate + ")" : ""}`;
    try { check(op, coll, before, data); } catch (e) { secLog.unshift({ ok: false, what, why: e.why, at: SimDate.now() }); notify(); throw e; }
    if (coll !== "audit") secLog.unshift({ ok: true, what, at: SimDate.now() });
    fn(); save(); fire(); notify();
  }
  // --------------------------------------------------------------------------------------

  const fire = () => listeners.forEach(l => l.run());
  const notify = () => onChange.forEach(f => f());
  const tick = f => Promise.resolve().then(f);

  return {
    initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
    onAuthStateChanged(a, cb) { authCbs.push(cb); tick(() => cb(user)); },
    async signInWithEmailAndPassword(a, email, pw) {
      const uid = Object.keys(USERS).find(k => USERS[k].email === String(email).toLowerCase());
      if (!uid || pw !== "demo") throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
      user = { uid, email: USERS[uid].email }; store.set("tg_demo_user", uid); authCbs.forEach(cb => cb(user)); notify();
    },
    async sendPasswordResetEmail() { },
    async signOut() { user = null; store.del("tg_demo_user"); authCbs.forEach(cb => cb(null)); notify(); },
    serverTimestamp: () => ({ __st: true }),
    collection: (d, name) => ({ name }),
    doc: (d, name, id) => ({ name, id }),
    limit: n => ({ limit: n }), orderBy: () => ({}),
    query: (c, ...r) => ({ name: c.name, limit: r.find(x => x.limit)?.limit ?? 1e9 }),
    onSnapshot(q, cb, err) {
      if (q.name === "audit" && role() !== "master") { tick(() => err(denied("audit is owner-only"))); return () => { }; }
      const l = {
        run: () => cb({
          docs: Object.entries(db[q.name]).sort((a, b) => b[1].createdAt.__ts - a[1].createdAt.__ts).slice(0, q.limit)
            .map(([id, d]) => ({ id, data: () => wrap(d) }))
        })
      };
      listeners.push(l); tick(l.run);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    },
    async getDoc(r) { const u = r.name === "users" ? USERS[r.id] : db[r.name]?.[r.id]; return { exists: () => !!u, data: () => u && { ...u } }; },
    async addDoc(c, data) {
      const d = resolve(data), id = "d" + (++seq);
      guarded("create", c.name, null, d, () => db[c.name][id] = d);
      return { id };
    },
    async updateDoc(r, data) {
      const before = db[r.name][r.id]; if (!before) throw denied("no such record");
      const d = resolve(data);
      guarded("update", r.name, before, d, () => Object.assign(before, d));
    },
    async deleteDoc(r) {
      const before = db[r.name][r.id]; if (!before) return;
      guarded("delete", r.name, before, null, () => delete db[r.name][r.id]);
    },

    // ---- Test-panel hooks (not part of Firebase) ----
    demo: {
      USERS, secLog, onChange,
      get user() { return user; },
      now: () => SimDate.now(),
      shift(ms) { offset += ms; store.set("tg_demo_offset", String(offset)); fire(); notify(); },
      jumpToHarare(hour) {
        const now = SimDate.now(), local = new RealDate(now + 2 * 3600e3);
        let target = RealDate.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) - 2 * 3600e3;
        if (target <= now) target += 864e5;
        this.shift(target - now);
      },
      realTime() { offset = 0; store.del("tg_demo_offset"); fire(); notify(); },
      reset() { offset = 0; store.del("tg_demo_offset"); secLog.length = 0; seed(); fire(); notify(); },
      // Simulates a tampered app cutting the rate of a live session (the user's own if they have one).
      tamper() {
        const live = Object.entries(db.sessions).filter(([, s]) => s.status === "active").sort((a, b) => a[1].startedAt.__ts - b[1].startedAt.__ts);
        const e = live.find(([, s]) => s.createdBy === user?.uid) || live[0];
        if (!e) return Promise.reject(new Error("Start a session first."));
        return this.update(e[0], { rate: 0.5, updatedAt: { __st: true } }).then(() => e[1].player);
      },
      update(id, data) { return FB.updateDoc({ name: "sessions", id }, data); }
    }
  };
})();

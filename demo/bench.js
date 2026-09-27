// Wires the test panel to the demo backend. Runs after app.js in the same module.
{
  const D = FB.demo, q = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const dFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Harare", weekday: "short", day: "numeric", month: "short" });
  const mem = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };
  const say = s => { const t = q("toast"); t.textContent = s; t.style.display = "block"; clearTimeout(say.t); say.t = setTimeout(() => t.style.display = "none", 3500); };

  function paint() {
    const now = new Date(D.now());
    q("bClock").textContent = tFmt.format(now);
    const h = Number(tFmt.format(now).slice(0, 2));
    q("bDay").textContent = dFmt.format(now) + (h >= 8 && h < 12 ? " · PS4 promo on" : " · standard rates");
    document.querySelectorAll("#bWho button").forEach(b => b.setAttribute("aria-pressed", String((D.user?.uid || "") === b.dataset.u)));
    q("bLogN").textContent = D.secLog.length;
    q("bLog").innerHTML = D.secLog.slice(0, 60).map(e => `<li><span class="${e.ok ? "ok" : "no"}">${e.ok ? "ALLOWED" : "BLOCKED"}</span> ${tFmt.format(new Date(e.at))} ${esc(e.what)}${e.why ? " · " + esc(e.why) : ""}</li>`).join("") || "<li>No writes yet.</li>";
  }
  D.onChange.add(paint);
  setInterval(paint, 5000);
  paint();

  q("bWho").onclick = async ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (!b.dataset.u) return FB.signOut();
    if (D.user?.uid === b.dataset.u) return;
    if (D.user) await FB.signOut();
    await FB.signInWithEmailAndPassword(null, D.USERS[b.dataset.u].email, "demo");
    say("Signed in as " + D.USERS[b.dataset.u].displayName + ".");
  };
  document.querySelectorAll("#bench [data-t]").forEach(b => b.onclick = () => { D.shift(Number(b.dataset.t)); flash(); });
  document.querySelectorAll("#bench [data-h]").forEach(b => b.onclick = () => { D.jumpToHarare(Number(b.dataset.h)); flash(); });
  q("bReal").onclick = () => { D.realTime(); flash(); };
  q("bReset").onclick = () => { D.reset(); say("Demo data reset to the samples."); };
  q("bTamper").onclick = () => D.tamper()
    .then(p => say(`Allowed: ${p}'s rate is now $0.50/hr (owner override, logged).`))
    .catch(e => { say(e.code ? "Blocked by the security rules: " + e.why + "." : e.message); q("bLogBox").open = true; });
  function flash() { const c = q("bClock"); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }

  const boxes = [...document.querySelectorAll("#bTry input")];
  const done = () => q("bDone").textContent = boxes.filter(b => b.checked).length;
  boxes.forEach(b => { b.checked = mem.get("tg_demo_" + b.id) === "1"; b.onchange = () => { mem.set("tg_demo_" + b.id, b.checked ? "1" : "0"); done(); }; });
  done();
}

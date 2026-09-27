import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "tg-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8085 } });
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, "users/boss"), { role: "master" });
  await setDoc(doc(db, "users/amy"), { role: "staff" });
  await setDoc(doc(db, "users/ben"), { role: "staff" });
});
const fs = uid => env.authenticatedContext(uid).firestore();
const boss = fs("boss"), amy = fs("amy"), ben = fs("ben"), nobody = fs("stranger");
const m = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
const ps4 = m >= 360 && m < 600 ? 1 : 1.5, ps4wrong = ps4 === 1 ? 1.5 : 1;
const ts = serverTimestamp;
const sess = (over = {}) => ({ player: "Tino", console: "PlayStation 5", station: "PS5-1", rate: 2, status: "active", createdBy: "amy", staffName: "Amy", startedAt: ts(), createdAt: ts(), updatedAt: ts(), ...over });
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("ok   ", name); } catch (e) { fail++; console.log("FAIL ", name, e.message.split("\n")[0]); } }

const a1 = doc(collection(amy, "sessions"));
await t("staff creates PS5 @ $2", assertSucceeds(setDoc(a1, sess())));
await t("staff PS5 wrong rate denied", assertFails(addDoc(collection(amy, "sessions"), sess({ rate: 1 }))));
await t(`staff PS4 correct rate ${ps4}`, assertSucceeds(addDoc(collection(amy, "sessions"), sess({ console: "PlayStation 4", rate: ps4 }))));
await t(`staff PS4 wrong rate ${ps4wrong} denied`, assertFails(addDoc(collection(amy, "sessions"), sess({ console: "PlayStation 4", rate: ps4wrong }))));
await t("xbox custom rate ok", assertSucceeds(addDoc(collection(amy, "sessions"), sess({ console: "Xbox", rate: 2.5 }))));
await t("xbox zero rate denied", assertFails(addDoc(collection(amy, "sessions"), sess({ console: "Xbox", rate: 0 }))));
await t("backdated client startedAt denied", assertFails(addDoc(collection(amy, "sessions"), sess({ startedAt: new Date(Date.now() - 3600e3) }))));
await t("extra total field denied", assertFails(addDoc(collection(amy, "sessions"), sess({ total: 0 }))));
await t("create as someone else denied", assertFails(addDoc(collection(amy, "sessions"), sess({ createdBy: "ben" }))));
await t("no-role user cannot create", assertFails(addDoc(collection(nobody, "sessions"), sess({ createdBy: "stranger" }))));
await t("no-role user cannot read", assertFails(getDoc(doc(nobody, "sessions", a1.id))));
await t("staff reads", assertSucceeds(getDoc(doc(ben, "sessions", a1.id))));

await t("other staff cannot rename", assertFails(updateDoc(doc(ben, "sessions", a1.id), { player: "X", lastEditedBy: "ben", lastEditReason: "r", updatedAt: ts() })));
await t("other staff cannot cancel", assertFails(updateDoc(doc(ben, "sessions", a1.id), { status: "cancelled", cancelledAt: ts(), cancelReason: "r", cancelledBy: "ben", updatedAt: ts() })));
await t("owner rename needs reason", assertFails(updateDoc(doc(amy, "sessions", a1.id), { player: "X", lastEditedBy: "amy", lastEditReason: "", updatedAt: ts() })));
await t("owner rename ok", assertSucceeds(updateDoc(doc(amy, "sessions", a1.id), { player: "Tino M", lastEditedBy: "amy", lastEditReason: "typo", updatedAt: ts() })));
await t("owner cannot change rate", assertFails(updateDoc(doc(amy, "sessions", a1.id), { rate: 0.5, updatedAt: ts() })));
await t("finish with client endedAt denied", assertFails(updateDoc(doc(ben, "sessions", a1.id), { status: "finished", endedAt: new Date(), finishedBy: "ben", updatedAt: ts() })));
await t("finish while lowering rate denied", assertFails(updateDoc(doc(ben, "sessions", a1.id), { status: "finished", endedAt: ts(), finishedBy: "ben", rate: 1, updatedAt: ts() })));
await t("other staff finishes (shift handover)", assertSucceeds(updateDoc(doc(ben, "sessions", a1.id), { status: "finished", endedAt: ts(), finishedBy: "ben", updatedAt: ts() })));
await t("staff cannot touch finished session", assertFails(updateDoc(doc(amy, "sessions", a1.id), { status: "cancelled", cancelledAt: ts(), cancelReason: "r", cancelledBy: "amy", updatedAt: ts() })));
await t("master can correct finished session", assertSucceeds(updateDoc(doc(boss, "sessions", a1.id), { player: "Corrected", updatedAt: ts() })));
await t("nobody deletes sessions", assertFails(deleteDoc(doc(boss, "sessions", a1.id))));

const a2 = doc(collection(amy, "sessions"));
await setDoc(a2, sess());
await t("owner cancel ok", assertSucceeds(updateDoc(doc(amy, "sessions", a2.id), { status: "cancelled", cancelledAt: ts(), cancelReason: "left early", cancelledBy: "amy", updatedAt: ts() })));

const vip = { name: "Rudo", phone: "+263", date: "2026-10-01", time: "18:00", type: "VIP Room", notes: "", createdBy: "amy", createdAt: ts() };
const v1 = doc(collection(amy, "vips"));
await t("staff creates vip", assertSucceeds(setDoc(v1, vip)));
await t("vip without name denied", assertFails(addDoc(collection(amy, "vips"), { ...vip, name: "" })));
await t("staff cannot delete vip", assertFails(deleteDoc(doc(amy, "vips", v1.id))));
await t("master deletes vip", assertSucceeds(deleteDoc(doc(boss, "vips", v1.id))));

const ev = { name: "FC Cup", game: "EA FC", date: "2026-10-10", time: "14:00", fee: 5, capacity: 16, details: "", createdBy: "amy", createdAt: ts() };
await t("staff creates event", assertSucceeds(addDoc(collection(amy, "events"), ev)));
await t("event negative fee denied", assertFails(addDoc(collection(amy, "events"), { ...ev, fee: -1 })));

const au = { action: "session_start", detail: "x", actorUid: "amy", actorName: "Amy", createdAt: ts() };
await t("staff writes own audit", assertSucceeds(addDoc(collection(amy, "audit"), au)));
await t("audit spoofing another uid denied", assertFails(addDoc(collection(amy, "audit"), { ...au, actorUid: "ben" })));
await t("staff cannot read audit", assertFails(getDoc(doc(amy, "audit", "x"))));
await t("master reads audit", assertSucceeds(getDoc(doc(boss, "audit", "x"))));
await t("users cannot self-assign role", assertFails(setDoc(doc(nobody, "users/stranger"), { role: "master" })));

console.log(`\n${pass} passed, ${fail} failed (UTC minute ${m}, expected PS4 rate ${ps4})`);
await env.cleanup();
process.exit(fail ? 1 : 0);

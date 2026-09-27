// Minimal in-memory stand-in for the three Firebase modules app.js imports.
const g = window.__fb ??= { docs: {}, listeners: [], authCbs: [], user: null, seq: 0, users: {} };
export const initializeApp = () => ({});
export const getAuth = () => ({});
export const getFirestore = () => ({});
export const onAuthStateChanged = (a, cb) => { g.authCbs.push(cb); setTimeout(() => cb(g.user), 0); };
export const signInWithEmailAndPassword = async (a, email, pw) => {
  if (pw !== "pw") throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
  g.user = { uid: email.split("@")[0], email }; g.authCbs.forEach(cb => cb(g.user));
};
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => { g.user = null; g.authCbs.forEach(cb => cb(null)); };
export const serverTimestamp = () => ({ __st: true });
const ts = d => ({ toDate: () => new Date(d) });
const resolve = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v?.__st ? ts(window.__now?.() ?? Date.now()) : v]));
export const collection = (db, name) => ({ name });
export const doc = (db, name, id) => { if (id === undefined) { const [c, i] = name.split("/"); return { name: c, id: i }; } return { name, id }; };
export const limit = n => ({ limit: n });
export const orderBy = () => ({});
export const query = (c, ...r) => ({ name: c.name, ...r.find(x => x.limit) });
const fire = () => g.listeners.forEach(l => l.run());
export const onSnapshot = (q, cb) => {
  const l = { run: () => { const docs = Object.entries(g.docs[q.name] || {}).sort((a, b) => b[1].createdAt.toDate() - a[1].createdAt.toDate()).slice(0, q.limit).map(([id, d]) => ({ id, data: () => d })); cb({ docs }); } };
  g.listeners.push(l); l.run(); return () => g.listeners.splice(g.listeners.indexOf(l), 1);
};
export const getDoc = async r => { const d = r.name === "users" ? g.users[r.id] : g.docs[r.name]?.[r.id]; return { exists: () => !!d, data: () => d }; };
export const addDoc = async (c, data) => { const id = "d" + (++g.seq); (g.docs[c.name] ??= {})[id] = resolve(data); fire(); return { id }; };
export const updateDoc = async (r, data) => { Object.assign(g.docs[r.name][r.id], resolve(data)); fire(); };
export const deleteDoc = async r => { delete g.docs[r.name][r.id]; fire(); };

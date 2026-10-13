import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp({
  apiKey: "AIzaSyDvAQAz5_bd_giWqyZbuKyJc4eOufHzRCc",
  authDomain: "yunus-playground-cfea2.firebaseapp.com",
  databaseURL: "https://yunus-playground-cfea2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "yunus-playground-cfea2",
  storageBucket: "yunus-playground-cfea2.firebasestorage.app",
  messagingSenderId: "530222448086",
  appId: "1:530222448086:web:ad222b34f35d5203973877"
});
const db = getDatabase(app);
const auth = getAuth(app);
const room = (c) => ref(db, "rooms/" + c);
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const newCode = () => Array.from({ length: 4 }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join("");

// تسجيل دخول مجهول (بلا بريد ولا بيانات شخصية): يعطي كل متصفح هوية ثابتة (uid)
// تعتمد عليها قواعد Firebase لتحديد من هو المنشئ ومن هو الضيف.
let uid = "", authed = false;
export const ready = (async () => {
  await auth.authStateReady();
  const u = auth.currentUser || (await signInAnonymously(auth)).user;
  uid = u.uid; authed = true;
  return u;
})();
ready.catch(() => {}); // الخطأ يظهر لمن ينتظر ready (مثل إنشاء غرفة)، ولا نريد ضجيجًا إضافيًا

// دور اللاعب (host/guest/spec) يُحفظ لكل تبويب حتى يعمل التحديث بدون فقدان الغرفة
export const role = (c) => sessionStorage.getItem("role:" + c);
const saveRole = (c, r) => sessionStorage.setItem("role:" + c, r);

export async function createRoom(game, name, state, bot) {
  await ready;
  for (;;) {
    const c = newCode();
    if (!(await get(room(c))).exists()) {
      await set(room(c), { game, createdAt: Date.now(), host: { name, uid }, guest: bot ? { name: bot === "train" ? "🎯 التدريب" : "🤖 روبوت " + { easy: "سهل", medium: "متوسط", hard: "صعب" }[bot], bot } : null, state });
      saveRole(c, "host");
      return c;
    }
  }
}

export async function joinRoom(c, name) {
  await ready;
  const snap = await get(room(c));
  // غرفة غير موجودة أو أقدم من 12 ساعة تُحذف ولا يمكن دخولها
  if (!snap.exists() || Date.now() - snap.val().createdAt > 12 * 36e5) {
    if (snap.exists()) await remove(room(c)).catch(() => {});
    throw new Error("notfound");
  }
  if (role(c)) return role(c);
  let ok = false;
  try { ok = (await runTransaction(ref(db, `rooms/${c}/guest`), (cur) => (cur ? undefined : { name, uid }))).committed; } catch (e) { ok = false; }
  saveRole(c, ok ? "guest" : "spec"); // الغرفة ممتلئة = مشاهد
  return role(c);
}

export const watch = (c, cb) => onValue(room(c), (s) => cb(s.val()));
// الكتابة تنتظر تسجيل الدخول المجهول، وتنفَّذ فورًا (بدون تأخير) بعد جاهزيته
export const patch = (c, obj) => (authed ? update(room(c), obj) : ready.then(() => update(room(c), obj)));

// ساعة موحدة بتوقيت خادم Firebase (لمؤقتات اللعب العادلة)
let off = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => (off = s.val() || 0));
export const now = () => Date.now() + off;

const mine = (c) => ref(db, role(c) === "spec" ? `rooms/${c}/spectators/${uid}` : `rooms/${c}/online/${role(c)}`);
// حضور اللاعب: يختفي تلقائيًا عند انقطاعه، ويُعاد تسجيله عند عودة الاتصال
export function present(c, name) {
  const spec = role(c) === "spec";
  let un = null, dead = false;
  ready.then(() => {
    if (dead) return;
    const p = mine(c);
    un = onValue(ref(db, ".info/connected"), (s) => {
      if (!s.val()) return;
      onDisconnect(p).remove();
      set(p, spec ? { name } : true).catch(() => {});
    });
  }).catch(() => {});
  return () => { dead = true; if (un) un(); };
}
// خروج: المنشئ يحذف الغرفة، وغيره يزيل حضوره فقط
export const leaveRoom = async (c) => { await ready; return role(c) === "host" ? remove(room(c)) : remove(mine(c)); };

// المتصلون الآن (حضور كل تبويب) وإجمالي الزوار (يُحسب مرة لكل متصفح).
export function lobbyStats(cb) {
  const st = { online: 0, visitors: 0 }, none = () => {}, offs = [];
  offs.push(onValue(ref(db, "presence"), (s) => { st.online = s.exists() ? Object.keys(s.val()).length : 0; cb({ ...st }); }, none));
  offs.push(onValue(ref(db, "stats/visitors"), (s) => { st.visitors = s.val() || 0; cb({ ...st }); }, none));
  ready.then(() => {
    const me = ref(db, "presence/" + uid);
    offs.push(onValue(ref(db, ".info/connected"), (s) => { if (s.val()) { onDisconnect(me).remove(); set(me, true).catch(none); } }));
    if (!localStorage.getItem("counted"))
      runTransaction(ref(db, "stats/visitors"), (v) => (v || 0) + 1).then(() => localStorage.setItem("counted", "1")).catch(none);
  }).catch(none);
  return () => offs.forEach((f) => f());
}

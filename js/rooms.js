import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction, onDisconnect, remove } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

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
const room = (c) => ref(db, "rooms/" + c);
const sid = sessionStorage.sid || (sessionStorage.sid = Math.random().toString(36).slice(2, 8));
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const newCode = () => Array.from({ length: 4 }, () => LETTERS[(Math.random() * LETTERS.length) | 0]).join("");

// دور اللاعب (host/guest) يُحفظ لكل تبويب حتى يعمل التحديث بدون فقدان الغرفة
export const role = (c) => sessionStorage.getItem("role:" + c);
const saveRole = (c, r) => sessionStorage.setItem("role:" + c, r);

export async function createRoom(game, name, state) {
  for (;;) {
    const c = newCode();
    if (!(await get(room(c))).exists()) {
      await set(room(c), { game, createdAt: Date.now(), host: { name }, guest: null, state });
      saveRole(c, "host");
      return c;
    }
  }
}

export async function joinRoom(c, name) {
  const snap = await get(room(c));
  // غرفة غير موجودة أو أقدم من 12 ساعة تُحذف ولا يمكن دخولها
  if (!snap.exists() || Date.now() - snap.val().createdAt > 12 * 36e5) {
    if (snap.exists()) await remove(room(c));
    throw new Error("notfound");
  }
  if (role(c)) return role(c);
  const res = await runTransaction(ref(db, `rooms/${c}/guest`), (cur) => (cur ? undefined : { name }));
  saveRole(c, res.committed ? "guest" : "spec"); // الغرفة ممتلئة = مشاهد
  return role(c);
}

export const watch = (c, cb) => onValue(room(c), (s) => cb(s.val()));
export const patch = (c, obj) => update(room(c), obj);

// ساعة موحدة بتوقيت خادم Firebase (لمؤقتات اللعب العادلة)
let off = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => (off = s.val() || 0));
export const now = () => Date.now() + off;

const mine = (c) => ref(db, role(c) === "spec" ? `rooms/${c}/spectators/${sid}` : `rooms/${c}/online/${role(c)}`);
// حضور اللاعب: يختفي تلقائيًا عند انقطاعه، ويُعاد تسجيله عند عودة الاتصال
export function present(c, name) {
  const p = mine(c), spec = role(c) === "spec";
  return onValue(ref(db, ".info/connected"), (s) => {
    if (!s.val()) return;
    onDisconnect(p).remove();
    set(p, spec ? { name } : true);
  });
}
// خروج: المنشئ يحذف الغرفة، وغيره يزيل حضوره فقط
export const leaveRoom = (c) => (role(c) === "host" ? remove(room(c)) : remove(mine(c)));

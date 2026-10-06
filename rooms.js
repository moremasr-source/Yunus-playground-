import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

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
  if (!snap.exists()) throw new Error("notfound");
  if (role(c)) return;
  const res = await runTransaction(ref(db, `rooms/${c}/guest`), (cur) => (cur ? undefined : { name }));
  if (!res.committed) throw new Error("full");
  saveRole(c, "guest");
}

export const watch = (c, cb) => onValue(room(c), (s) => cb(s.val()));
export const patch = (c, obj) => update(room(c), obj);

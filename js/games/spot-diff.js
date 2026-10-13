import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, LOCK = 600, ND = 5, N = 25; // المدة، العد التنازلي، عقوبة الخطأ، عدد الاختلافات، خانات الصورة
const POOL = ["🍎", "🍌", "🍇", "🍓", "🍒", "🍋", "🥕", "🍄", "🌸", "🌻", "🌲", "⭐", "🌙", "☀️", "⚽", "🎈", "🎁", "🚗", "🚲", "🐶", "🐱", "🐸", "🐧", "🦋", "🏠", "🔔", "🎵", "🧸", "🍕", "🍩"];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// الصورة تُولَّد من البذرة: الأولى أصلية، والثانية فيها 5 اختلافات (رمز مختلف، أو اختفاء، أو حجم أصغر)
export function sceneOf(seed) {
  const r = mul(seed * 71 + 9), pick = () => POOL[(r() * POOL.length) | 0];
  const a = Array.from({ length: N }, pick), idx = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const diffs = idx.slice(0, ND), b = a.map((e) => ({ e, t: "" }));
  diffs.forEach((i) => {
    const t = ["swap", "gone", "small"][(r() * 3) | 0];
    if (t === "swap") { let e2 = a[i]; while (e2 === a[i]) e2 = pick(); b[i] = { e: e2, t }; } else b[i] = { e: a[i], t };
  });
  return { a, b, diffs };
}
export const diffsOf = (seed) => sceneOf(seed).diffs;

const list = (v) => (v ? v.split(",").filter(Boolean).map(Number) : []);
// سباق: كل لاعب له قائمته. مشترك: كل اختلاف يُحسب لأول من يجده.
const foundBy = (s, p) => s.mode === "shared"
  ? Object.entries(s.claim || {}).filter(([, v]) => v === p).map(([k]) => +k.slice(1))
  : list(s.found && s.found[p]);
const endAt = (s) => Math.min(s.startAt + DUR, ...Object.values(s.finish || {}));
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < endAt(s) ? "play" : "end"; };
const over = (s) => s.startAt && now() > endAt(s) + 1500;

const CSS = `.sd{text-align:center}
.sd-time{font-size:2.2rem;font-weight:800}
.sd-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.sd-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.sd .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
.sd h5{margin:10px 0 4px;color:var(--mut);font-size:.85rem}
.sd-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;max-width:340px;margin:0 auto}
.sd-c{aspect-ratio:1;min-width:0;padding:0;line-height:1;display:grid;place-items:center;font-size:clamp(1.3rem,8vw,2.2rem);border:1.5px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;touch-action:manipulation}
.sd-c.small{font-size:clamp(.8rem,4.6vw,1.3rem)}
.sd-c.mine{border-color:#16a34a;background:#dcfce7}
.sd-c.theirs{border-color:var(--x);background:#fde8eb}
.sd-shake{animation:sds .3s}
@keyframes sds{0%{transform:translateX(0)}25%{transform:translateX(-7px)}50%{transform:translateX(7px)}100%{transform:translateX(0)}}`;
if (!document.getElementById("sd-css")) { const st = document.createElement("style"); st.id = "sd-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;

function tap(i) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  if (sceneOf(s.seed).diffs.includes(i)) {
    if (s.mode === "shared") {
      const cl = s.claim || {};
      if (cl["c" + i]) return;
      const q = { [`state/claim/c${i}`]: me };
      if (Object.keys(cl).length + 1 >= ND) q[`state/finish/${me}`] = now(); // اكتملت كل الاختلافات
      api.patch(q);
    } else {
      const mine = list(s.found && s.found[me]);
      if (mine.includes(i)) return;
      mine.push(i);
      const q = { [`state/found/${me}`]: mine.join(",") };
      if (mine.length >= ND) q[`state/finish/${me}`] = now();
      api.patch(q);
    }
  } else {
    lockUntil = Date.now() + LOCK;
    const g = cur.el.querySelector("#sd-bot"); g.classList.add("sd-shake"); setTimeout(() => g.classList.remove("sd-shake"), 300);
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".sd")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (x) => el.querySelector("#" + x);
  const view = spec ? "host" : me, op = me === "host" ? "guest" : "host", end = s.startAt ? endAt(s) : 0;
  const cnt = (p) => foundBy(s, p).length, shared = s.mode === "shared";
  q("sd-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${cnt("host")}</b><b class="o">${esc(r.guest.name)}: ${cnt("guest")}</b>`
    : `<b class="o">أنت: ${cnt(me)}/${ND}</b><b class="x">${esc(r[op].name)}: ${cnt(op)}${shared ? "" : "/" + ND}</b>`;
  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("sd-time").textContent = Math.max(0, rem).toFixed(1);
  q("sd-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";

  let msg = shared ? "نفس الصورة للاثنين: الاختلاف لأول من يجده!" : `ابحث عن ${ND} اختلافات واضغط عليها`, final = false;
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`;
  else if (ph === "end") {
    if (!over(s)) msg = "جارٍ احتساب النتيجة…";
    else {
      final = true;
      const f = !shared && s.finish ? Object.entries(s.finish).sort((a, b) => a[1] - b[1])[0] : null;
      const h = cnt("host"), g = cnt("guest"), win = f ? f[0] : h > g ? "host" : g > h ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت! 🎉" : `فاز ${esc(r[win].name)}`) + ` (${h} مقابل ${g})` + (f ? ` ⚡ أنهى في ${((f[1] - s.startAt) / 1000).toFixed(1)} ثانية` : "");
    }
  }
  const m = q("sd-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");

  // الصور لا تظهر إلا عند بدء اللعب حتى لا يدرسها أحد قبل الآخر
  const sc = sceneOf(s.seed), live = ph === "play" || ph === "end", mineSet = new Set(foundBy(s, view)), cl = s.claim || {};
  el.querySelectorAll(".sd-c").forEach((c) => {
    const i = +c.dataset.i, top = c.dataset.p === "a", o = top ? { e: sc.a[i], t: "" } : sc.b[i];
    c.textContent = live && o.t !== "gone" ? o.e : "";
    c.classList.toggle("small", !top && o.t === "small");
    const owner = shared ? cl["c" + i] : mineSet.has(i) ? view : null;
    c.classList.toggle("mine", !!owner && (owner === view || spec));
    c.classList.toggle("theirs", !!owner && owner !== view && !spec);
  });
  q("sd-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  const cells = (p) => Array.from({ length: N }, (_, i) => `<button class="sd-c" data-i="${i}" data-p="${p}"></button>`).join("");
  el.innerHTML = `<div class="sd"><div class="c-stats" id="sd-info"></div><div class="sd-time" id="sd-time"></div>
    <div class="sd-bar"><i id="sd-bar"></i></div><p class="msg" id="sd-msg"></p>
    <h5>الصورة الأصلية</h5><div class="sd-grid" id="sd-top">${cells("a")}</div>
    <h5>الصورة المعدّلة: اضغط على الاختلافات</h5><div class="sd-grid" id="sd-bot">${cells("b")}</div>
    <button class="btn hidden" id="sd-again" style="margin-top:15px;width:100%">جولة جديدة</button></div>`;
  el.querySelector(".sd").onpointerdown = (e) => { const c = e.target.closest(".sd-c"); if (c) { e.preventDefault(); tap(+c.dataset.i); } };
  el.querySelector("#sd-again").onclick = () => cur.api.patch({ state: game.init(cur.room.state.mode) });
}

const game = {
  id: "spotDiff",
  init: (mode) => ({ seed: (Math.random() * 1e6) | 0, mode: mode === "shared" ? "shared" : "race" }),
  final(room, me) {
    const s = room.state;
    if (!over(s)) return null;
    const f = s.mode === "race" && s.finish && s.finish[me];
    return { key: s.seed + ":" + s.startAt, score: foundBy(s, me).length, time: f ? (f - s.startAt) / 1000 : null };
  },
  outcome(room) {
    const s = room.state;
    if (!over(s)) return null;
    const f = s.mode === "race" && s.finish ? Object.entries(s.finish).sort((a, b) => a[1] - b[1])[0] : null;
    if (f) return { w: f[0] };
    const h = foundBy(s, "host").length, g = foundBy(s, "guest").length;
    return { w: h > g ? "host" : g > h ? "guest" : "draw" };
  },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".sd") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;

import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000, LOCK = 400, N = 16; // المدة، العد التنازلي، عقوبة الخطأ، عدد الأرقام

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ترتيب الأرقام 1..16 يُحدد مرة واحدة من البذرة: نفس الأماكن لكلا اللاعبين وثابتة طوال الجولة
function layout(seed) {
  const r = mul(seed * 73), a = Array.from({ length: N }, (_, i) => i + 1);
  for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// تنتهي الجولة بانتهاء الوقت أو بإنهاء أحد اللاعبين كل الأرقام، أيهما أقرب
const endAt = (s) => Math.min(s.startAt + DUR, ...Object.values(s.finish || {}));
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < endAt(s) ? "play" : "end"; };

const CSS = `.nr{text-align:center}
.nr-time{font-size:2.2rem;font-weight:800}
.nr-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.nr-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.rush-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-width:300px;margin:14px auto}
.nr-tile{aspect-ratio:1;padding:0;background:#334155;color:#fff;font:800 1.6rem Cairo,sans-serif;border:0;border-radius:12px;cursor:pointer;touch-action:manipulation}
.nr-tile:active{transform:scale(.94)}
.nr-tile.empty{background:transparent;border:2px dashed var(--line);color:transparent;pointer-events:none}
.rush-grid.nr-shake{animation:nrs .25s}
@keyframes nrs{0%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(6px)}100%{transform:translateX(0)}}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;
if (!document.getElementById("nr-css")) { const st = document.createElement("style"); st.id = "nr-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, n = 0, lastStart = 0, lockUntil = 0, starting = false, tickId = null;

function tap(num) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  if (num === n + 1) {
    n++;
    const p = { [`state/scores/${me}`]: n };
    if (n === N) p[`state/finish/${me}`] = now(); // أنهى كل الأرقام: تنتهي الجولة للجميع
    api.patch(p);
  } else {
    lockUntil = Date.now() + LOCK;
    const g = cur.el.querySelector("#rush-grid");
    g.classList.add("nr-shake"); setTimeout(() => g.classList.remove("nr-shake"), 250);
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".nr")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, op = me === "host" ? "guest" : "host";
  const end = s.startAt ? endAt(s) : 0;

  q("nr-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}/${N}</b><b class="o">${esc(r.guest.name)}: ${gs}/${N}</b>`
    : `<b class="o">أنت: ${n}/${N}</b><b class="x">${esc(r[op].name)}: ${s.scores[op] || 0}/${N}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("nr-time").textContent = Math.max(0, rem).toFixed(1);
  q("nr-bar").style.width = Math.max(0, rem / (DUR / 1000)) * 100 + "%";

  let msg = "", final = false;
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`;
  else if (ph === "play") msg = spec ? "وضع المتفرج - تتبع السباق" : `اضغط الأرقام بالترتيب 🎯 <span style="font-size:1.5rem;color:var(--o)">${n + 1}</span>`;
  else if (t < end + 1500) msg = "جارٍ احتساب النتيجة النهائية…";
  else {
    final = true;
    const f = s.finish ? Object.entries(s.finish).sort((a, b) => a[1] - b[1])[0] : null; // أسرع من أنهى الأرقام
    const win = f ? f[0] : hs > gs ? "host" : gs > hs ? "guest" : null;
    msg = (!win ? "تعادل!" : win === me ? "فزت في سباق الأرقام!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})` + (f ? " ⚡ أنهى كل الأرقام أولًا" : "");
  }
  const m = q("nr-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");

  // الأرقام لا تظهر إلا عند بدء اللعب، والرقم الصحيح يختفي ويبقى مكانه فارغًا
  const cleared = spec ? Math.max(hs, gs) : n, live = ph === "play" || ph === "end";
  el.querySelectorAll(".nr-tile").forEach((tl) => {
    const num = +tl.dataset.num, gone = num <= cleared;
    tl.classList.toggle("empty", gone);
    tl.textContent = gone || !live ? "" : num;
  });
  q("nr-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  el.innerHTML = `<div class="nr">
    <div class="c-stats" id="nr-info"></div>
    <div class="nr-time" id="nr-time"></div>
    <div class="nr-bar"><i id="nr-bar"></i></div>
    <p class="msg" id="nr-msg"></p>
    <div class="rush-grid" id="rush-grid">${layout(room.state.seed).map((num) => `<button class="nr-tile" data-num="${num}"></button>`).join("")}</div>
    <button class="btn hidden" id="nr-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;
  el.querySelector("#rush-grid").onpointerdown = (e) => {
    const tl = e.target.closest(".nr-tile");
    if (tl && !tl.classList.contains("empty")) { e.preventDefault(); tap(+tl.dataset.num); }
  };
  el.querySelector("#nr-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "number-rush",
  init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 0, guest: 0 } }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; n = (s.scores && s.scores[me]) || 0; starting = false; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".nr") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 50);
  }
};
export default game;

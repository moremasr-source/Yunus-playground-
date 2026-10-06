import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000, LOCK = 300;
const DIRS = [
  { id: "up", arrow: "⬆️", name: "أعلى" },
  { id: "down", arrow: "⬇️", name: "أسفل" },
  { id: "right", arrow: "➡️", name: "يمين" },
  { id: "left", arrow: "⬅️", name: "يسار" }
];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد تسلسل الأسئلة بناءً على البذرة (Seed) لضمان العدالة التامة
function getRoundData(seed, index) {
  const r = mul(seed * 31 + index * 97);
  const centerDir = DIRS[(r() * 4) | 0];
  const flankerDir = r() < 0.6 ? centerDir : DIRS[(r() * 4) | 0]; // 60% تشابه لتوليد التشتيت
  
  // شبكة 3x3 للطيور، المركزي في المنتصف (الفهرس 4)
  let grid = Array(9).fill(flankerDir);
  grid[4] = centerDir; // الطائر الرئيسي في المنتصف
  return { centerDir, grid };
}

const CSS = `.mig{text-align:center}
.mig-time{font-size:2.2rem;font-weight:800}
.mig-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.mig-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.flock-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-width:220px;margin:15px auto}
.bird-cell{aspect-ratio:1;background:rgba(51,65,85,0.4);border:2px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.8rem}
.bird-cell.center{background:rgba(2,132,199,0.2);border-color:#38bdf8;transform:scale(1.05)}
.dir-pad{display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-width:260px;margin:15px auto}
.dir-btn{padding:18px 0;font:800 1.4rem Cairo,sans-serif;background:#334155;color:#fff;border:2px solid var(--ink);border-radius:12px;cursor:pointer;touch-action:manipulation}
.dir-btn:active{transform:scale(0.95)}
.dir-btn:disabled{opacity:.4;cursor:default}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-6px)}50%{transform:translateX(6px)}100%{transform:translateX(0)}}
.shake{animation:shake .25s}`;

if (!document.getElementById("mig-css")) { const st = document.createElement("style"); st.id = "mig-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, roundIndex = 0, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function answer(dirId) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;

  const currentRound = getRoundData(s.seed, roundIndex);
  if (dirId === currentRound.centerDir.id) {
    roundIndex++;
    api.patch({ [`state/scores/${me}`]: roundIndex });
  } else {
    lockUntil = Date.now() + LOCK;
    const gridEl = cur.el.querySelector(".flock-grid");
    if (gridEl) { gridEl.classList.add("shake"); setTimeout(() => gridEl.classList.remove("shake"), 250); }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".mig")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("mig-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0}</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("mig-time").textContent = Math.max(0, rem).toFixed(1);
  q("mig-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("mig-msg"); let msg = "ركز على اتجاه الطائر المركزي وتجاهل البقية!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع تركيز اللاعبين";
    else {
      // تحديث عرض سرب الطيور الحالي
      const currentRound = getRoundData(s.seed, roundIndex);
      const cells = el.querySelectorAll(".bird-cell");
      cells.forEach((cell, idx) => {
        cell.textContent = currentRound.grid[idx].arrow;
        cell.className = "bird-cell" + (idx === 4 ? " center" : "");
      });
    }
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في التحدي البصري!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  const on = ph === "play" && !spec && Date.now() >= lockUntil;
  el.querySelectorAll(".dir-btn").forEach((b) => (b.disabled = !on));
  q("mig-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  el.innerHTML = `<div class="mig">
    <div class="c-stats" id="mig-info"></div>
    <div class="mig-time" id="mig-time"></div>
    <div class="mig-bar"><i id="mig-bar"></i></div>
    <p class="msg" id="mig-msg"></p>
    <div class="flock-grid" id="flock-grid">
      ${Array(9).fill(0).map(() => `<div class="bird-cell">⬆️</div>`).join("")}
    </div>
    <div class="dir-pad">
      <div></div>
      <button class="dir-btn" data-dir="up">⬆️</button>
      <div></div>
      <button class="dir-btn" data-dir="left">⬅️️</button>
      <button class="dir-btn" data-dir="down">⬇️</button>
      <button class="dir-btn" data-dir="right">➡️</button>
    </div>
    <button class="btn hidden" id="mig-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector(".dir-pad").onpointerdown = (e) => {
    const btn = e.target.closest(".dir-btn");
    if (btn && !btn.disabled) {
      e.preventDefault();
      answer(btn.dataset.dir);
    }
  };

  el.querySelector("#mig-again").onclick = () => {
    roundIndex = 0;
    cur.api.patch({ state: game.init() });
  };
}

const game = {
  id: "migration",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 } 
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { 
      lastStart = st; 
      roundIndex = s.scores[me] || 0; 
      starting = false; 
    }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".mig") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

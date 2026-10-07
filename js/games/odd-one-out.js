import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000, LOCK = 400; // مدة الجولة 30 ثانية، العد التنازلي، عقوبة الخطأ

// نفس البذرة = نفس ترتيب الألغاز وتوليد الأشكال للاعبين (عدالة كاملة)
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// قائمة الرموز أو الإيموجي المستخدمة في الألغاز (أصل شكل متشابه + شكل مختلف)
const PAIRS = [
  { base: "🍎", odd: "🍏", name: "تفاحة مختلفة" },
  { base: "🐶", odd: "🐱", name: "حيوان مختلف" },
  { base: "⭐", odd: "🌟", name: "نجمة مختلفة" },
  { base: "🚗", odd: "🚕", name: "سيارة مختلفة" },
  { base: "⚽", odd: "🏀", name: "كرة مختلفة" },
  { base: "🦊", odd: "🐺", name: "حيوان مختلف" },
  { base: "🍕", odd: "🍔", name: "طعام مختلف" },
  { base: "🌵", odd: "🌴", name: "نبات مختلف" },
  { base: "🚀", odd: "🛸", name: "مركبة مختلفة" },
  { base: "💡", odd: "🔌", name: "شيء مختلف" }
];

// توليد تفاصيل اللغز بناءً على رقم الجولة (index) والبذرة (seed)
function getPuzzle(seed, roundIndex) {
  const r = mul(seed * 997 + roundIndex * 131);
  const pair = PAIRS[(r() * PAIRS.length) | 0];
  
  // حجم الشبكة يتدرج بالصعوبة كلما تقدم اللاعب في النقاط (من 2x2 إلى 4x4)
  const gridSize = roundIndex < 3 ? 4 : roundIndex < 7 ? 9 : 16; 
  const cols = gridSize === 4 ? 2 : gridSize === 9 ? 3 : 4;
  
  const oddIndex = (r() * gridSize) | 0;
  
  return {
    base: pair.base,
    odd: pair.odd,
    gridSize: gridSize,
    cols: cols,
    oddIndex: oddIndex
  };
}

const CSS = `.oo{text-align:center}
.oo-time{font-size:2.2rem;font-weight:800}
.oo-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.oo-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.oo-grid{display:grid;gap:10px;margin:15px auto;max-width:320px}
.oo-tile{aspect-ratio:1;background:#334155;border:2px solid var(--ink);border-radius:12px;font-size:2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease}
.oo-tile:hover:not(:disabled){background:#475569;transform:translateY(-2px)}
.oo-tile:active:not(:disabled){transform:scale(.95)}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("oo-css")) { const st = document.createElement("style"); st.id = "oo-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function choose(index) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  
  const currentScore = s.scores[me] || 0;
  const puzzle = getPuzzle(s.seed, currentScore);

  if (index === puzzle.oddIndex) {
    // إجابة صحيحة: زيادة النقاط وتوليد لغز جديد تلقائياً في الحالة المشتركة
    const newScore = currentScore + 1;
    api.patch({ [`state/scores/${me}`]: newScore });
  } else {
    // إجابة خاطئة: عقوبة مؤقتة واهتزاز للشبكة
    lockUntil = Date.now() + LOCK;
    const gridEl = cur.el.querySelector("#oo-grid");
    if (gridEl) {
      gridEl.classList.add("shake");
      setTimeout(() => gridEl.classList.remove("shake"), 300);
    }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".oo")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("oo-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs} نقاط</b><b class="o">${esc(r.guest.name)}: ${gs} نقاط</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0} نقاط</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0} نقاط</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("oo-time").textContent = Math.max(0, rem).toFixed(1);
  q("oo-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("oo-msg"); let msg = "ابحث عن الشكل المختلف واضغط عليه بأسرع ما يمكن!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع سباق سرعة البديهة";
    else { msg = "جد العنصر الشاذ بين الأشكال المتشابهة!"; }
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في التحدي البصري!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs} نقطة)`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث محتوى ورسم الشبكة الحالية بناءً على نقاط اللاعب الحالية
  if (ph === "play" && !spec) {
    const myScore = s.scores[me] || 0;
    const puzzle = getPuzzle(s.seed, myScore);
    const gridEl = q("oo-grid");
    
    // إعادة بناء الشبكة إذا تغيرت بنية الأشكال أو عددها
    if (gridEl.dataset.puzzleIndex !== String(myScore)) {
      gridEl.dataset.puzzleIndex = myScore;
      gridEl.style.gridTemplateColumns = `repeat(${puzzle.cols}, 1fr)`;
      
      let html = "";
      for (let i = 0; i < puzzle.gridSize; i++) {
        const item = i === puzzle.oddIndex ? puzzle.odd : puzzle.base;
        html += `<button class="oo-tile" data-index="${i}">${item}</button>`;
      }
      gridEl.innerHTML = html;
    }
  }

  q("oo-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const s = room.state;
  const me = cur ? cur.me : "host";
  const myScore = (s.scores && s.scores[me]) || 0;
  const puzzle = getPuzzle(s.seed, myScore);

  el.innerHTML = `<div class="oo">
    <div class="c-stats" id="oo-info"></div>
    <div class="oo-time" id="oo-time"></div>
    <div class="oo-bar"><i id="oo-bar"></i></div>
    <p class="msg" id="oo-msg"></p>
    <div class="oo-grid" id="oo-grid" data-puzzle-index="${myScore}" style="grid-template-columns: repeat(${puzzle.cols}, 1fr);">
      ${Array.from({ length: puzzle.gridSize }, (_, i) => {
        const item = i === puzzle.oddIndex ? puzzle.odd : puzzle.base;
        return `<button class="oo-tile" data-index="${i}">${item}</button>`;
      }).join("")}
    </div>
    <button class="btn hidden" id="oo-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#oo-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".oo-tile");
    if (btn && phase(room.state) === "play") {
      e.preventDefault();
      choose(parseInt(btn.dataset.index, 10));
    }
  };

  el.querySelector("#oo-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "odd-one-out",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 } 
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".oo") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

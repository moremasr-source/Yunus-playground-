import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000;

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد المربعات المستهدفة لكل مستوى/جولة بناءً على البذرة (Seed)
function getLevelData(seed, level) {
  const r = mul(seed * 19 + level * 73);
  const size = 4; // شبكة 4×4
  const count = Math.min(3 + level, 8); // يبدأ بـ 4 مربعات ويزداد تدريجياً
  let targets = [];
  while (targets.length < count) {
    let idx = (r() * (size * size)) | 0;
    if (!targets.includes(idx)) targets.push(idx);
  }
  return { size, targets };
}

const CSS = `.mm{text-align:center}
.mm-time{font-size:2.2rem;font-weight:800}
.mm-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.mm-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.matrix-grid{display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;max-width:240px;margin:15px auto}
.mm-cell{aspect-ratio:1;background:#334155;border:2px solid var(--ink);border-radius:10px;cursor:pointer;transition:all .15s ease;touch-action:manipulation}
.mm-cell.flash{background:#38bdf8;transform:scale(0.95)}
.mm-cell.correct{background:#22c55e}
.mm-cell.wrong{background:#ef4444}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;

if (!document.getElementById("mm-css")) { const st = document.createElement("style"); st.id = "mm-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, level = 0, flashPhase = true, selectedTiles = [], lastStart = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function handleCellClick(index) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || flashPhase) return;

  const currentData = getLevelData(s.seed, level);
  if (selectedTiles.includes(index)) return;

  selectedTiles.push(index);

  // التحقق مما إذا كان المربع ضمن المستهدفات الصحيحة
  if (!currentData.targets.includes(index)) {
    // خطأ: إعادة تعيين محاولات هذه الجولة أو خصم توازن
    selectedTiles = [];
    return;
  }

  // إذا أكمل اللاعب جميع المربعات الصحيحة لهذه الجولة
  if (selectedTiles.length === currentData.targets.length) {
    level++;
    selectedTiles = [];
    flashPhase = true;
    const newScore = (s.scores[me] || 0) + 1;
    api.patch({ [`state/scores/${me}`]: newScore });
    
    // إيقاف وميض العرض المؤقت للمستوى الجديد
    setTimeout(() => { flashPhase = false; }, 1200);
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".mm")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("mm-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت (مستوى ${level + 1}): ${s.scores[me] || 0}</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("mm-time").textContent = Math.max(0, rem).toFixed(1);
  q("mm-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("mm-msg"); let msg = "تذكر مواقع المربعات المضيئة!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع الذاكرة المكانية";
    else if (flashPhase) msg = "احفظ الأماكن جيداً...";
    else msg = "انقر على المربعات التي تذكرتها!";
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في اختبار الذاكرة!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث مظهر الخلايا
  const currentData = getLevelData(s.seed, level);
  const cells = el.querySelectorAll(".mm-cell");
  cells.forEach((cell, idx) => {
    cell.className = "mm-cell";
    if (ph === "play" && flashPhase && currentData.targets.includes(idx)) {
      cell.classList.add("flash");
    } else if (selectedTiles.includes(idx)) {
      cell.classList.add("correct");
    }
  });

  q("mm-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  level = 0;
  flashPhase = true;
  selectedTiles = [];
  setTimeout(() => { flashPhase = false; }, 1200);

  el.innerHTML = `<div class="mm">
    <div class="c-stats" id="mm-info"></div>
    <div class="mm-time" id="mm-time"></div>
    <div class="mm-bar"><i id="mm-bar"></i></div>
    <p class="msg" id="mm-msg"></p>
    <div class="matrix-grid" id="matrix-grid">
      ${Array(16).fill(0).map((_, i) => `<button class="mm-cell" data-idx="${i}"></button>`).join("")}
    </div>
    <button class="btn hidden" id="mm-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#matrix-grid").onpointerdown = (e) => {
    const cell = e.target.closest(".mm-cell");
    if (cell && !flashPhase) {
      e.preventDefault();
      handleCellClick(parseInt(cell.dataset.idx, 10));
    }
  };

  el.querySelector("#mm-again").onclick = () => {
    level = 0;
    flashPhase = true;
    selectedTiles = [];
    setTimeout(() => { flashPhase = false; }, 1200);
    cur.api.patch({ state: game.init() });
  };
}

const game = {
  id: "memory-matrix",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 } 
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { 
      lastStart = st; 
      starting = false; 
    }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".mm") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

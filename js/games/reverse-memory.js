import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 45000, LEAD = 4000, LOCK = 400; // مدة اللعبة 45 ثانية، العد التنازلي، عقوبة الخطأ

// نفس البذرة = نفس تسلسل الأنماط للاعبين (عدالة كاملة)
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد تسلسل الأنماط بناءً على مستوى صعوبة اللاعب (مستمد من نقاطه الحالية)
function getPattern(seed, level) {
  const r = mul(seed * 739 + level * 53);
  const length = Math.min(3 + Math.floor(level / 2), 7); // يبدأ بـ 3 خطوات ويزداد تدريجياً بحد أقصى 7
  let seq = [];
  for (let i = 0; i < length; i++) {
    seq.push((r() * 9) | 0); // شبكة 3x3 تحتوي على الأرقام من 0 إلى 8
  }
  return seq;
}

const CSS = `.rm{text-align:center}
.rm-time{font-size:2.2rem;font-weight:800}
.rm-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.rm-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.rm-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin:15px auto;max-width:280px}
.rm-tile{aspect-ratio:1;background:#334155;border:2px solid var(--ink);border-radius:14px;font-size:1.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease}
.rm-tile:hover:not(:disabled){background:#475569;transform:translateY(-2px)}
.rm-tile:active:not(:disabled){transform:scale(.95)}
.rm-tile.highlight{background:#38bdf8;transform:scale(1.05);box-shadow:0 0 15px rgba(56,189,248,0.6)}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("rm-css")) { const st = document.createElement("style"); st.id = "rm-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
let showingPattern = false, showStepIndex = -1, inputStep = 0, playerInput = [];

const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

// تشغيل عرض النمط بصرياً قبل أن يبدأ اللاعب بالإدخال
function triggerShowPattern(seq) {
  if (showingPattern) return;
  showingPattern = true;
  showStepIndex = 0;
  playerInput = [];
  inputStep = 0;

  const interval = setInterval(() => {
    if (!cur || phase(cur.room.state) !== "play") {
      clearInterval(interval);
      showingPattern = false;
      return;
    }
    const gridEl = cur.el.querySelector("#rm-grid");
    if (!gridEl) { clearInterval(interval); showingPattern = false; return; }
    
    // إزالة الضوء عن الكل
    gridEl.querySelectorAll(".rm-tile").forEach(t => t.classList.remove("highlight"));

    if (showStepIndex < seq.length) {
      const tile = gridEl.querySelector(`[data-index="${seq[showStepIndex]}"]`);
      if (tile) tile.classList.add("highlight");
      showStepIndex++;
    } else {
      clearInterval(interval);
      setTimeout(() => {
        if (cur && cur.el.querySelector("#rm-grid")) {
          cur.el.querySelector("#rm-grid").querySelectorAll(".rm-tile").forEach(t => t.classList.remove("highlight"));
        }
        showingPattern = false;
      }, 400);
    }
  }, 700); // سرعة إضاءة كل مربع
}

function choose(index) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || showingPattern || Date.now() < lockUntil) return;

  const currentScore = s.scores[me] || 0;
  const seq = getPattern(s.seed, currentScore);
  // الترتيب المطلوب هو العكس تماماً من النهاية إلى البداية
  const expectedValue = seq[seq.length - 1 - inputStep];

  // إضاءة مؤقتة للمربع الذي ضغط عليه اللاعب
  const tile = cur.el.querySelector(`[data-index="${index}"]`);
  if (tile) {
    tile.classList.add("highlight");
    setTimeout(() => tile.classList.remove("highlight"), 200);
  }

  if (index === expectedValue) {
    inputStep++;
    // إذا أكمل اللاعب إدخال النمط بالعكس كاملاً وبشكل صحيح
    if (inputStep === seq.length) {
      const newScore = currentScore + 1;
      api.patch({ [`state/scores/${me}`]: newScore });
    }
  } else {
    // خطأ: عقوبة وإعادة محاولة نفس التحدي
    lockUntil = Date.now() + LOCK;
    inputStep = 0; // إعادة إدخال النمط من جديد
    const gridEl = cur.el.querySelector("#rm-grid");
    if (gridEl) {
      gridEl.classList.add("shake");
      setTimeout(() => gridEl.classList.remove("shake"), 300);
    }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".rm")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("rm-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs} نجاحات</b><b class="o">${esc(r.guest.name)}: ${gs} نجاحات</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0} نجاحات</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0} نجاحات</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("rm-time").textContent = Math.max(0, rem).toFixed(1);
  q("rm-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("rm-msg"); let msg = "تذكر النمط ثم أدخله بالعكس تماماً!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع تحدي الذاكرة العكسية";
    else if (showingPattern) { msg = "👀 شاهد النمط يضيء..."; }
    else { msg = `✍️ أدخل النمط بالعكس! (متبقي ${getPattern(s.seed, s.scores[me] || 0).length - inputStep} خطوات)`; }
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في تحدي الذاكرة العكسية!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تشغيل عرض النمط إذا بدأ دور اللعب ولم يتم عرضه بعد لهذه المرحلة
  if (ph === "play" && !spec) {
    const myScore = s.scores[me] || 0;
    const gridEl = q("rm-grid");
    if (gridEl && Number(gridEl.dataset.score) !== myScore && !showingPattern) {
      gridEl.dataset.score = myScore;
      const seq = getPattern(s.seed, myScore);
      setTimeout(() => triggerShowPattern(seq), 300);
    }
  }

  q("rm-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const s = room.state;
  const me = cur ? cur.me : "host";
  const myScore = (s.scores && s.scores[me]) || 0;

  el.innerHTML = `<div class="rm">
    <div class="c-stats" id="rm-info"></div>
    <div class="rm-time" id="rm-time"></div>
    <div class="rm-bar"><i id="rm-bar"></i></div>
    <p class="msg" id="rm-msg"></p>
    <div class="rm-grid" id="rm-grid" data-score="${myScore}">
      ${Array.from({ length: 9 }, (_, i) => `<button class="rm-tile" data-index="${i}">🔹</button>`).join("")}
    </div>
    <button class="btn hidden" id="rm-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#rm-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".rm-tile");
    if (btn && phase(room.state) === "play" && !showingPattern) {
      e.preventDefault();
      choose(parseInt(btn.dataset.index, 10));
    }
  };

  el.querySelector("#rm-again").onclick = () => {
    inputStep = 0;
    cur.api.patch({ state: game.init() });
  };
}

const game = {
  id: "reverse-memory",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 } 
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; inputStep = 0; showingPattern = false; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".rm") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

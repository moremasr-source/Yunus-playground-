import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000;

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد شبكة أرقام ثابتة (مثلاً من 1 إلى 9) وتوزيعها عشوائياً وثابتًا بناءً على البذرة (Seed)
function getGridNumbers(seed) {
  const r = mul(seed * 73);
  let nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  // خلط الأرقام لتوزيعها في الأماكن الثابتة مرة واحدة فقط أول الجولة
  for (let i = nums.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums; // مصفوفة تحتوي على مواقع الأرقام الثابتة طوال الجولة
}

const CSS = `.nr{text-align:center}
.nr-time{font-size:2.2rem;font-weight:800}
.nr-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.nr-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.rush-grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;max-width:240px;margin:15px auto}
.nr-tile{aspect-ratio:1;background:#334155;color:#fff;font-size:1.8rem;font-weight:800;border:2px solid var(--ink);border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;touch-action:manipulation}
.nr-tile:active{transform:scale(0.95)}
.nr-tile.empty{background:rgba(51,65,85,0.15);border-color:rgba(255,255,255,0.05);color:transparent;cursor:default;pointer-events:none;transform:none}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;

if (!document.getElementById("nr-css")) { const st = document.createElement("style"); st.id = "nr-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function handleTap(num) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play") return;

  const currentTarget = s.targetNum || 1;
  const clickedList = s.clicked || [];

  // التأكد من أن الرقم هو المطلوب ولم يتم النقر عليه مسبقاً
  if (num === currentTarget && !clickedList.includes(num)) {
    const nextTarget = currentTarget < 9 ? currentTarget + 1 : 1; // إعادة الترتيب من 1 إذا انتهت المجموعة
    const newScore = (s.scores[me] || 0) + 1;

    api.patch({
      [`state/scores/${me}`]: newScore,
      [`state/targetNum`]: nextTarget,
      [`state/clicked/${num}`]: true
    });
  }
}

function tick() {
  if (!cur || !cur.el.querySelector(".nr")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("nr-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0}</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("nr-time").textContent = Math.max(0, rem).toFixed(1);
  q("nr-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("nr-msg"); let msg = `انقر على الرقم المطلوب: ${s.targetNum || 1}`;
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع السرعة";
    else msg = `الهدف الحالي: 🎯 <span style="font-size:1.4rem;color:#38bdf8">${s.targetNum || 1}</span>`;
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في سباق الأرقام!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث حالة الأسرار المربعات (هل تم النقر عليها لتصبح فارغة أم لا؟)
  const clicked = s.clicked || {};
  const gridNums = getGridNumbers(s.seed);
  
  gridNums.forEach((num, idx) => {
    const tile = el.querySelector(`#tile-${idx}`);
    if (tile) {
      if (clicked[num]) {
        tile.classList.add("empty");
        tile.textContent = "";
      } else {
        tile.classList.remove("empty");
        tile.textContent = num;
      }
    }
  });

  q("nr-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const gridNums = getGridNumbers(room.state.seed);

  el.innerHTML = `<div class="nr">
    <div class="c-stats" id="nr-info"></div>
    <div class="nr-time" id="nr-time"></div>
    <div class="nr-bar"><i id="nr-bar"></i></div>
    <p class="msg" id="nr-msg"></p>
    <div class="rush-grid" id="rush-grid">
      ${gridNums.map((num, idx) => `<button class="nr-tile" id="tile-${idx}" data-num="${num}">${num}</button>`).join("")}
    </div>
    <button class="btn hidden" id="nr-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#rush-grid").onpointerdown = (e) => {
    const tile = e.target.closest(".nr-tile");
    if (tile && !tile.classList.contains("empty")) {
      e.preventDefault();
      handleTap(parseInt(tile.dataset.num, 10));
    }
  };

  el.querySelector("#nr-again").onclick = () => {
    cur.api.patch({ 
      state: game.init() 
    });
  };
}

const game = {
  id: "number-rush",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 },
    targetNum: 1,
    clicked: {}
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    // إذا تم إعادة تعيين اللعبة أو بدء غرفة جديدة، نعيد بناء الشبكة
    if (!el.querySelector(".nr") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 50);
  }
};

export default game;

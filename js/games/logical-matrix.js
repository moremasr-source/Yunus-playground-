import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 50000, LEAD = 4000, LOCK = 400;

// مولد عشوائي ثابت للبذور لضمان العدالة للطرفين
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// مجموعات من الألغاز والتصنيفات المنطقية (كل لغز يحتوي على 4 مجموعات من الكلمات)
const PUZZLES = [
  {
    theme: "مجموعات متنوعة",
    groups: [
      { category: "عواصم عربية", items: ["القاهرة", "بغداد", "دمشق", "الرياض"] },
      { category: "فواكه صيفية", items: ["بطيخ", "مانجو", "شمام", "عنب"] },
      { category: "أنواع سيارات", items: ["تويوتا", "مرسيدس", "هيونداي", "نيسان"] },
      { category: "ألوان أساسية", items: ["أحمر", "أزرق", "أصفر", "أخضر"] }
    ]
  },
  {
    theme: "علوم وطبيعة",
    groups: [
      { category: "كواكب المجموعة الشمسية", items: ["المريخ", "الزهرة", "المشتري", "زحل"] },
      { category: "حالات المادة", items: ["صلب", "سائل", "غاز", "بلازما"] },
      { category: "بحار ومحيطات", items: ["الأحمر", "المتوسط", "الأطلسي", "الهادي"] },
      { category: "أجزاء النبات", items: ["جذر", "ساق", "ورقة", "زهرة"] }
    ]
  }
];

function getPuzzle(seed) {
  const r = mul(seed);
  return PUZZLES[(r() * PUZZLES.length) | 0];
}

// خلط العناصر بشكل ثابت ومبني على البذرة
function getShuffledItems(seed) {
  const puzzle = getPuzzle(seed);
  let allItems = [];
  puzzle.groups.forEach((g, gIdx) => {
    g.items.forEach(item => allItems.push({ text: item, groupIdx: gIdx }));
  });
  // خلط عشوائي
  const r = mul(seed + 99);
  for (let i = allItems.length - 1; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
  }
  return { puzzle, allItems };
}

const CSS = `.lm{text-align:center}
.lm-time{font-size:2.2rem;font-weight:800}
.lm-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.lm-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.lm-grid{display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin:15px auto;max-width:360px}
.lm-tile{aspect-ratio:1.2;background:#f8faff;border:2px solid var(--line);border-radius:12px;font-size:0.95rem;font-weight:700;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease;padding:4px;text-align:center}
.lm-tile:hover:not(:disabled){border-color:var(--o);transform:translateY(-2px)}
.lm-tile.selected{background:#38bdf8;color:#fff;border-color:#0284c7;transform:scale(0.97)}
.lm-tile.solved{background:#22c55e;color:#fff;border-color:#16a34a;cursor:default}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("lm-css")) { const st = document.createElement("style"); st.id = "lm-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
let selectedIndices = [];

const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function selectTile(index) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;

  // التأكد من أن المربع لم يتم حله مسبقاً من قبل هذا اللاعب
  const solved = s.solved && s.solved[me] ? s.solved[me] : [];
  if (solved.includes(index)) return;

  if (selectedIndices.includes(index)) {
    selectedIndices = selectedIndices.filter(i => i !== index);
  } else {
    if (selectedIndices.length < 4) {
      selectedIndices.push(index);
    }
    if (selectedIndices.length === 4) {
      // التحقق من صحة الاختيار (هل تنتمي العناصر الأربعة لنفس المجموعة؟)
      const { allItems } = getShuffledItems(s.seed);
      const firstGroup = allItems[selectedIndices[0]].groupIdx;
      const isMatch = selectedIndices.every(i => allItems[i].groupIdx === firstGroup);

      if (isMatch) {
        // صحيح! أضف العناصر إلى قائمة المجموعات المحلولة لهذا اللاعب
        const updatedSolved = [...solved, ...selectedIndices];
        const currentScore = (s.scores && s.scores[me]) || 0;
        api.patch({
          [`state/solved/${me}`]: updatedSolved,
          [`state/scores/${me}`]: currentScore + 1
        });
      } else {
        // خطأ: اهتزاز وتفريغ التحديد
        lockUntil = Date.now() + LOCK;
        const gridEl = cur.el.querySelector("#lm-grid");
        if (gridEl) {
          gridEl.classList.add("shake");
          setTimeout(() => gridEl.classList.remove("shake"), 300);
        }
      }
      selectedIndices = [];
    }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".lm")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const op = me === "host" ? "guest" : "host";
  const hs = s.scores && s.scores.host ? s.scores.host : 0;
  const gs = s.scores && s.scores.guest ? s.scores.guest : 0;
  const end = (s.startAt || 0) + DUR;

  q("lm-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}/4 مجموعات</b><b class="o">${esc(r.guest.name)}: ${gs}/4 مجموعات</b>`
    : `<b class="o">مجموعاتك: ${hs}/4</b><b class="x">مجموعات الخصم: ${gs}/4</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("lm-time").textContent = Math.max(0, rem).toFixed(1);
  q("lm-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("lm-msg"); let msg = "ابحث عن الكلمات الـ 4 ذات الصلة واضغط عليها!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ تحضير الروابط والخفايا…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع الروابط الخفية";
    else if (hs === 4 || gs === 4) { final = true; }
  } else {
    if (t < end + 1500 && hs < 4 && gs < 4) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "رائع! حللت كل الروابط الخفية وفزت!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  if (!final && (hs === 4 || gs === 4)) {
    final = true;
    const win = hs === 4 ? "host" : "guest";
    msg = (win === me ? "أكملت جميع المجموعات أولاً وفزت! 🧠🏆" : `أكمل ${esc(r[win].name)} المجموعات أولاً!`);
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث حالة الأزرار مرئياً (محددة، محلولة، أو عادية)
  if (!spec && ph === "play") {
    const solved = s.solved && s.solved[me] ? s.solved[me] : [];
    const gridEl = q("lm-grid");
    if (gridEl) {
      gridEl.querySelectorAll(".lm-tile").forEach((tile, idx) => {
        tile.className = "lm-tile";
        if (solved.includes(idx)) {
          tile.classList.add("solved");
        } else if (selectedIndices.includes(idx)) {
          tile.classList.add("selected");
        }
      });
    }
  }

  q("lm-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const s = room.state;
  const { puzzle, allItems } = getShuffledItems(s.seed);

  el.innerHTML = `<div class="lm">
    <div class="c-stats" id="lm-info"></div>
    <div class="lm-time" id="lm-time"></div>
    <div class="lm-bar"><i id="lm-bar"></i></div>
    <div class="gtitle">التصنيف: ${esc(puzzle.theme)}</div>
    <p class="msg" id="lm-msg"></p>
    
    <div class="lm-grid" id="lm-grid">
      ${allItems.map((item, i) => `<button class="lm-tile" data-index="${i}">${esc(item.text)}</button>`).join("")}
    </div>

    <button class="btn hidden" id="lm-again" style="margin-top:15px;width:100%">لغز جديد</button>
  </div>`;

  el.querySelector("#lm-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".lm-tile");
    if (btn && phase(room.state) === "play") {
      e.preventDefault();
      selectTile(parseInt(btn.dataset.index, 10));
    }
  };

  el.querySelector("#lm-again").onclick = () => {
    selectedIndices = [];
    cur.api.patch({ state: game.init() });
  };
}

const game = {
  id: "logical-matrix",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 },
    solved: { host: [], guest: [] }
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; selectedIndices = []; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".lm") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

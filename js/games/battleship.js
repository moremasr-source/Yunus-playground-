import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, LOCK = 400; // وقت أطول قليلاً للاستراتيجية (60 ثانية)

// مولد عشوائي ثابت للبذور
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد مواقع السفن بناءً على البذرة ودور اللاعب (شبكة 5×5 تحتوي على سفينتين بطول 2 و 3 مربعات مثلاً، أو توزيع 4 سفن فردية لتكون أسرع)
function getPlayerShips(seed, roleRole) {
  const r = mul(seed * 313 + (roleRole === "host" ? 11 : 99));
  // لنختر 4 خلايا سفن عشوائية وثابتة لكل لاعب من أصل 25 خلية (شبكة 5x5)
  let ships = [];
  while (ships.length < 4) {
    let cell = (r() * 25) | 0;
    if (!ships.includes(cell)) ships.push(cell);
  }
  return ships;
}

const CSS = `.bs{text-align:center}
.bs-time{font-size:2.2rem;font-weight:800}
.bs-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.bs-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.bs-boards{display:flex;gap:15px;justify-content:center;margin:15px 0;flex-wrap:wrap}
.bs-board-box{background:rgba(255,255,255,0.05);padding:10px;border-radius:12px;border:1px solid var(--line)}
.bs-board-box h4{margin:0 0 8px;font-size:0.9rem;color:var(--mut)}
.bs-grid{display:grid;grid-template-columns:repeat(5, 1fr);gap:6px;width:160px}
.bs-cell{aspect-ratio:1;background:#334155;border:1.5px solid var(--ink);border-radius:8px;font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease}
.bs-cell:hover:not(:disabled){background:#475569;transform:scale(1.05)}
.bs-cell:active:not(:disabled){transform:scale(.95)}
.bs-cell.hit{background:#ef4444;color:#fff} /* إصابة ناجحة */
.bs-cell.miss{background:#64748b;color:#cbd5e1} /* ضربة في الماء */
.bs-cell.ship{background:#38bdf8} /* سفنك الخاصة */
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("bs-css")) { const st = document.createElement("style"); st.id = "bs-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function fire(cellIndex) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;

  const op = me === "host" ? "guest" : "host";
  // التأكد من أن اللاعب لم يقصف هذه الخلية من قبل
  const shots = s.shots && s.shots[me] ? s.shots[me] : {};
  if (shots[cellIndex] !== undefined) return; // تم قصفها مسبقاً

  // التحقق مما إذا كانت الخلية تحتوي على سفينة للخصم
  const opShips = getPlayerShips(s.seed, op);
  const isHit = opShips.includes(cellIndex);

  // تحديث الطلقات في الحالة المشتركة
  const updatedShots = { ...shots, [cellIndex]: isHit ? "hit" : "miss" };
  
  // حساب عدد الإصابات الجديدة للخصم لمعرفة الفائز (4 سفن إجمالاً)
  let hitsCount = s.scores[me] || 0;
  if (isHit) {
    hitsCount++;
  }

  api.patch({
    [`state/shots/${me}`]: updatedShots,
    [`state/scores/${me}`]: hitsCount
  });

  if (!isHit) {
    lockUntil = Date.now() + LOCK; // عقوبة خطأ بسيطة أو تأخير تفاعلي عند الخطأ
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".bs")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const op = me === "host" ? "guest" : "host";
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("bs-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}/4 إصابات</b><b class="o">${esc(r.guest.name)}: ${gs}/4 إصابات</b>`
    : `<b class="o">إصاباتك: ${s.scores[me] || 0}/4</b><b class="x">إصابات الخصم: ${s.scores[op] || 0}/4</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("bs-time").textContent = Math.max(0, rem).toFixed(1);
  q("bs-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("bs-msg"); let msg = "اضغط على لوحة الخصم لقصف إحداثيات سفنه!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ تجهيز الأسطول البحري…"; }
  else if (ph === "count") { msg = `استعد! تبدأ المعركة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع المعركة البحرية";
    else if (hs >= 4 || gs >= 4) {
      // انتهت بتدمير الأسطول قبل الوقت
      final = true;
    }
  } else {
    if (t < end + 1500 && hs < 4 && gs < 4) {
      msg = "جارٍ احتساب نتيجة المعركة…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : (hs === gs ? null : (hs > gs ? "host" : "guest"));
      msg = (!win ? "تعادل!" : win === me ? "سحقت أسطول خصمك وفزت بالمعركة! 🚢💥" : `فاز ${esc(r[win].name)} في المعركة!`) + ` (${hs} مقابل ${gs})`;
    }
  }

  // إذا وصل أحد اللاعبين لـ 4 إصابات يعلن الفوز فوراً
  if (!final && (hs >= 4 || gs >= 4)) {
    final = true;
    const win = hs >= 4 ? "host" : "guest";
    msg = (win === me ? "دمرت كل سفن الخصم وفزت! 🏆" : `دمر ${esc(r[win].name)} أسطولك وفاز!`);
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث لوحات اللعب مرئياً للمستخدم إذا لم يكن متفرجاً
  if (!spec && ph === "play") {
    const myShots = s.shots && s.shots[me] ? s.shots[me] : {};
    const myShips = getPlayerShips(s.seed, me);

    // تحديث لوحة استهداف الخصم (يمين)
    const targetGrid = q("bs-target-grid");
    if (targetGrid) {
      targetGrid.querySelectorAll(".bs-cell").forEach((cell, idx) => {
        const state = myShots[idx];
        cell.className = "bs-cell";
        if (state === "hit") { cell.classList.add("hit"); cell.textContent = "💥"; }
        else if (state === "miss") { cell.classList.add("miss"); cell.textContent = "💧"; }
        else { cell.textContent = "🎯"; }
      });
    }

    // تحديث لوحة سفونك الخاصة (يسار) لرؤية أين أصابك الخصم
    const opShots = s.shots && s.shots[op] ? s.shots[op] : {};
    const fleetGrid = q("bs-fleet-grid");
    if (fleetGrid) {
      fleetGrid.querySelectorAll(".bs-cell").forEach((cell, idx) => {
        const hasShip = myShips.includes(idx);
        const hitState = opShots[idx];
        cell.className = "bs-cell";
        if (hitState === "hit") { cell.classList.add("hit"); cell.textContent = "🔥"; }
        else if (hasShip) { cell.classList.add("ship"); cell.textContent = "🚢"; }
        else { cell.textContent = "🌊"; }
      });
    }
  }

  q("bs-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  
  el.innerHTML = `<div class="bs">
    <div class="c-stats" id="bs-info"></div>
    <div class="bs-time" id="bs-time"></div>
    <div class="bs-bar"><i id="bs-bar"></i></div>
    <p class="msg" id="bs-msg"></p>
    
    <div class="bs-boards">
      <div class="bs-board-box">
        <h4>أسطولك البحري</h4>
        <div class="bs-grid" id="bs-fleet-grid">
          ${Array.from({ length: 25 }, (_, i) => `<div class="bs-cell" data-index="${i}">🌊</div>`).join("")}
        </div>
      </div>
      <div class="bs-board-box">
        <h4>لوحة قصف الخصم</h4>
        <div class="bs-grid" id="bs-target-grid">
          ${Array.from({ length: 25 }, (_, i) => `<button class="bs-cell" data-index="${i}">🎯</button>`).join("")}
        </div>
      </div>
    </div>

    <button class="btn hidden" id="bs-again" style="margin-top:15px;width:100%">معركة جديدة</button>
  </div>`;

  // التفاعل مع لوحة استهداف الخصم فقط
  el.querySelector("#bs-target-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".bs-cell");
    if (btn && phase(room.state) === "play") {
      e.preventDefault();
      fire(parseInt(btn.dataset.index, 10));
    }
  };

  el.querySelector("#bs-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "battleship",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 },
    shots: { host: {}, guest: {} }
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".bs") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

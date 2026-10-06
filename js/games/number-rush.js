import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000, LOCK = 400; // مدة اللعبة 30 ثانية، العد التنازلي، عقوبة الخطأ

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function getGridNumbers(seed) {
  const r = mul(seed * 739);
  let numbers = Array.from({ length: 16 }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers;
}

const CSS = `.nt{text-align:center}
.nt-time{font-size:2.2rem;font-weight:800}
.nt-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.nt-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.nt-grid{display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin:15px 0}
.nt-tile{aspect-ratio:1;background:#334155;border:2px solid var(--ink);border-radius:12px;font:800 1.5rem Cairo,sans-serif;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;touch-action:manipulation;transition:all .15s ease}
.nt-tile:hover:not(:disabled){background:#475569;transform:translateY(-2px)}
.nt-tile:active:not(:disabled){transform:scale(.95)}
.nt-tile.hidden{opacity:0;visibility:hidden;transform:scale(.4);pointer-events:none}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;

if (!document.getElementById("nt-css")) { const st = document.createElement("style"); st.id = "nt-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function put(num) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  
  const currentTarget = (s.scores[me] || 0) + 1;
  if (num === currentTarget) {
    const newScore = (s.scores[me] || 0) + 1;
    api.patch({ [`state/scores/${me}`]: newScore });
  } else {
    lockUntil = Date.now() + LOCK;
    const gridEl = cur.el.querySelector("#nt-grid");
    if (gridEl) {
      gridEl.classList.add("shake");
      setTimeout(() => gridEl.classList.remove("shake"), 300);
    }
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".nt")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("nt-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}/16</b><b class="o">${esc(r.guest.name)}: ${gs}/16</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0}/16</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}/16</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("nt-time").textContent = Math.max(0, rem).toFixed(1);
  q("nt-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("nt-msg"); let msg = "اضغط على الأرقام بالترتيب التصاعدي (من 1 إلى 16)!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - تتبع سباق الأرقام";
    else {
      const myScore = s.scores[me] || 0;
      if (myScore >= 16) {
        msg = "أنهيت جميع الأرقام بنجاح! في انتظار انتهاء الوقت...";
      } else {
        msg = `الرقم المطلوب الضغط عليه الآن: <b>${myScore + 1}</b>`;
      }
    }
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت بسباق الأرقام!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs} رقم)`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  const myScore = s.scores[me] || 0;
  const numbers = getGridNumbers(s.seed);
  const tiles = el.querySelectorAll(".nt-tile");
  
  tiles.forEach((tile, index) => {
    const val = numbers[index];
    const isDisabled = ph !== "play" || spec || val <= myScore || Date.now() < lockUntil;
    tile.disabled = isDisabled;
    if (val <= myScore) {
      tile.classList.add("hidden");
    } else {
      tile.classList.remove("hidden");
    }
  });

  q("nt-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const numbers = getGridNumbers(room.state.seed);
  
  el.innerHTML = `<div class="nt">
    <div class="c-stats" id="nt-info"></div>
    <div class="nt-time" id="nt-time"></div>
    <div class="nt-bar"><i id="nt-bar"></i></div>
    <p class="msg" id="nt-msg"></p>
    <div class="nt-grid" id="nt-grid">
      ${numbers.map((num) => `<button class="nt-tile" data-num="${num}">${num}</button>`).join("")}
    </div>
    <button class="btn hidden" id="nt-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#nt-grid").onpointerdown = (e) => {
    const btn = e.target.closest(".nt-tile");
    if (btn && !btn.disabled) {
      e.preventDefault();
      put(parseInt(btn.dataset.num, 10));
    }
  };

  el.querySelector("#nt-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "number-rush",
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

    if (!el.querySelector(".nt") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};

export default game;

import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 30000, LEAD = 4000; // مدة اللعبة 30 ثانية، العد التنازلي

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// توليد خصائص البالونات بناءً على البذرة المشتركة
function getBalloons(seed) {
  const r = mul(seed * 457);
  let list = [];
  // سنقوم بتوليد 30 بالونة متطايرة خلال الـ 30 ثانية
  for (let i = 0; i < 30; i++) {
    const isHostColor = r() > 0.5; // توزيع عشوائي للون البالونة (هل هي تخص المضيف أم الضيف)
    list.push({
      id: i,
      x: Math.floor(r() * 80) + 10, // موقع أفقي عشوائي بالمائة (من 10% إلى 90%)
      speed: r() * 2 + 1.5,          // سرعة الصعود
      color: isHostColor ? "host" : "guest",
      delay: i * 800                 // تأخير ظهور البالونة تدريجياً
    });
  }
  return list;
}

const CSS = `.bg-game{text-align:center;position:relative}
.bg-time{font-size:2.2rem;font-weight:800}
.bg-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.bg-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.arena{position:relative;height:320px;background:linear-gradient(to bottom, #1e293b, #0f172a);border-radius:16px;overflow:hidden;border:2px solid var(--ink);margin:15px 0}
.balloon{position:absolute;bottom:-50px;width:45px;height:55px;border-radius:50% 50% 50% 50% / 40% 40% 60% 60%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.9rem;color:#fff;user-select:none;touch-action:manipulation;transition:transform .1s}
.balloon::after{content:"";position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:2px;height:10px;background:rgba(255,255,255,0.5)}
.balloon.host-col{background:#e8333f;box-shadow:inset -5px -5px 10px rgba(0,0,0,0.3)}
.balloon.guest-col{background:#14808a;box-shadow:inset -5px -5px 10px rgba(0,0,0,0.3)}
.balloon.popped{transform:scale(0);opacity:0;pointer-events:none}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;

if (!document.getElementById("bg-css")) { const st = document.createElement("style"); st.id = "bg-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function popBalloon(balloonId, balloonColor) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play") return;

  // اللاعب يمكنه فقط تفجير البالونات التي تخص لونه
  if (balloonColor !== me) return; 

  // تسجيل البالونة المفجورة لمنع تفجيرها مرتين
  const popped = s.popped || {};
  if (popped[balloonId]) return;

  popped[balloonId] = me;
  const newScore = (s.scores[me] || 0) + 1;

  api.patch({ 
    [`state/scores/${me}`]: newScore,
    [`state/popped/${balloonId}`]: me
  });
}

function tick() {
  if (!cur || !cur.el.querySelector(".bg-game")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;

  q("bg-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="x">أنت (${me === "host" ? "الأحمر" : "الأزرق"}): ${s.scores[me] || 0}</b><b class="o">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}</b>`;

  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("bg-time").textContent = Math.max(0, rem).toFixed(1);
  q("bg-bar").style.width = Math.max(0, (rem / (DUR / 1000))) * 100 + "%";

  const msgEl = q("bg-msg"); let msg = "اضغط بسرعة على بالوناتك فقط!";
  let final = false;

  if (ph === "wait") { msg = "جارٍ التجهيز…"; }
  else if (ph === "count") { msg = `استعد! تبدأ اللعبة خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`; }
  else if (ph === "play") {
    if (spec) msg = "وضع المتفرج - راقب سباق البالونات";
    else msg = me === "host" ? "بالوناتك باللون الأحمر 🔥" : "بالوناتك باللون الأزرق 💧";
  } else {
    if (t < end + 1500) {
      msg = "جارٍ احتساب النتيجة النهائية…";
    } else {
      final = true;
      const win = hs > gs ? "host" : gs > hs ? "guest" : null;
      msg = (!win ? "تعادل!" : win === me ? "فزت في صراع البالونات!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }

  msgEl.innerHTML = msg;
  msgEl.className = "msg" + (final ? " mine" : "");

  // تحديث حالة البالونات (حركة الصعود والختفاء إذا تم تفجيرها)
  const balloons = getBalloons(s.seed);
  const popped = s.popped || {};
  const gameTime = t - (s.startAt || t);

  balloons.forEach((b) => {
    const node = el.querySelector(`#b-${b.id}`);
    if (!node) return;

    if (popped[b.id]) {
      node.classList.add("popped");
    } else if (ph === "play") {
      // حساب الارتفاع بناءً على الوقت المنقضي
      const elapsed = gameTime - b.delay;
      if (elapsed > 0) {
        const bottomPos = (elapsed / 100) * b.speed;
        node.style.bottom = bottomPos + "px";
        if (bottomPos > 340) {
          node.style.display = "none"; // اختفت خارج الحلبة
        }
      }
    }
  });

  q("bg-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  const balloons = getBalloons(room.state.seed);

  el.innerHTML = `<div class="bg-game">
    <div class="c-stats" id="bg-info"></div>
    <div class="bg-time" id="bg-time"></div>
    <div class="bg-bar"><i id="bg-bar"></i></div>
    <p class="msg" id="bg-msg"></p>
    <div class="arena" id="bg-arena">
      ${balloons.map((b) => `<div class="balloon ${b.color === 'host' ? 'host-col' : 'guest-col'}" id="b-${b.id}" style="left: ${b.x}%;" data-id="${b.id}" data-color="${b.color}">pop</div>`).join("")}
    </div>
    <button class="btn hidden" id="bg-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;

  el.querySelector("#bg-arena").onpointerdown = (e) => {
    const balloon = e.target.closest(".balloon");
    if (balloon) {
      e.preventDefault();
      popBalloon(parseInt(balloon.dataset.id, 10), balloon.dataset.color);
    }
  };

  el.querySelector("#bg-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "balloon-race",
  init: () => ({ 
    seed: (Math.random() * 1e6) | 0, 
    scores: { host: 0, guest: 0 },
    popped: {}
  }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };

    if (me === "host" && !s.startAt && !starting) { 
      starting = true; 
      api.patch({ "state/startAt": now() + LEAD }); 
    }

    if (!el.querySelector(".bg-game") || el.dataset.rc !== String(room.createdAt)) {
      build(el, room);
    }
    
    tick();
    if (!tickId) tickId = setInterval(tick, 50); // تحديث أسرع لحركة البالونات السلسة
  }
};

export default game;

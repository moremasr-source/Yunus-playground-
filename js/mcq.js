import { now } from "./rooms.js";

// محرّك مشترك لألعاب «اختر الإجابة الصحيحة» الزمنية: نفس الأسئلة بنفس الترتيب للاعبين، والأكثر إجابات صحيحة يفوز.
// لإضافة لعبة جديدة بنفس الفكرة يكفي ملف صغير يمرّر قائمة الأسئلة (انظر feelings.js).
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LEAD = 4000, LOCK = 700;
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

const CSS = `.mq{text-align:center}
.mq-time{font-size:2.2rem;font-weight:800}
.mq-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.mq-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.mq .c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
.mq-q{font-size:1.15rem;font-weight:700;line-height:1.7;padding:14px;border-radius:16px;background:#f3f6fb;margin:8px 0;min-height:96px;display:flex;align-items:center;justify-content:center}
.mq-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.mq-opts button{min-width:0;padding:16px 8px;font:700 1.05rem Cairo,sans-serif;border:2px solid var(--ink);border-radius:14px;background:#fff;color:var(--ink);cursor:pointer;touch-action:manipulation;overflow-wrap:anywhere}
.mq-opts button:active{transform:scale(.97)}
.mq-opts button:disabled{opacity:.45;cursor:default}
.mq-note{min-height:2.8em;margin:10px 0 0;font-size:.92rem;color:var(--mut);line-height:1.6}
.mq-shake{animation:mqs .3s}
@keyframes mqs{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}`;
if (!document.getElementById("mcq-css")) { const st = document.createElement("style"); st.id = "mcq-css"; st.textContent = CSS; document.head.append(st); }

// items: [{ q?: "نص السؤال", o: [الخيارات], a: فهرس الصحيح داخل o, why: "تفسير قصير يظهر بعد الإجابة" }]
export function makeMcq({ id, dur = 45000, items, question, hint }) {
  let cur = null, n = 0, lastStart = 0, lockUntil = 0, starting = false, tickId = null, note = "", noteUntil = 0;
  const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + dur ? "play" : "end"; };
  const over = (s) => s.startAt && now() > s.startAt + dur + 1500;

  function roundOf(seed, i) {
    const perm = shuffle(items.map((_, k) => k), mul(seed * 53 + 1)), it = items[perm[i % items.length]];
    const order = shuffle(it.o.map((_, k) => k), mul(seed * 97 + i * 13 + 5)); // ترتيب الخيارات يختلف في كل مرة
    return { it, order };
  }

  function pick(k) {
    const { room: r, me, api } = cur, s = r.state;
    if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
    const { it, order } = roundOf(s.seed, n);
    noteUntil = Date.now() + 2800;
    if (order[k] === it.a) { n++; note = "✅ " + it.why; api.patch({ [`state/scores/${me}`]: n }); }
    else {
      lockUntil = Date.now() + LOCK; note = "❌ " + it.why;
      const b = cur.el.querySelector("#mq-opts"); b.classList.add("mq-shake"); setTimeout(() => b.classList.remove("mq-shake"), 300);
    }
    tick();
  }

  function tick() {
    if (!cur || !cur.el.querySelector(".mq")) return;
    const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (x) => el.querySelector("#" + x);
    const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + dur, op = me === "host" ? "guest" : "host";
    q("mq-info").innerHTML = spec
      ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
      : `<b class="o">أنت: ${n}</b><b class="x">${esc(r[op].name)}: ${s.scores[op] || 0}</b>`;
    const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : dur / 1000;
    q("mq-time").textContent = Math.max(0, rem).toFixed(1);
    q("mq-bar").style.width = Math.max(0, rem / (dur / 1000)) * 100 + "%";

    let msg = hint, final = false;
    if (ph === "wait") msg = "جارٍ التجهيز…";
    else if (ph === "count") msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`;
    else if (ph === "end") {
      if (!over(s)) msg = "جارٍ احتساب النتيجة…";
      else { final = true; const win = hs > gs ? "host" : gs > hs ? "guest" : null; msg = (!win ? "تعادل!" : win === me ? "فزت!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`; }
    }
    const m = q("mq-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");

    const qEl = q("mq-q"), oEl = q("mq-opts"), key = ph === "play" && !spec ? s.seed + ":" + n : ph;
    if (oEl._k !== key) {
      oEl._k = key;
      if (ph === "play" && !spec) {
        const { it, order } = roundOf(s.seed, n);
        qEl.textContent = it.q || question;
        oEl.innerHTML = order.map((k, i) => `<button data-k="${i}">${esc(it.o[k])}</button>`).join("");
      } else { qEl.textContent = spec && ph === "play" ? "اللاعبون يجيبون…" : ph === "end" ? "انتهى الوقت!" : "…"; oEl.innerHTML = ""; }
    }
    const lock = Date.now() < lockUntil;
    oEl.querySelectorAll("button").forEach((b) => (b.disabled = lock));
    q("mq-note").textContent = Date.now() < noteUntil ? note : "";
    q("mq-again").classList.toggle("hidden", !(final && !spec));
  }

  function build(el, room) {
    el.dataset.rc = room.createdAt + ":" + room.state.seed;
    el.innerHTML = `<div class="mq"><div class="c-stats" id="mq-info"></div><div class="mq-time" id="mq-time"></div>
      <div class="mq-bar"><i id="mq-bar"></i></div><p class="msg" id="mq-msg"></p>
      <div class="mq-q" id="mq-q"></div><div class="mq-opts" id="mq-opts"></div><p class="mq-note" id="mq-note"></p>
      <button class="btn hidden" id="mq-again" style="margin-top:15px;width:100%">جولة جديدة</button></div>`;
    el.querySelector("#mq-opts").onpointerdown = (e) => { const b = e.target.closest("button"); if (b && !b.disabled) { e.preventDefault(); pick(+b.dataset.k); } };
    el.querySelector("#mq-again").onclick = () => cur.api.patch({ state: game.init() });
  }

  const game = {
    id,
    init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 0, guest: 0 } }),
    final(room, me) { const s = room.state; return over(s) ? { key: s.seed + ":" + s.startAt, score: (s.scores && s.scores[me]) || 0 } : null; },
    outcome(room) { const s = room.state; if (!over(s)) return null; const H = s.scores.host || 0, G = s.scores.guest || 0; return { w: H > G ? "host" : G > H ? "guest" : "draw" }; },
    render(el, room, me, api) {
      const s = room.state, st = s.startAt || 0;
      if (st !== lastStart) { lastStart = st; n = (s.scores && s.scores[me]) || 0; starting = false; }
      cur = { el, room, me, api };
      if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
      if (!el.querySelector(".mq") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
      tick();
      if (!tickId) tickId = setInterval(tick, 100);
    }
  };
  return game;
}

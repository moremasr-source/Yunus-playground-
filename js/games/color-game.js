import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLORS = [
  { name: "red", text: "أحمر", hex: "#e8333f", cls: "btn-red" },
  { name: "green", text: "أخضر", hex: "#1fb85a", cls: "btn-green" },
  { name: "blue", text: "أزرق", hex: "#1e7bff", cls: "btn-blue" },
  { name: "yellow", text: "أصفر", hex: "#e69500", cls: "btn-yellow" }
];
const DUR = 30000, LEAD = 4000, LOCK = 600; // مدة اللعبة، العد التنازلي، عقوبة الخطأ

// نفس البذرة = نفس تسلسل الأسئلة للاعبين (عدالة كاملة)
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function roundAt(seed, i) {
  const r = mul(seed * 997 + i), w = COLORS[(r() * 4) | 0];
  let c = COLORS[(r() * 4) | 0];
  if (c === w && r() < 0.8) c = COLORS[(COLORS.indexOf(w) + 1 + ((r() * 3) | 0)) % 4];
  return { word: w.text, color: c };
}

const CSS = `.cg{text-align:center}
.cg-time{font-size:2.2rem;font-weight:800}
.cg-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.cg-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .1s linear}
.color-display{font-size:3rem;font-weight:800;margin:10px 0 20px;height:80px;display:flex;align-items:center;justify-content:center}
.color-pad{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.color-pad button{padding:20px 0;font:800 1.3rem Cairo,sans-serif;color:#fff;border:2px solid var(--ink);border-radius:12px;cursor:pointer;touch-action:manipulation}
.color-pad button:active{transform:scale(.96)}
.color-pad button:disabled{opacity:.4;cursor:default}
.btn-red{background:#e8333f}.btn-green{background:#1fb85a}.btn-blue{background:#1e7bff}.btn-yellow{background:#ffb01f;color:var(--ink)!important}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}
@keyframes shake{0%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-5px)}100%{transform:translateX(0)}}
.shake{animation:shake .3s}`;
if (!document.getElementById("cg-css")) { const st = document.createElement("style"); st.id = "cg-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, n = 0, lastStart = 0, lockUntil = 0, starting = false, tickId = null;
const phase = (s) => { const t = now(); return !s.startAt ? "wait" : t < s.startAt ? "count" : t < s.startAt + DUR ? "play" : "end"; };

function put(name) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || phase(s) !== "play" || Date.now() < lockUntil) return;
  if (name === roundAt(s.seed, n).color.name) { n++; api.patch({ [`state/scores/${me}`]: n }); }
  else {
    lockUntil = Date.now() + LOCK;
    const w = cur.el.querySelector("#cg-word"); w.classList.add("shake"); setTimeout(() => w.classList.remove("shake"), 300);
  }
  tick();
}

function tick() {
  if (!cur || !cur.el.querySelector(".cg")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(s), t = now(), spec = me === "spec", q = (id) => el.querySelector("#" + id);
  const hs = s.scores.host || 0, gs = s.scores.guest || 0, end = (s.startAt || 0) + DUR;
  q("cg-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${hs}</b><b class="o">${esc(r.guest.name)}: ${gs}</b>`
    : `<b class="o">أنت: ${s.scores[me] || 0}</b><b class="x">${esc(r[me === "host" ? "guest" : "host"].name)}: ${s.scores[me === "host" ? "guest" : "host"] || 0}</b>`;
  const rem = ph === "play" ? (end - t) / 1000 : ph === "end" ? 0 : DUR / 1000;
  q("cg-time").textContent = rem.toFixed(1);
  q("cg-bar").style.width = (rem / (DUR / 1000)) * 100 + "%";
  const w = q("cg-word"); let msg = "اضغط على لون الحرف، وليس معنى الكلمة!", final = false;
  w.style.color = "var(--ink)";
  if (ph === "wait") { w.textContent = "جارٍ التجهيز…"; }
  else if (ph === "count") { w.textContent = Math.ceil((s.startAt - t) / 1000); msg = "استعد!"; }
  else if (ph === "play") {
    if (spec) w.textContent = "…";
    else { const rd = roundAt(s.seed, n); w.textContent = rd.word; w.style.color = rd.color.hex; }
  } else {
    w.textContent = "انتهى الوقت!";
    if (t < end + 1500) msg = "جارٍ احتساب النتيجة…";
    else {
      final = true;
      const win = hs > gs ? "host" : "guest";
      msg = (hs === gs ? "تعادل" : win === me ? "فزت!" : `فاز ${esc(r[win].name)}`) + ` (${hs} مقابل ${gs})`;
    }
  }
  const m = q("cg-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");
  const on = ph === "play" && !spec && Date.now() >= lockUntil;
  el.querySelectorAll("#cg-pad button").forEach((b) => (b.disabled = !on));
  q("cg-again").classList.toggle("hidden", !(final && !spec));
}

function build(el, room) {
  el.dataset.rc = String(room.createdAt);
  el.innerHTML = `<div class="cg"><div class="c-stats" id="cg-info"></div>
    <div class="cg-time" id="cg-time"></div><div class="cg-bar"><i id="cg-bar"></i></div>
    <p class="msg" id="cg-msg"></p><div class="color-display" id="cg-word"></div>
    <div class="color-pad" id="cg-pad">${COLORS.map((c) => `<button class="${c.cls}" data-color="${c.name}">${c.text}</button>`).join("")}</div>
    <button class="btn hidden" id="cg-again" style="margin-top:20px;width:100%">جولة جديدة</button></div>`;
  el.querySelector("#cg-pad").onpointerdown = (e) => { const c = e.target.dataset.color; if (c) { e.preventDefault(); put(c); } };
  el.querySelector("#cg-again").onclick = () => cur.api.patch({ state: game.init() });
}

const game = {
  id: "color",
  init: () => ({ seed: (Math.random() * 1e6) | 0, scores: { host: 0, guest: 0 } }),
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; n = (s.scores && s.scores[me]) || 0; starting = false; }
    cur = { el, room, me, api };
    // المنشئ يحدد وقت البداية المشترك (بتوقيت خادم Firebase) بعد انضمام الخصم
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".cg") || el.dataset.rc !== String(room.createdAt)) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 100);
  }
};
export default game;

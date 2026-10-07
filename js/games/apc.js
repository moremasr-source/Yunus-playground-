import { now } from "../rooms.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DUR = 60000, LEAD = 4000, REV = 60000, MAXI = 40; // زمن الكتابة، العد التنازلي، مهلة المراجعة، أقصى عدد أفكار
const PROMPTS = ["الكرسي", "الورقة", "علبة فارغة", "الحبل", "القلم", "الحذاء", "زجاجة بلاستيك", "المظلة", "الوسادة", "الصندوق الكرتوني", "الملعقة", "الساعة"];

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const promptOf = (seed) => PROMPTS[Math.floor(mul(seed * 17 + 3)() * PROMPTS.length)];
// توحيد الكتابة لاكتشاف التكرار (التشكيل، الألف، التاء المربوطة، "ال" التعريف)
const norm = (t) => t.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/^ال/, "").replace(/\s+/g, " ").trim();

// الأفكار مخزّنة خارج state (تحت ideas/s{seed}) حتى لا يصدر index صوتًا عند كل فكرة يكتبها الطرف الآخر
const list = (str) => (str ? str.split("|") : []);
const D = (r) => (r.ideas && r.ideas["s" + r.state.seed]) || {};
const solo = (r) => !!(r.guest && r.guest.bot);
const key = (r, k) => `ideas/s${r.state.seed}/${k}`;
const rejSet = (d, p) => new Set(((d.rej && d.rej[p]) || "").split(",").filter(Boolean).map(Number));

function phase(r) {
  const s = r.state, t = now();
  if (!s.startAt) return "wait";
  if (t < s.startAt) return "count";
  const we = s.startAt + DUR;
  if (t < we) return "write";
  const dn = D(r).done || {};
  return (solo(r) ? dn.host : dn.host && dn.guest) || t > we + REV ? "result" : "review";
}

// الفكرة تُحسب إذا لم يرفضها الآخر ولم يكتبها الآخر أيضًا (التكرار يُلغيها للاثنين)
function scoreOf(r, p) {
  const d = D(r), op = p === "host" ? "guest" : "host", w = d.w || {}, sl = solo(r);
  const mine = list(w[p]), ot = new Set(list(w[op]).map(norm)), rj = rejSet(d, sl ? p : op);
  const items = mine.map((text, i) => ({ text, st: rj.has(i) ? "rej" : !sl && ot.has(norm(text)) ? "dup" : "ok" }));
  return { items, score: items.filter((x) => x.st === "ok").length };
}

const CSS = `.ap{text-align:center}
.ap-time{font-size:2.2rem;font-weight:800}
.ap-bar{height:10px;background:#d5dee9;border-radius:6px;overflow:hidden;margin:4px 0 8px}
.ap-bar i{display:block;height:100%;width:100%;background:var(--ink);transition:width .25s linear}
.ap-prompt{font-size:1.5rem;font-weight:800;margin:6px 0;padding:14px;border-radius:16px;background:linear-gradient(135deg,rgba(249,115,22,.14),rgba(245,158,11,.14))}
.ap-hint{color:var(--mut);font-size:.85rem;margin:0 0 10px}
.ap-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0}
.ap-chip{padding:7px 12px;border-radius:999px;background:#eef2f8;border:1.5px solid var(--line);font:600 .95rem Cairo,sans-serif;color:var(--ink)}
button.ap-chip{cursor:pointer}
.ap-chip.rej{text-decoration:line-through;background:#fde8eb;border-color:var(--x);color:var(--x)}
.ap-chip.dup{background:#fff6cf;border-color:#f0c93c}
.ap-chip.ok{background:#e3f6f2;border-color:var(--o)}
.ap-col{text-align:right;margin-top:14px}.ap-col h4{margin:0}
.ap .row{margin-top:8px}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;
if (!document.getElementById("ap-css")) { const st = document.createElement("style"); st.id = "ap-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, lastStart = 0, starting = false, tickId = null;

function setHTML(el, id, html) { const n = el.querySelector("#" + id); if (n._h !== html) { n._h = html; n.innerHTML = html; } }

function add() {
  const { el, room: r, me, api } = cur;
  if (me === "spec" || phase(r) !== "write") return;
  const inp = el.querySelector("#ap-in"), text = inp.value.replace(/\|/g, " ").trim().slice(0, 40), mine = list((D(r).w || {})[me]);
  if (!text || mine.length >= MAXI) return;
  if (mine.some((x) => norm(x) === norm(text))) {
    inp.value = ""; inp.placeholder = "كتبت هذه الفكرة من قبل!";
    setTimeout(() => (inp.placeholder = "اكتب استخدامًا جديدًا…"), 1400); return;
  }
  inp.value = ""; inp.focus();
  api.patch({ [key(r, "w/" + me)]: mine.concat(text).join("|") });
}

function tick() {
  if (!cur || !cur.el.querySelector(".ap")) return;
  const { el, room: r, me } = cur, s = r.state, ph = phase(r), t = now(), spec = me === "spec", sl = solo(r), q = (id) => el.querySelector("#" + id);
  const d = D(r), w = d.w || {}, op = me === "host" ? "guest" : "host", we = (s.startAt || 0) + DUR, cnt = (p) => list(w[p]).length;

  q("ap-info").innerHTML = spec
    ? `<b class="x">${esc(r.host.name)}: ${cnt("host")}</b><b class="o">${esc(r.guest.name)}: ${cnt("guest")}</b>`
    : `<b class="o">أنت: ${cnt(me)}</b>` + (sl ? "" : `<b class="x">${esc(r[op].name)}: ${cnt(op)}</b>`);

  const rem = ph === "write" ? (we - t) / 1000 : ph === "review" || ph === "result" ? 0 : DUR / 1000;
  q("ap-time").textContent = ph === "review" || ph === "result" ? "" : Math.ceil(Math.max(0, rem)) + " ث";
  q("ap-bar").style.width = (rem / (DUR / 1000)) * 100 + "%";
  q("ap-prompt").innerHTML = ph === "wait" || ph === "count" ? "ماذا يمكن أن نفعل به؟ ستظهر الفكرة بعد قليل…" : `ما الاستخدامات غير المعتادة لـ <b>«${promptOf(s.seed)}»</b>؟`;
  q("ap-hint").classList.toggle("hidden", ph !== "write" || spec);

  let msg = "", final = false;
  if (ph === "wait") msg = "جارٍ التجهيز…";
  else if (ph === "count") msg = `استعد! تبدأ خلال ${Math.ceil((s.startAt - t) / 1000)} ثوانٍ`;
  else if (ph === "write") msg = spec ? "اللاعبون يكتبون أفكارهم…" : sl ? "اكتب أكبر عدد من الأفكار المختلفة!" : "اكتب أكبر عدد من الأفكار، والفكرة المكررة تُلغى للاثنين!";
  else if (ph === "review") msg = spec ? "جارٍ مراجعة الأفكار…" : sl ? "أنت الحكم: اضغط أي فكرة غير منطقية لحذفها" : "راجع أفكار صديقك: اضغط أي فكرة غير منطقية لرفضها";
  else {
    final = true;
    const a = scoreOf(r, "host").score, b = sl ? 0 : scoreOf(r, "guest").score;
    const win = a > b ? "host" : b > a ? "guest" : null;
    msg = sl ? `حصلت على ${a} فكرة معتمدة 🎉` : (!win ? "تعادل!" : win === me ? "فزت! 🎉" : `فاز ${esc(r[win].name)}`) + ` (${a} مقابل ${b})`;
  }
  const m = q("ap-msg"); m.innerHTML = msg; m.className = "msg" + (final ? " mine" : "");

  q("ap-write").classList.toggle("hidden", !(ph === "write" && !spec));
  q("ap-review").classList.toggle("hidden", !(ph === "review" && !spec));
  q("ap-result").classList.toggle("hidden", ph !== "result");
  q("ap-again").classList.toggle("hidden", !(final && !spec));

  if (ph === "write" && !spec) setHTML(el, "ap-mine", list(w[me]).slice().reverse().map((x) => `<span class="ap-chip">${esc(x)}</span>`).join(""));
  if (ph === "review" && !spec) {
    const rl = list(w[sl ? me : op]), rj = rejSet(d, me), mineN = new Set(list(w[me]).map(norm));
    setHTML(el, "ap-rev", rl.map((x, i) => `<button class="ap-chip ${rj.has(i) ? "rej" : !sl && mineN.has(norm(x)) ? "dup" : ""}" data-i="${i}">${esc(x)}${!sl && mineN.has(norm(x)) ? " · مكررة" : ""}</button>`).join("") || '<span class="ap-chip">لا توجد أفكار</span>');
    const dn = !!(d.done && d.done[me]), btn = q("ap-done");
    btn.disabled = dn; btn.textContent = dn ? "بانتظار الطرف الآخر…" : "تم ✓";
  }
  if (ph === "result") {
    setHTML(el, "ap-result", (sl ? ["host"] : ["host", "guest"]).map((p) => {
      const sc = scoreOf(r, p);
      return `<div class="ap-col"><h4>${esc(r[p].name)}: ${sc.score} فكرة معتمدة</h4><div class="ap-chips">${sc.items.map((it) => `<span class="ap-chip ${it.st}">${esc(it.text)}${it.st === "dup" ? " · مكررة" : it.st === "rej" ? " · مرفوضة" : ""}</span>`).join("") || '<span class="ap-chip">—</span>'}</div></div>`;
    }).join(""));
  }
}

function build(el, room) {
  el.dataset.rc = room.createdAt + ":" + room.state.seed;
  el.innerHTML = `<div class="ap">
    <div class="c-stats" id="ap-info"></div>
    <div class="ap-time" id="ap-time"></div><div class="ap-bar"><i id="ap-bar"></i></div>
    <p class="msg" id="ap-msg"></p>
    <div class="ap-prompt" id="ap-prompt"></div>
    <p class="ap-hint hidden" id="ap-hint">💭 فكّر في: شكله؟ حجمه؟ مادته؟ ماذا لو كبّرته أو صغّرته؟</p>
    <div id="ap-write" class="hidden"><div class="row"><input id="ap-in" maxlength="40" placeholder="اكتب استخدامًا جديدًا…" autocomplete="off"><button class="btn" id="ap-add">إضافة</button></div><div class="ap-chips" id="ap-mine"></div></div>
    <div id="ap-review" class="hidden"><div class="ap-chips" id="ap-rev"></div><button class="btn" id="ap-done">تم ✓</button></div>
    <div id="ap-result" class="hidden"></div>
    <button class="btn hidden" id="ap-again" style="margin-top:15px;width:100%">جولة جديدة</button>
  </div>`;
  el.querySelector("#ap-in").onkeydown = (e) => { if (e.key === "Enter") add(); };
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b || !cur) return;
    const { room: r, me, api } = cur;
    if (b.id === "ap-add") add();
    else if (b.id === "ap-again") api.patch({ state: game.init() });
    else if (me === "spec") return;
    else if (b.id === "ap-done" && phase(r) === "review") api.patch({ [key(r, "done/" + me)]: true });
    else if (b.dataset.i !== undefined && phase(r) === "review") {
      const set = rejSet(D(r), me), i = +b.dataset.i;
      set.has(i) ? set.delete(i) : set.add(i);
      api.patch({ [key(r, "rej/" + me)]: [...set].sort((x, y) => x - y).join(",") || null });
    }
  };
}

const game = {
  id: "apc",
  init: () => ({ seed: (Math.random() * 1e6) | 0 }),
  final(room, me) { return phase(room) === "result" ? { key: String(room.state.seed), score: scoreOf(room, me).score } : null; },
  render(el, room, me, api) {
    const s = room.state, st = s.startAt || 0;
    if (st !== lastStart) { lastStart = st; starting = false; }
    cur = { el, room, me, api };
    if (me === "host" && !s.startAt && !starting) { starting = true; api.patch({ "state/startAt": now() + LEAD }); }
    if (!el.querySelector(".ap") || el.dataset.rc !== room.createdAt + ":" + s.seed) build(el, room);
    tick();
    if (!tickId) tickId = setInterval(tick, 250);
  }
};
export default game;

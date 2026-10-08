const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COLORS = ["#e8475b", "#3b82f6", "#16a34a", "#f59e0b", "#8b5cf6", "#0891b2"]; // الأرقام 1-6 داخل الدوائر تساعد من لا يميّز الألوان
export const LEN = 4, MAXG = 8; // طول الشفرة وعدد المحاولات

function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// نفس البذرة = نفس الشفرة للاعبين: 4 ألوان مختلفة من 6
export function codeOf(seed) {
  const r = mul(seed * 131 + 7), a = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, LEN).join("");
}
// b = لون ومكان صحيحان، w = لون صحيح ومكانه خطأ
export function feedback(code, guess) {
  let b = 0, w = 0;
  for (let i = 0; i < LEN; i++) { if (guess[i] === code[i]) b++; else if (code.includes(guess[i])) w++; }
  return { b, w };
}

const list = (s, p) => (s.g && s.g[p] ? s.g[p].split(",") : []);
const finished = (s, p) => list(s, p).includes(codeOf(s.seed)) || list(s, p).length >= MAXG;
const isOver = (s) => !!s.winner || (finished(s, "host") && finished(s, "guest"));
const MARK = { ok: "✔", mis: "↔", no: "✕" };
const gcell = (d, st) => `<span class="mx-g">${peg(d)}<small class="mx-${st}">${MARK[st]}</small></span>`;
const peg = (d) => `<span class="mx-p" style="background:${COLORS[d]}">${+d + 1}</span>`;

const CSS = `.mx-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:14px;background:#f3f6fb;margin:6px 0}
.mx-pegs{display:flex;gap:8px}
.mx-p{width:40px;height:40px;padding:0;border-radius:50%;display:grid;place-items:center;color:#fff;font:800 1rem Cairo,sans-serif;border:0;cursor:pointer}
span.mx-p{cursor:default}
.mx-p.empty{background:#e6ebf4;border:2px dashed var(--line);color:transparent}
.mx-p:disabled{opacity:.3;cursor:default}
.mx-fb{font-size:1.05rem;letter-spacing:2px;min-width:72px;text-align:left}
.mx-pal{display:flex;justify-content:center;gap:10px;margin:14px 0 4px;flex-wrap:wrap}
.mx-leg{text-align:center;color:var(--mut);font-size:.82rem;margin:0 0 8px}
.mx-wrap .btn:disabled{opacity:.4;cursor:default}
.mx-help{background:#f3f6fb;border-radius:14px;padding:10px 14px;margin:8px 0;text-align:right}
.mx-help summary{font-weight:800;cursor:pointer}
.mx-help ol{margin:8px 0;padding-inline-start:20px;line-height:1.9}
.mx-ex{background:#fff;border:1px dashed var(--line);border-radius:12px;padding:8px 10px;font-size:.9rem;line-height:1.9}
.mx-ex .mx-p{width:26px;height:26px;font-size:.8rem}
.mx-ex .mx-pegs{display:inline-flex;gap:4px;vertical-align:middle}
.mx-g{display:flex;flex-direction:column;align-items:center;gap:2px}
.mx-g small{font-size:.85rem;font-weight:800}
.mx-ok{color:#16a34a}.mx-mis{color:#d97706}.mx-no{color:#9aa5b8}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem}`;
if (!document.getElementById("mx-css")) { const st = document.createElement("style"); st.id = "mx-css"; st.textContent = CSS; document.head.append(st); }

let draft = [], lastSeed = null, view = "host", helpOpen = localStorage.getItem("mx-help") !== "0";

const game = {
  id: "mastermind",
  init: (mode) => ({ seed: (Math.random() * 1e6) | 0, mode: mode === "guided" ? "guided" : "classic" }),
  // يستخدمها index لتسجيل انتصاراتك
  final(room, me) { const s = room.state; return isOver(s) ? { key: String(s.seed), win: s.winner === me } : null; },

  render(el, room, me, api) {
    const s = room.state, spec = me === "spec", bot = !!(room.guest && room.guest.bot);
    if (s.seed !== lastSeed) { lastSeed = s.seed; draft = []; }
    const v = spec ? view : me, op = v === "host" ? "guest" : "host", code = codeOf(s.seed);
    const mine = list(s, v), theirs = list(s, op), over = isOver(s), myDone = finished(s, v);
    const canPlay = !spec && !over && !myDone, nm = (p) => esc(room[p].name), reveal = over || (bot && myDone);

    let msg = `فكّ الشفرة: ${LEN} ألوان مختلفة، وعندك ${MAXG} محاولات`;
    if (over) msg = !s.winner ? "لم يفك أحد الشفرة 😅" : s.winner === me ? `فككتها في ${list(s, me).length} محاولات 🎉` : `فاز ${nm(s.winner)} 🏆`;
    else if (myDone && !spec) msg = bot ? "انتهت محاولاتك، جرّب مرة أخرى" : "انتهت محاولاتك، بانتظار الطرف الآخر…";

    const guided = s.mode === "guided"; // مرشد: إشارة تحت كل لون. كلاسيكي: عدد الإشارات فقط
    const rows = mine.map((g) => {
      if (guided) return `<div class="mx-row"><div class="mx-pegs">${[...g].map((d, i) => gcell(d, d === code[i] ? "ok" : code.includes(d) ? "mis" : "no")).join("")}</div></div>`;
      const f = feedback(code, g);
      return `<div class="mx-row"><div class="mx-pegs">${[...g].map((d) => peg(d)).join("")}</div><span class="mx-fb">${"⚫".repeat(f.b)}${"⚪".repeat(f.w)}${f.b + f.w ? "" : "—"}</span></div>`;
    }).join("");
    const slots = Array.from({ length: LEN }, (_, i) => draft[i] !== undefined
      ? `<button class="mx-p" data-slot="${i}" style="background:${COLORS[draft[i]]}" aria-label="إزالة">${draft[i] + 1}</button>`
      : `<span class="mx-p empty">0</span>`).join("");
    const pal = COLORS.map((c, i) => `<button class="mx-p" data-c="${i}" style="background:${c}" ${draft.length < LEN && !draft.includes(i) ? "" : "disabled"}>${i + 1}</button>`).join("");

    el.innerHTML = `<div class="mx-wrap">
      <div class="c-stats">${spec
        ? `<b class="x">${nm(v)}: ${mine.length}/${MAXG}</b><b class="o">${nm(op)}: ${theirs.length}/${MAXG}</b>`
        : `<b class="o">أنت: ${mine.length}/${MAXG}</b><b class="x">${nm(op)}: ${theirs.length}/${MAXG}</b>`}</div>
      <p class="msg ${over ? "mine" : ""}">${msg}</p>
      <details class="mx-help" ${helpOpen ? "open" : ""}>
        <summary>❓ كيف ألعب؟</summary>
        <ol>
          <li>الشفرة سرّية: <b>${LEN} ألوان مختلفة</b> (لا يتكرر لون).</li>
          <li>اضغط ${LEN} ألوان بالأسفل لتكوّن تخمينك، ثم اضغط <b>جرّب ✓</b>.</li>
          <li>${guided
            ? "تحت كل لون في تخمينك تظهر إشارة:<br>✔ لون صحيح <b>ومكانه صحيح</b><br>↔ اللون موجود <b>لكن مكانه خطأ</b><br>✕ اللون <b>غير موجود</b> في الشفرة"
            : "بعد كل تخمين تظهر إشارات:<br>⚫ لون صحيح <b>ومكانه صحيح</b><br>⚪ لون صحيح <b>لكن مكانه خطأ</b><br>— لا شيء: اللون <b>غير موجود</b><br><b>الإشارات لا تقول أي لون هو الصحيح</b>، وهذا هو التحدي: استنتج ذلك بنفسك!"}</li>
          <li>استنتج من الإشارات وعدّل تخمينك. عندك <b>${MAXG} محاولات</b>، وأول من يفكّ الشفرة يفوز 🏆</li>
        </ol>
        <div class="mx-ex"><b>مثال:</b> الشفرة <span class="mx-pegs">${peg(0)}${peg(1)}${peg(2)}${peg(3)}</span><br>تخمينك ${guided
          ? `<span class="mx-pegs">${gcell(0, "ok")}${gcell(2, "mis")}${gcell(4, "no")}${gcell(5, "no")}</span><br><small>الرقم 1 في مكانه (✔)، والرقم 3 موجود لكن مكانه خطأ (↔)، و5 و6 غير موجودين (✕).</small>`
          : `<span class="mx-pegs">${peg(0)}${peg(2)}${peg(4)}${peg(5)}</span> ← ⚫⚪<br><small>تعرف أن لونًا واحدًا في مكانه ولونًا آخر في مكان خطأ، لكن الإشارة لا تقول أيهما، فاستنتج!</small>`}</div>
      </details>
      <p class="mx-leg">${guided ? "✔ مكانه صحيح · ↔ مكانه خطأ · ✕ غير موجود" : "⚫ لون ومكان صحيحان · ⚪ لون صحيح ومكانه خطأ · — غير موجود (بلا تحديد الأماكن)"}</p>
      ${reveal ? `<div class="mx-row"><b>الشفرة</b><div class="mx-pegs">${[...code].map((d) => peg(d)).join("")}</div></div>` : ""}
      ${rows}
      ${canPlay ? `<div class="mx-row"><b>تخمينك</b><div class="mx-pegs">${slots}</div></div><div class="mx-pal">${pal}</div><button class="btn" id="mx-go" ${draft.length === LEN ? "" : "disabled"}>جرّب ✓</button>` : ""}
      ${spec ? '<button class="btn ghost" id="mx-sw">عرض لاعب آخر</button>' : ""}
      ${!spec && (over || (bot && myDone)) ? '<button class="btn" id="mx-again">جولة جديدة</button>' : ""}
    </div>`;

    el.querySelector(".mx-help").ontoggle = (e) => { helpOpen = e.target.open; localStorage.setItem("mx-help", helpOpen ? "1" : "0"); };
    el.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const again = () => game.render(el, room, me, api);
      if (b.dataset.c !== undefined && canPlay) { if (draft.length < LEN && !draft.includes(+b.dataset.c)) draft.push(+b.dataset.c); again(); }
      else if (b.dataset.slot !== undefined && canPlay) { draft.splice(+b.dataset.slot, 1); again(); }
      else if (b.id === "mx-go" && canPlay && draft.length === LEN) {
        const g = draft.join(""); draft = [];
        const q = { [`state/g/${me}`]: mine.concat(g).join(",") };
        if (g === code && !s.winner) q["state/winner"] = me; // أول من يفك الشفرة يفوز
        api.patch(q);
      }
      else if (b.id === "mx-sw") { view = view === "host" ? "guest" : "host"; again(); }
      else if (b.id === "mx-again") api.patch({ state: game.init(s.mode) });
    };
  }
};
export default game;

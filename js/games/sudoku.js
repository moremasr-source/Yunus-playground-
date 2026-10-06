const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rnd = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- توليد لغز بحل وحيد ----
function cands(g, i) {
  const r = (i / 9) | 0, c = i % 9, u = new Set();
  for (let k = 0; k < 9; k++) { u.add(g[r * 9 + k]); u.add(g[k * 9 + c]); }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) u.add(g[(br + y) * 9 + bc + x]);
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !u.has(n));
}
function pick(g) { // الخانة الفارغة الأقل احتمالات
  let best = -1, bc = null;
  for (let i = 0; i < 81; i++) if (!g[i]) { const c = cands(g, i); if (!bc || c.length < bc.length) { best = i; bc = c; if (c.length < 2) break; } }
  return [best, bc];
}
function fill(g) {
  const [i, c] = pick(g);
  if (i < 0) return true;
  for (const n of rnd(c)) { g[i] = n; if (fill(g)) return true; }
  g[i] = 0; return false;
}
function count(g, lim) {
  const [i, c] = pick(g);
  if (i < 0) return 1;
  let t = 0;
  for (const n of c) { g[i] = n; t += count(g, lim - t); if (t >= lim) break; }
  g[i] = 0; return t;
}
function make(n) {
  const g = Array(81).fill(0); fill(g);
  const sol = g.join(""), p = [...g]; let removed = 0;
  for (const i of rnd([...Array(81).keys()])) {
    const v = p[i]; p[i] = 0;
    if (count(p, 2) !== 1) p[i] = v; else if (++removed >= n) break;
  }
  return { sol, puz: p.join("") };
}

// ---- الواجهة ----
const CSS = `.sdk{direction:ltr;display:grid;grid-template-columns:repeat(9,1fr);border:3px solid var(--ink);border-radius:8px;overflow:hidden;background:#fff}
.sdk button{aspect-ratio:1;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;font:600 clamp(1rem,5.5vw,1.5rem) Cairo,sans-serif;color:var(--o);padding:0;cursor:pointer}
.sdk .g{color:var(--ink);font-weight:800;background:#eef2f7;cursor:default}
.sdk .oh{color:var(--x)}.sdk .og{color:var(--o)}
.sdk .br{border-right:2px solid var(--ink)}.sdk .bb{border-bottom:2px solid var(--ink)}
.sdk .sel{background:#fff3b0!important}
.sdk .bad{color:#fff!important;background:var(--x)!important}
.pad{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px}
.pad button{font:800 1.3rem Cairo,sans-serif;padding:10px 0;border:2px solid var(--ink);border-radius:10px;background:#fff;color:var(--ink);cursor:pointer}
.pad button:disabled{opacity:.4}`;
if (!document.getElementById("sdk-css")) { const st = document.createElement("style"); st.id = "sdk-css"; st.textContent = CSS; document.head.append(st); }

let cur = null, sel = -1, bad = -1, lastPuz = "", keys = false, view = "host";

function put(d) {
  const { room: r, me, api } = cur, s = r.state;
  if (me === "spec" || sel < 0 || s.puz[sel] !== "0" || s.winner || s.over) return;
  if (s.mode === "race") {
    const b = s.boards[me], nb = b.slice(0, sel) + d + b.slice(sel + 1), p = { [`state/boards/${me}`]: nb };
    if (nb === s.sol) p["state/winner"] = me;
    api.patch(p);
  } else {
    if (d === "0" || s.board[sel] !== "0") return;
    if (d === s.sol[sel]) {
      const nb = s.board.slice(0, sel) + d + s.board.slice(sel + 1);
      const p = { "state/board": nb, "state/owner": s.owner.slice(0, sel) + me[0] + s.owner.slice(sel + 1), [`state/scores/${me}`]: s.scores[me] + 1 };
      if (nb === s.sol) p["state/over"] = true;
      api.patch(p);
    } else {
      api.patch({ [`state/scores/${me}`]: s.scores[me] - 1 });
      bad = sel; draw(); setTimeout(() => { bad = -1; draw(); }, 700);
    }
  }
}

function draw() {
  const { el, room: r, me, api } = cur, s = r.state, race = s.mode === "race";
  const spec = me === "spec", v = spec ? view : me, op = v === "host" ? "guest" : "host";
  const b = race ? s.boards[v] : s.board;
  const over = race ? !!s.winner : !!s.over;
  let cells = "";
  for (let i = 0; i < 81; i++) {
    const v = b[i], row = (i / 9) | 0, col = i % 9;
    let c = s.puz[i] !== "0" ? "g" : v === "0" ? "" : race ? (v !== s.sol[i] ? "bad" : "") : "o" + s.owner[i];
    if (col % 3 === 2 && col < 8) c += " br";
    if (row % 3 === 2 && row < 8) c += " bb";
    if (i === sel) c += " sel";
    if (i === bad) c += " bad";
    cells += `<button class="${c}" data-i="${i}">${v === "0" ? "" : v}</button>`;
  }
  const prog = (bd) => { let n = 0; for (let i = 0; i < 81; i++) if (s.puz[i] === "0" && bd[i] === s.sol[i]) n++; return n; };
  const total = [...s.puz].filter((x) => x === "0").length;
  let info, msg = "";
  if (race) {
    info = `<b class="o">${spec ? esc(r[v].name) : "أنت"}: ${prog(b)}/${total}</b><b>${esc(r[op].name)}: ${prog(s.boards[op])}/${total}</b>`;
    if (over) msg = s.winner === me ? "فزت! أكملت اللغز أولًا" : `فاز ${esc(r[s.winner].name)}`;
  } else {
    info = `<b class="x">${esc(r.host.name)}: ${s.scores.host}</b><b class="o">${esc(r.guest.name)}: ${s.scores.guest}</b>`;
    if (over) msg = s.scores.host === s.scores.guest ? "تعادل" : (s.scores.host > s.scores.guest ? "host" : "guest") === me ? "فزت!" : `فاز ${esc(r[s.scores.host > s.scores.guest ? "host" : "guest"].name)}`;
    else msg = "نقطة لكل خانة صحيحة، وخصم للخطأ";
  }
  const pad = [1, 2, 3, 4, 5, 6, 7, 8, 9].concat(race ? [0] : []).map((d) => `<button data-d="${d}" ${over ? "disabled" : ""}>${d || "⌫"}</button>`).join("");
  el.innerHTML = `<div class="score">${info}</div><p class="msg ${over ? "mine" : ""}">${msg || "&nbsp;"}</p>
    <div class="sdk">${cells}</div>${spec ? "" : `<div class="pad">${pad}</div>`}
    ${spec && race ? '<button class="btn" id="sw">عرض لوحة الطرف الآخر</button>' : ""}${over && !spec ? '<button class="btn" id="again">لغز جديد</button>' : ""}`;
  el.querySelector(".sdk").onclick = (e) => { const i = e.target.dataset.i; if (i !== undefined) { sel = +i; draw(); } };
  const pd = el.querySelector(".pad");
  if (pd) pd.onclick = (e) => { const d = e.target.dataset.d; if (d !== undefined) put(d); };
  const sw = el.querySelector("#sw");
  if (sw) sw.onclick = () => { view = view === "host" ? "guest" : "host"; draw(); };
  const again = el.querySelector("#again");
  if (again) again.onclick = () => api.patch({ state: game.init(s.mode, s.diff) });
}

const game = {
  id: "sudoku",
  init(mode, diff = "medium") {
    const { puz, sol } = make({ easy: 38, hard: 54 }[diff] || 46);
    return mode === "shared"
      ? { mode, diff, puz, sol, board: puz, owner: "0".repeat(81), scores: { host: 0, guest: 0 } }
      : { mode: "race", diff, puz, sol, boards: { host: puz, guest: puz } };
  },
  render(el, room, me, api) {
    if (room.state.puz !== lastPuz) { lastPuz = room.state.puz; sel = -1; }
    cur = { el, room, me, api };
    draw();
    if (!keys) {
      keys = true;
      document.addEventListener("keydown", (e) => {
        if (!cur || document.activeElement.tagName === "INPUT") return;
        if (/^[1-9]$/.test(e.key)) put(e.key);
        else if (e.key === "Backspace" || e.key === "Delete") put("0");
      });
    }
  }
};
export default game;

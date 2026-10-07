import { now } from "./rooms.js";
import { getBalloons } from "./games/balloon-game.js";

// الروبوت يلعب دور "الضيف" من جهاز المنشئ، بنفس الكتابات التي يكتبها لاعب حقيقي.
const DUR = 30000;
const pick = (a) => a[(Math.random() * a.length) | 0];
const jit = (ms) => ms * (0.7 + Math.random() * 0.6);

// الفاصل (بالملّي ثانية) بين كل نقطة يحرزها الروبوت: [سهل، متوسط، صعب]. قلّله ليصبح أسرع.
const PACE = {
  color: [2200, 1300, 800], migration: [1700, 1050, 680], memoryMatrix: [9000, 6000, 4200],
  numberRush: [1900, 1400, 1000], balloonRace: [1400, 900, 550], sudoku: [7000, 4500, 2800]
};

function due(c, t) {
  if (!c.next) c.next = t + jit(c.pace);
  if (t < c.next) return false;
  c.next = t + jit(c.pace);
  return true;
}
const live = (s, t) => s.startAt && t >= s.startAt && t < Math.min(s.startAt + DUR, ...Object.values(s.finish || {}));
const score = (r, p, c) => { const t = now(); if (live(r.state, t) && due(c, t)) p({ "state/scores/guest": (r.state.scores.guest || 0) + 1 }); };

// ---- XO ----
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function check(b) {
  for (const l of LINES) if (b[l[0]] !== "-" && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { w: b[l[0]], line: l.join("") };
  return b.includes("-") ? null : { w: "draw", line: "" };
}
function best(b, turn) { // minimax: +1 فوز الروبوت (O)، -1 فوز اللاعب (X)
  const r = check(b);
  if (r) return r.w === "O" ? 1 : r.w === "X" ? -1 : 0;
  let bs = turn === "O" ? -2 : 2;
  for (let i = 0; i < 9; i++) if (b[i] === "-") {
    const sc = best(b.slice(0, i) + turn + b.slice(i + 1), turn === "O" ? "X" : "O");
    bs = turn === "O" ? Math.max(bs, sc) : Math.min(bs, sc);
  }
  return bs;
}
function xoMove(b, lvl) {
  const free = [...b].map((c, i) => (c === "-" ? i : -1)).filter((i) => i >= 0);
  if (lvl === 0) return pick(free);
  const set = (i, m) => b.slice(0, i) + m + b.slice(i + 1);
  if (lvl === 1) {
    const w = free.find((i) => (check(set(i, "O")) || {}).w === "O"); if (w !== undefined) return w;
    const k = free.find((i) => (check(set(i, "X")) || {}).w === "X"); if (k !== undefined) return k;
    return pick(free);
  }
  let bs = -2, ms = [];
  for (const i of free) { const sc = best(set(i, "O"), "X"); if (sc > bs) { bs = sc; ms = [i]; } else if (sc === bs) ms.push(i); }
  return pick(ms);
}

const BOTS = {
  color: score, migration: score, memoryMatrix: score,

  numberRush: (r, p, c) => {
    const s = r.state, t = now();
    if (!live(s, t) || !due(c, t)) return;
    const n = (s.scores.guest || 0) + 1;
    if (n > 16) return;
    const q = { "state/scores/guest": n };
    if (n === 16) q["state/finish/guest"] = t;
    p(q);
  },

  balloonRace: (r, p, c) => {
    const s = r.state, t = now();
    if (!live(s, t) || !due(c, t)) return;
    const pop = s.popped || {}, el = t - s.startAt;
    const b = getBalloons(s.seed).find((b) => b.color === "guest" && !pop[b.id] && el - b.delay > 0 && ((el - b.delay) / 100) * b.speed < 340);
    if (b) p({ "state/scores/guest": (s.scores.guest || 0) + 1, [`state/popped/${b.id}`]: "guest" });
  },

  xo: (r, p, c) => {
    const s = r.state;
    if (s.winner || s.turn !== "guest") { c.wait = 0; return; }
    const t = Date.now();
    if (!c.wait) c.wait = t + 500 + Math.random() * 600; // "تفكير" قصير
    if (t < c.wait) return;
    c.wait = 0;
    const i = xoMove(s.board, c.lvl), b = s.board.slice(0, i) + "O" + s.board.slice(i + 1), res = check(b);
    const q = { "state/board": b, "state/turn": "host", "state/winner": res ? (res.w === "X" ? "host" : res.w === "O" ? "guest" : "draw") : null, "state/line": res ? res.line : null };
    if (res && res.w === "O") q["state/scores/guest"] = (s.scores.guest || 0) + 1;
    p(q);
  },

  sudoku: (r, p, c) => {
    const s = r.state;
    if (s.winner || s.over || !due(c, now())) return;
    const empty = [];
    if (s.mode === "race") {
      const b = s.boards.guest;
      for (let i = 0; i < 81; i++) if (s.puz[i] === "0" && b[i] !== s.sol[i]) empty.push(i);
      if (!empty.length) return;
      const i = pick(empty), nb = b.slice(0, i) + s.sol[i] + b.slice(i + 1), q = { "state/boards/guest": nb };
      if (nb === s.sol) q["state/winner"] = "guest";
      p(q);
    } else {
      for (let i = 0; i < 81; i++) if (s.board[i] === "0") empty.push(i);
      if (!empty.length) return;
      if (Math.random() < c.miss) { p({ "state/scores/guest": (s.scores.guest || 0) - 1 }); return; } // خطأ أحيانًا
      const i = pick(empty), nb = s.board.slice(0, i) + s.sol[i] + s.board.slice(i + 1);
      const q = { "state/board": nb, "state/owner": s.owner.slice(0, i) + "g" + s.owner.slice(i + 1), "state/scores/guest": (s.scores.guest || 0) + 1 };
      if (nb === s.sol) q["state/over"] = true;
      p(q);
    }
  }
};

// يعمل على جهاز المنشئ فقط. مستوى "train" = لا يلعب الروبوت (إلا XO فيلعب عشوائيًا).
export function startBot(getRoom, patch, isHost) {
  let ctx = null, key = "";
  const id = setInterval(() => {
    const r = getRoom();
    if (!r || !r.guest || !r.guest.bot || !isHost()) return;
    const f = BOTS[r.game], s = r.state || {};
    if (!f) return;
    const lv = r.guest.bot, i = { easy: 0, medium: 1, hard: 2 }[lv];
    const k = [r.game, s.seed || s.puz || "", s.startAt || 0, s.round || 0, lv].join(":");
    if (k !== key) { key = k; ctx = { lvl: i || 0, pace: (PACE[r.game] || [])[i || 0], miss: [0.15, 0.07, 0][i || 0] }; }
    if (lv === "train" && r.game !== "xo") return;
    f(r, patch, ctx);
  }, 200);
  return () => clearInterval(id);
}

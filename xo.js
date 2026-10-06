const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function check(b) {
  for (const l of LINES) if (b[l[0]] !== "-" && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { w: b[l[0]] === "X" ? "host" : "guest", line: l.join("") };
  return b.includes("-") ? null : { w: "draw", line: "" };
}

export default {
  id: "xo",
  init: () => ({ board: "---------", turn: "host", scores: { host: 0, guest: 0 }, round: 1 }),

  render(el, room, me, api) {
    const s = room.state, other = me === "host" ? "guest" : "host";
    const done = !!s.winner, mine = !done && s.turn === me;
    const wl = s.line || "";
    const cells = [...s.board].map((c, i) =>
      `<button class="cell ${c === "X" ? "x" : c === "O" ? "o" : ""} ${wl.includes(i) ? "win" : ""}" data-i="${i}" ${c !== "-" || !mine ? "disabled" : ""} aria-label="خانة ${i + 1}">${c === "-" ? "" : c}</button>`).join("");
    let msg;
    if (s.winner === "draw") msg = "تعادل";
    else if (done) msg = s.winner === me ? "فزت!" : `فاز ${esc(room[s.winner].name)}`;
    else msg = mine ? "دورك" : `دور ${esc(room[s.turn].name)}`;
    el.innerHTML = `
      <div class="score"><b class="x">${esc(room.host.name)} (X): ${s.scores.host}</b><b class="o">${esc(room.guest.name)} (O): ${s.scores.guest}</b></div>
      <p class="msg ${mine ? "mine" : ""}">${msg}</p>
      <div class="board">${cells}</div>
      ${done ? '<button class="btn" id="again">العب مرة أخرى</button>' : ""}`;

    el.querySelector(".board").onclick = (e) => {
      const i = e.target.dataset.i;
      if (i === undefined || !mine || s.board[i] !== "-") return;
      const b = s.board.slice(0, i) + (me === "host" ? "X" : "O") + s.board.slice(+i + 1);
      const r = check(b);
      const p = { "state/board": b, "state/turn": other, "state/winner": r ? r.w : null, "state/line": r ? r.line : null };
      if (r && r.w !== "draw") p[`state/scores/${r.w}`] = s.scores[r.w] + 1;
      api.patch(p);
    };
    const again = el.querySelector("#again");
    if (again) again.onclick = () => api.patch({
      "state/board": "---------", "state/winner": null, "state/line": null,
      "state/round": s.round + 1, "state/turn": (s.round + 1) % 2 ? "host" : "guest"
    });
  }
};

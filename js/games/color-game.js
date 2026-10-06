const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

const COLORS = [
  { name: 'red', text: 'أحمر', hex: '#ff4757', btnClass: 'btn-red' },
  { name: 'green', text: 'أخضر', hex: '#2ed573', btnClass: 'btn-green' },
  { name: 'blue', text: 'أزرق', hex: '#1e90ff', btnClass: 'btn-blue' },
  { name: 'yellow', text: 'أصفر', hex: '#ffa502', btnClass: 'btn-yellow' }
];

function makeRound() {
  const wordObj = rnd(COLORS);
  const colorObj = rnd(COLORS);
  return { word: wordObj.text, correctColor: colorObj.name, displayColorHex: colorObj.hex };
}

const CSS = `.color-game{direction:rtl;text-align:center;padding:10px}
.color-display{font-size:3rem;font-weight:800;margin:25px 0;height:90px;display:flex;align-items:center;justify-content:center;letter-spacing:2px;text-shadow:0 4px 10px rgba(0,0,0,0.2);transition:transform 0.1s ease}
.color-pad{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:20px}
.color-pad button{padding:18px;font-size:1.3rem;font-weight:800;color:#fff;border:2px solid var(--ink);border-radius:12px;cursor:pointer;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.1s}
.color-pad button:active{transform:scale(0.95)}
.btn-red{background-color:#ff4757}
.btn-green{background-color:#2ed573}
.btn-blue{background-color:#1e90ff}
.btn-yellow{background-color:#ffa502;color:#17283d!important}
.c-stats{display:flex;justify-content:space-between;font-weight:800;font-size:1.1rem;margin-bottom:10px}
@keyframes shake {
  0% { transform: translate(1px, 1px); }
  20% { transform: translate(-3px, 0px); }
  40% { transform: translate(1px, -1px); }
  60% { transform: translate(-3px, 1px); }
  80% { transform: translate(1px, -1px); }
  100% { transform: translate(0, 0); }
}
.shake { animation: shake 0.3s; }`;

if (!document.getElementById("color-game-css")) { 
  const st = document.createElement("style"); 
  st.id = "color-game-css"; 
  st.textContent = CSS; 
  document.head.append(st); 
}

let cur = null, bad = -1, lastRoundId = "";

function put(selectedColor) {
  const { room: r, me, api } = cur, s = r.state;
  if (s.winner || s.over) return;

  const isCorrect = (selectedColor === s.correctColor);
  const currentScore = s.scores[me] || 0;

  if (isCorrect) {
    const newScore = currentScore + 1;
    const nextR = makeRound();
    const patchData = { 
      [`state/scores/${me}`]: newScore,
      "state/word": nextR.word,
      "state/correctColor": nextR.correctColor,
      "state/displayColorHex": nextR.displayColorHex,
      "state/roundId": Math.random().toString(36).substring(7)
    };
    if (newScore >= 10) {
      patchData["state/winner"] = me;
      patchData["state/over"] = true;
    }
    api.patch(patchData);
  } else {
    const newScore = Math.max(0, currentScore - 1);
    bad = 1;
    api.patch({ [`state/scores/${me}`]: newScore });
    draw();
    setTimeout(() => { bad = -1; draw(); }, 400);
  }
}

function draw() {
  const { el, room: r, me, api } = cur, s = r.state;
  const op = me === "host" ? "guest" : "host";
  const over = !!s.over || !!s.winner;

  let info = `<b class="o">أنت: ${s.scores[me]}</b><b class="x">${esc(r[op] ? r[op].name : "الخصم")}: ${s.scores[op]}</b>`;
  let msg = "";
  if (over) {
    msg = s.winner === me ? "فزت في تحدي الألوان!" : `فاز ${esc(r[s.winner] ? r[s.winner].name : "الخصم")}`;
  } else {
    msg = "اضغط على لون الحرف المكتوب وليس الكلمة!";
  }

  const padHtml = COLORS.map(c => 
    `<button class="${c.btnClass}" data-color="${c.name}" ${over ? "disabled" : ""}>${c.text}</button>`
  ).join("");

  el.innerHTML = `
    <div class="color-game">
      <div class="c-stats">${info}</div>
      <p class="msg ${over ? "mine" : ""}">${msg}</p>
      <div class="color-display ${bad === 1 ? 'shake' : ''}" style="color: ${s.displayColorHex};">${s.word}</div>
      <div class="color-pad">${padHtml}</div>
      ${over ? '<button class="btn" id="color-again" style="margin-top:20px; width:100%;">لعبة جديدة</button>' : ""}
    </div>
  `;

  el.querySelector(".color-pad").onclick = (e) => {
    const col = e.target.dataset.color;
    if (col) put(col);
  };

  const againBtn = el.querySelector("#color-again");
  if (againBtn) {
    againBtn.onclick = () => api.patch({ state: game.init("race") });
  }
}

const game = {
  id: "color-game",
  init(mode) {
    const firstR = makeRound();
    return {
      mode: mode || "race",
      word: firstR.word,
      correctColor: firstR.correctColor,
      displayColorHex: firstR.displayColorHex,
      roundId: "init",
      scores: { host: 0, guest: 0 },
      winner: null,
      over: false
    };
  },
  render(el, room, me, api) {
    if (room.state.roundId !== lastRoundId) {
      lastRoundId = room.state.roundId;
    }
    cur = { el, room, me, api };
    draw();
  }
};

export default game;

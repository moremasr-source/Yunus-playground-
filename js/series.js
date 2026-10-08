import { now } from "./rooms.js";

// مدد الألعاب الزمنية بالملّي ثانية (نفس الثوابت داخل ملفات الألعاب)
const DURS = { color: 30000, migration: 30000, memoryMatrix: 30000, balloonRace: 30000, oddOneOut: 30000, reverseMemory: 45000 };

// يحدد هل انتهت اللعبة الحالية ومن فاز: { w: "host" | "guest" | "draw" } أو null إن لم تنتهِ.
// نفس الحساب يجريه الطرفان فتكون النتيجة واحدة، وتُكتب مرة واحدة في البطولة.
export function outcome(r, G) {
  const s = r.state || {}, sc = s.scores || {}, H = sc.host || 0, Gu = sc.guest || 0, t = now();
  const cmp = () => (H > Gu ? "host" : Gu > H ? "guest" : "draw");
  const after = (dur) => s.startAt && t > s.startAt + dur + 1500; // بعد مهلة احتساب النتيجة
  switch (r.game) {
    case "xo": return s.winner ? { w: s.winner } : null;
    case "sudoku": return s.mode === "race" ? (s.winner ? { w: s.winner } : null) : (s.over ? { w: cmp() } : null);
    case "mastermind": return G.mastermind.final(r, "host") ? { w: s.winner || "draw" } : null;
    case "apc": {
      const a = G.apc.final(r, "host"), b = G.apc.final(r, "guest");
      if (!a) return null;
      const x = a.score, y = b ? b.score : 0;
      return { w: x > y ? "host" : y > x ? "guest" : "draw" };
    }
    case "numberRush": {
      const f = s.finish ? Object.entries(s.finish).sort((p, q) => p[1] - q[1])[0] : null; // أول من أنهى الأرقام
      if (f && t > f[1] + 1500) return { w: f[0] };
      return after(30000) ? { w: cmp() } : null;
    }
    case "logicalMatrix": return H >= 4 || Gu >= 4 || after(50000) ? { w: cmp() } : null;
    case "battleship": return H >= 4 || Gu >= 4 || after(90000) ? { w: cmp() } : null;
    default: return DURS[r.game] && after(DURS[r.game]) ? { w: cmp() } : null;
  }
}

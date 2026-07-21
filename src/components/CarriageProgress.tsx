const SPRING: Record<string, string> = {
  red: "#C94F4F",
  blue: "#4C6FA5",
  yellow: "#D9A441",
  green: "#5E8C61",
  plum: "#6242A6",
};

export default function CarriageProgress({
  value,
  goal,
  color = "plum",
}: {
  value: number;
  goal: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(goal, 1)) * 100));
  const c = SPRING[color] ?? SPRING.plum;
  return (
    <div className="track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={goal}>
      <div className="track-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}88, ${c})` }} />
      <div className="track-carriage" style={{ left: `max(11px, min(calc(100% - 11px), ${pct}%))` }} />
    </div>
  );
}

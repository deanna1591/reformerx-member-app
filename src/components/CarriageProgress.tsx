const SPRING: Record<string, string> = {
  red: "#B96A5E",
  blue: "#7C8AA0",
  yellow: "#C9A96A",
  green: "#9AA284",
  sage: "#8F8D74",
};

export default function CarriageProgress({
  value,
  goal,
  color = "sage",
}: {
  value: number;
  goal: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(goal, 1)) * 100));
  const c = SPRING[color] ?? SPRING.sage;
  return (
    <div className="track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={goal}>
      <div className="track-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${c}88, ${c})` }} />
      <div className="track-carriage" style={{ left: `max(11px, min(calc(100% - 11px), ${pct}%))` }} />
    </div>
  );
}

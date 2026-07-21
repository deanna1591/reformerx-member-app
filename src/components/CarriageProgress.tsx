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
  const stations = goal >= 2 && goal <= 12 ? goal : 0;
  return (
    <div className="relative h-[22px]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={goal}>
      <div className="absolute inset-x-0 top-[9px] h-1 rounded-full bg-line" />
      <div
        className="absolute left-0 top-[9px] h-1 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: c }}
      />
      {stations > 0 && (
        <div className="absolute inset-0 flex items-center justify-between">
          {Array.from({ length: stations }, (_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full border-2"
              style={
                i < value
                  ? { background: c, borderColor: c }
                  : { background: "#FDFCF9", borderColor: "#C9C6B8" }
              }
            />
          ))}
        </div>
      )}
      <div
        className="absolute top-[2px] grid h-[18px] w-[22px] place-items-center rounded-[5px] bg-ink transition-all duration-700"
        style={{ left: `max(0px, min(calc(100% - 22px), calc(${pct}% - 11px)))` }}
      >
        <span className="h-[2px] w-[10px] rounded-full bg-sage" />
      </div>
    </div>
  );
}

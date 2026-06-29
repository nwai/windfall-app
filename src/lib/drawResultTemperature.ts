export interface DrawResultTemperatureStyle {
  background: string;
  border: string;
  color: string;
  fontWeight: number;
}

const ZERO_COUNT_STYLE: DrawResultTemperatureStyle = {
  background: "#dbeafe",
  border: "1px solid #93c5fd",
  color: "#1e3a8a",
  fontWeight: 800,
};

const POSITIVE_COUNT_STOPS: DrawResultTemperatureStyle[] = [
  { background: "#fce7f3", border: "1px solid #f9a8d4", color: "#831843", fontWeight: 800 },
  { background: "#fbcfe8", border: "1px solid #f472b6", color: "#831843", fontWeight: 800 },
  { background: "#f9a8d4", border: "1px solid #ec4899", color: "#831843", fontWeight: 800 },
  { background: "#fb7185", border: "1px solid #f43f5e", color: "#881337", fontWeight: 800 },
  { background: "#ef4444", border: "1px solid #dc2626", color: "#ffffff", fontWeight: 800 },
  { background: "#dc2626", border: "1px solid #b91c1c", color: "#ffffff", fontWeight: 800 },
];

export function drawResultTemperatureStyle(count: number, maxCount: number): DrawResultTemperatureStyle {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (safeCount === 0) {
    return ZERO_COUNT_STYLE;
  }

  const safeMax = Number.isFinite(maxCount) ? Math.max(1, Math.round(maxCount)) : 1;
  const ratio = Math.min(1, safeCount / safeMax);
  const stopIndex = Math.min(
    POSITIVE_COUNT_STOPS.length - 1,
    Math.max(0, Math.ceil(ratio * POSITIVE_COUNT_STOPS.length) - 1),
  );

  return POSITIVE_COUNT_STOPS[stopIndex];
}

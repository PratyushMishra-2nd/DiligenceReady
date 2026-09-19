import { periodLabel } from "../lib/format";

/**
 * Open findings, period by period, as one line.
 *
 * A firm's question about a client is not "how many findings this month" — it
 * is "is this book getting better or worse". Thirteen numbers answer that and
 * a reader has to hold all thirteen to see it; a line answers it at a glance
 * and costs eighteen pixels.
 *
 * Drawn as an inline SVG rather than with a chart library: it is one polyline
 * over data the page already has, and a charting dependency would make this a
 * client component and ship a hundred kilobytes to draw it.
 *
 * It carries no axis and no gridline on purpose. It is not for reading values
 * off — the table under it holds those — it is for reading the shape, and the
 * accessible description states the trend in words for anyone who cannot.
 */
export function Sparkline({
  points,
  width = 120,
  height = 20,
}: {
  points: { period: string; value: number }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.value);
  const highest = Math.max(...values, 1);
  const step = (width - 2) / (points.length - 1);

  // y is inverted: SVG counts down from the top, findings count up from none.
  const coordinates = points.map((point, index) => {
    const x = 1 + index * step;
    const y = height - 1 - (point.value / highest) * (height - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const first = points[0];
  const last = points[points.length - 1];
  const direction =
    last.value === first.value ? "unchanged" : last.value > first.value ? "up" : "down";
  const lastY = height - 1 - (last.value / highest) * (height - 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="overflow-visible"
      role="img"
      aria-label={`Open findings by period, ${periodLabel(first.period)} to ${periodLabel(
        last.period,
      )}: ${first.value} then ${last.value}, trend ${direction}`}
    >
      <polyline
        points={coordinates.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* The newest period, marked. Which end is 'now' is not obvious on a
          bare line, and reading it backwards inverts the trend. */}
      <circle
        cx={width - 1}
        cy={lastY}
        r="1.75"
        className={last.value > first.value ? "fill-exposure" : "fill-reconciled"}
      />
    </svg>
  );
}

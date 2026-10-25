"use client";

import { useRef, useState } from "react";
import { shortDay, useElementWidth } from "./useElementWidth";

const PAD_X = 6;
const PAD_Y = 6;

/** Single-series trend line with an area wash, end marker and hover crosshair. */
export function Sparkline({
  days,
  values,
  format,
  label,
  height = 56,
}: {
  days: string[];
  values: number[];
  format: (v: number) => string;
  label: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(1, ...values);
  const step = values.length > 1 ? (width - PAD_X * 2) / (values.length - 1) : 0;
  const px = (i: number) => PAD_X + step * i;
  const py = (v: number) => PAD_Y + (height - PAD_Y * 2) * (1 - v / max);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(v)}`).join("");
  const area = values.length > 0 ? `${line}L${px(values.length - 1)},${height - PAD_Y}L${px(0)},${height - PAD_Y}Z` : "";
  const last = values.length - 1;
  const focus = active ?? last;

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && values.length > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          className="block"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.round((e.clientX - rect.left - PAD_X) / Math.max(step, 1));
            setActive(Math.min(last, Math.max(0, i)));
          }}
          onMouseLeave={() => setActive(null)}
        >
          <path d={area} fill="var(--series-1)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <line x1={px(active)} x2={px(active)} y1={PAD_Y / 2} y2={height - PAD_Y / 2} stroke="var(--chart-axis)" strokeWidth={1} />
          )}
          <circle cx={px(focus)} cy={py(values[focus])} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
      {active !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-hairline bg-surface px-2 py-1 text-xs shadow-pop"
          style={{ left: Math.min(Math.max(px(active), 50), width - 50) }}
        >
          <span className="text-ink-muted">{shortDay(days[active])}</span>{" "}
          <span className="tabular-nums font-medium text-ink-primary">{format(values[active])}</span>
        </div>
      )}
    </div>
  );
}

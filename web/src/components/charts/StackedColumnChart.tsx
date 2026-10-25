"use client";

import { KeyboardEvent, useRef, useState } from "react";
import { compactNumber, niceMax, shortDay, useElementWidth } from "./useElementWidth";

export type ColumnSeries = { key: string; label: string; color: string; values: number[] };

const MARGIN = { top: 8, right: 4, bottom: 24, left: 36 };
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

// Rect with only the data-end (top) corners rounded; square at the baseline.
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function StackedColumnChart({
  days,
  series,
  height = 240,
  title,
}: {
  days: string[];
  series: ColumnSeries[];
  height?: number;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const totals = days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const yMax = niceMax(Math.max(0, ...totals));
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const band = days.length > 0 ? plotW / days.length : 0;
  const barW = Math.max(1, Math.min(MAX_BAR, band - GAP));
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 70))));

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const current = active ?? (e.key === "ArrowLeft" ? days.length : -1);
    setActive(Math.min(days.length - 1, Math.max(0, current + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const tooltipLeft =
    active !== null ? Math.min(Math.max(MARGIN.left + band * active + band / 2, 80), Math.max(80, width - 80)) : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-[13px] font-medium text-ink-muted hover:text-ink-primary"
          aria-pressed={showTable}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      <div ref={containerRef}>
      {showTable ? (
        <div className="max-h-[280px] overflow-auto rounded-xl border border-hairline">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums divide-y divide-hairline">
              {days.map((day, i) => (
                <tr key={day}>
                  <td className="px-3 py-1.5 text-ink-secondary">{shortDay(day)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right">
                      {(s.values[i] ?? 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right font-medium">{totals[i].toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" style={{ height }}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`${title}. Use left and right arrow keys to inspect days.`}
              tabIndex={0}
              onKeyDown={onKeyDown}
              onMouseLeave={() => setActive(null)}
              onBlur={() => setActive(null)}
              className="block outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-brand"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={MARGIN.left}
                    x2={width - MARGIN.right}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                  <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
                    {compactNumber(t)}
                  </text>
                </g>
              ))}

              {days.map((day, i) => {
                const x = MARGIN.left + band * i + (band - barW) / 2;
                let base = 0;
                const visible = series.filter((s) => (s.values[i] ?? 0) > 0);
                const dim = active !== null && active !== i;
                return (
                  <g key={day} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                    {visible.map((s, segIndex) => {
                      const value = s.values[i];
                      const top = y(base + value);
                      const bottom = y(base);
                      base += value;
                      const isTop = segIndex === visible.length - 1;
                      const h = bottom - top - (segIndex > 0 ? GAP : 0);
                      if (h <= 0) return null;
                      return isTop ? (
                        <path key={s.key} d={topRoundedRect(x, top, barW, h, RADIUS)} fill={s.color} />
                      ) : (
                        <rect key={s.key} x={x} y={top} width={barW} height={h} fill={s.color} />
                      );
                    })}
                    {i % labelEvery === 0 && (
                      <text
                        x={MARGIN.left + band * i + band / 2}
                        y={height - 6}
                        textAnchor="middle"
                        className="fill-ink-muted text-[11px]"
                      >
                        {shortDay(day)}
                      </text>
                    )}
                    <rect
                      x={MARGIN.left + band * i}
                      y={MARGIN.top}
                      width={band}
                      height={plotH}
                      fill="transparent"
                      onMouseEnter={() => setActive(i)}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs shadow-pop"
              style={{ left: tooltipLeft }}
            >
              <div className="mb-1 font-medium text-ink-primary">{shortDay(days[active])}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 text-ink-secondary">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden="true" />
                    {s.label}
                  </span>
                  <span className="tabular-nums text-ink-primary">{(s.values[active] ?? 0).toLocaleString()}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-hairline pt-1 font-medium text-ink-primary">
                <span>Total</span>
                <span className="tabular-nums">{totals[active].toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

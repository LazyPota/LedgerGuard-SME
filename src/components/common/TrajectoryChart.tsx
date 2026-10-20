import React, { useState } from 'react';
import { DailyCashPoint } from '@/contracts/ledgerGuardContract';
import { formatCurrency } from '@/utils/formatters';

interface TrajectoryChartProps {
  data: DailyCashPoint[];
  payrollFloor: string;
}

export const TrajectoryChart: React.FC<TrajectoryChartProps> = ({
  data,
  payrollFloor,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<DailyCashPoint | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-400 font-mono">
        No trajectory data available.
      </div>
    );
  }

  // Chart dimensions
  const width = 800;
  const height = 260;
  const padding = { top: 30, right: 30, bottom: 40, left: 70 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find min and max cash values across baseline, optimized, and floor
  const floorVal = parseFloat(payrollFloor) || 50000;
  let minVal = floorVal;
  let maxVal = floorVal;

  data.forEach((p) => {
    const base = parseFloat(p.baseline_cash);
    const opt = parseFloat(p.optimized_cash);
    if (!isNaN(base)) {
      if (base < minVal) minVal = base;
      if (base > maxVal) maxVal = base;
    }
    if (!isNaN(opt)) {
      if (opt < minVal) minVal = opt;
      if (opt > maxVal) maxVal = opt;
    }
  });

  // Pad the Y scale for clarity
  const yMin = Math.max(0, Math.floor((minVal - 5000) / 10000) * 10000);
  const yMax = Math.ceil((maxVal + 5000) / 10000) * 10000;
  const yRange = yMax - yMin || 1;

  const minDay = data[0].day_index;
  const maxDay = data[data.length - 1].day_index;
  const dayRange = maxDay - minDay || 1;

  const getX = (day: number) => padding.left + ((day - minDay) / dayRange) * chartWidth;
  const getY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

  // Generate SVG path for Baseline (unoptimized)
  const baselinePoints = data.map((p) => `${getX(p.day_index)},${getY(parseFloat(p.baseline_cash))}`);
  const baselinePath = `M ${baselinePoints.join(' L ')}`;

  // Generate SVG path for Optimized
  const optimizedPoints = data.map((p) => `${getX(p.day_index)},${getY(parseFloat(p.optimized_cash))}`);
  const optimizedPath = `M ${optimizedPoints.join(' L ')}`;

  // Floor Y coordinate
  const floorY = getY(floorVal);

  return (
    <div className="relative select-none" data-testid="trajectory-chart">
      {/* Chart Legend */}
      <div className="flex flex-wrap items-center justify-between pb-3 text-xs gap-3 font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-emerald-400 inline-block rounded" />
            <span className="text-slate-200 font-semibold">LedgerGuard-SME Optimized</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-crimson-400 border-b border-dashed border-crimson-400 inline-block" />
            <span className="text-slate-400">Unoptimized Early Pay</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-amber-400/80 inline-block" />
            <span className="text-amber-400 font-semibold">Payroll Floor ($50k)</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400">
          Day 15 Dip: <span className="text-crimson-400 font-semibold">$38,000</span> (Unoptimized) vs{' '}
          <span className="text-emerald-400 font-semibold">$50,000</span> (Optimized + LOC)
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[650px] bg-slate-950/70 border border-slate-800 rounded-lg"
        >
          {/* Grid lines and Y axis ticks */}
          {[yMin, yMin + yRange * 0.33, yMin + yRange * 0.66, yMax].map((tickVal, idx) => {
            const y = getY(tickVal);
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  ${(tickVal / 1000).toFixed(0)}k
                </text>
              </g>
            );
          })}

          {/* Mandatory Payroll Reserve Floor Reference Line */}
          <line
            x1={padding.left}
            y1={floorY}
            x2={width - padding.right}
            y2={floorY}
            stroke="#F59E0B"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text
            x={width - padding.right - 5}
            y={floorY - 6}
            textAnchor="end"
            fill="#FBBF24"
            fontSize="10"
            fontWeight="600"
            fontFamily="JetBrains Mono, monospace"
          >
            Payroll Reserve Floor: $50,000
          </text>

          {/* X Axis Day Labels */}
          {data.map((p, idx) => {
            const x = getX(p.day_index);
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 4}
                  stroke="#334155"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  D{p.day_index}
                </text>
              </g>
            );
          })}

          {/* Unoptimized Path (Red dashed) */}
          <path
            d={baselinePath}
            fill="none"
            stroke="#EF4444"
            strokeWidth="2"
            strokeDasharray="5 4"
            opacity="0.85"
          />

          {/* LedgerGuard Optimized Path (Emerald solid) */}
          <path
            d={optimizedPath}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Interactive Data Point Markers */}
          {data.map((p, idx) => {
            const x = getX(p.day_index);
            const yOpt = getY(parseFloat(p.optimized_cash));
            const yBase = getY(parseFloat(p.baseline_cash));
            const isPayrollDay = p.day_index === 15;

            return (
              <g key={idx}>
                {/* Baseline point marker */}
                <circle
                  cx={x}
                  y={yBase}
                  r="3.5"
                  fill="#EF4444"
                  stroke="#0B0F19"
                  strokeWidth="1.5"
                />
                {/* Optimized point marker */}
                <circle
                  cx={x}
                  y={yOpt}
                  r={isPayrollDay ? '6' : '4.5'}
                  fill={isPayrollDay ? '#F59E0B' : '#10B981'}
                  stroke="#0B0F19"
                  strokeWidth="2"
                  className="cursor-pointer hover:r-6 transition-all"
                  onMouseEnter={() => {
                    setHoveredPoint(p);
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip Overlay */}
      {hoveredPoint && (
        <div
          className="absolute z-30 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-2xl text-xs font-mono w-64 pointer-events-none -translate-x-1/2 -translate-y-full mb-3"
          style={{
            left: `${((hoveredPoint.day_index - minDay) / dayRange) * 80 + 10}%`,
            top: '40%',
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-1.5">
            <span className="font-bold text-slate-200">
              Day {hoveredPoint.day_index} ({hoveredPoint.date})
            </span>
            {hoveredPoint.event_label && (
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1 rounded">
                EVENT
              </span>
            )}
          </div>
          {hoveredPoint.event_label && (
            <p className="text-[11px] text-amber-300 font-sans mb-1.5 leading-snug">
              {hoveredPoint.event_label}
            </p>
          )}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Optimized Cash:</span>
              <strong className="text-emerald-400">
                {formatCurrency(hoveredPoint.optimized_cash)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Unoptimized Cash:</span>
              <strong className="text-crimson-400">
                {formatCurrency(hoveredPoint.baseline_cash)}
              </strong>
            </div>
            {parseFloat(hoveredPoint.credit_draw) > 0 && (
              <div className="flex justify-between text-indigo-300">
                <span>Credit Draw (LOC):</span>
                <strong>+{formatCurrency(hoveredPoint.credit_draw)}</strong>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Payroll Floor:</span>
              <span>${payrollFloor}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

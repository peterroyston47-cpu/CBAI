import { useState } from 'react';
import { formatAssetPrice } from '../utils/format';

interface PriceChartProps {
  data: number[];
  symbol: string;
  positive: boolean;
  height?: number;
}

export function PriceChart({ data, symbol, positive, height = 220 }: PriceChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center border border-slate-800 bg-[#0E1420] rounded-lg text-xs text-slate-400"
        style={{ height }}
      >
        No price series available for {symbol}
      </div>
    );
  }

  const width = 760;
  const padX = 12;
  const padY = 18;
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = Math.max(maxVal - minVal, maxVal * 0.01 || 0.01);

  const points = data.map((val, idx) => {
    const x = padX + (idx / Math.max(data.length - 1, 1)) * (width - padX * 2);
    const y = padY + (1 - (val - minVal) / range) * (height - padY * 2);
    return { x, y, val };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`;

  const strokeColor = positive ? '#10B981' : '#EF4444';
  const fillStop = positive ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)';

  const activePoint = hoverIdx !== null ? points[hoverIdx] : points[points.length - 1];
  const activeHourLabel = hoverIdx !== null ? `T-${data.length - 1 - hoverIdx}h` : 'Spot';

  return (
    <div className="relative select-none">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-mono tabular-nums">
          {activeHourLabel}: <strong className="text-slate-100 font-medium">{formatAssetPrice(activePoint.val)}</strong>
        </span>
        <span className="font-mono tabular-nums">
          24h Range: {formatAssetPrice(minVal)} — {formatAssetPrice(maxVal)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible"
        style={{ height }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillStop} />
            <stop offset="100%" stopColor="rgba(11, 15, 23, 0)" />
          </linearGradient>
        </defs>

        {/* Horizontal reference lines */}
        {[0.25, 0.5, 0.75].map((ratio) => {
          const y = padY + ratio * (height - padY * 2);
          return (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="#1E293B"
              strokeDasharray="3 4"
              strokeWidth="1"
            />
          );
        })}

        <path d={areaPath} fill={`url(#grad-${symbol})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {hoverIdx !== null && (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padY}
              y2={height - padY}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r="4.5" fill={strokeColor} stroke="#0B0F17" strokeWidth="2" />
          </>
        )}

        {/* Invisible hover columns for precise scrubbing */}
        {points.map((pt, idx) => {
          const colW = (width - padX * 2) / points.length;
          return (
            <rect
              key={idx}
              x={pt.x - colW / 2}
              y={0}
              width={colW}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return null;
  const w = 72;
  const h = 24;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, max * 0.01 || 0.01);

  const d = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = 2 + (1 - (val - min) / range) * (h - 4);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path
        d={d}
        fill="none"
        stroke={positive ? '#10B981' : '#EF4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

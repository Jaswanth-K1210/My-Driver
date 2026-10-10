import { useState } from 'react'

/**
 * Single-series daily bar chart: one hue (brand red), recessive grid, rounded
 * data ends on the baseline, a hover/focus tooltip per bar, and a table view
 * for anyone who prefers or needs the numbers.
 */
export default function BarChart({ data, valueKey, format = (v) => v, label, height = 180 }) {
  const [active, setActive] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...data.map((d) => d[valueKey]))
  // Round the axis top to a tidy number so gridlines land on readable values.
  const step = 10 ** Math.floor(Math.log10(max))
  const top = Math.ceil(max / step) * step
  const ticks = [0, top / 2, top]
  const W = 600
  const H = height
  const padL = 44
  const padB = 22
  const plotW = W - padL
  const plotH = H - padB - 8
  const bw = plotW / data.length
  const barW = Math.max(2, bw - 2) // 2px surface gap between bars
  const dayLabel = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const labelEvery = Math.ceil(data.length / 6)

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Day</th><th className="px-3 py-2 text-right">{label}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d) => (
                <tr key={d.day}><td className="px-3 py-1.5 text-slate-600">{dayLabel(d.day)}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-900">{format(d[valueKey])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${label} per day`}>
            {ticks.map((t) => {
              const y = 8 + plotH - (t / top) * plotH
              return (
                <g key={t}>
                  <line x1={padL} x2={W} y1={y} y2={y} stroke="#EAECF0" strokeWidth="1" />
                  <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#667085">{format(t)}</text>
                </g>
              )
            })}
            {data.map((d, i) => {
              const h = (d[valueKey] / top) * plotH
              const x = padL + i * bw + 1
              const y = 8 + plotH - h
              return (
                <g key={d.day}>
                  {/* Hit target is the full column, larger than the bar. */}
                  <rect
                    x={padL + i * bw} y={8} width={bw} height={plotH} fill="transparent"
                    tabIndex={0}
                    aria-label={`${dayLabel(d.day)}: ${format(d[valueKey])}`}
                    onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                  />
                  {h > 0 && (
                    <path
                      // Rounded top, square baseline.
                      d={`M${x},${8 + plotH} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, barW / 2)},${y} H${x + barW - Math.min(4, barW / 2)} Q${x + barW},${y} ${x + barW},${y + Math.min(4, h)} V${8 + plotH} Z`}
                      fill={active === i ? '#B0161C' : '#E01E26'}
                      pointerEvents="none"
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#667085">{dayLabel(d.day)}</text>
                  )}
                </g>
              )
            })}
          </svg>
          {active != null && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${((padL + active * bw + bw / 2) / W) * 100}%`, top: 4 }}
            >
              <p className="font-semibold">{format(data[active][valueKey])}</p>
              <p className="text-slate-300">{dayLabel(data[active].day)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

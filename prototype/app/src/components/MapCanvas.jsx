const ROUTE_POINTS = [
  { x: 28, y: 206 },
  { x: 96, y: 172 },
  { x: 128, y: 110 },
  { x: 210, y: 92 },
  { x: 268, y: 44 },
  { x: 312, y: 30 },
]

const SEGMENTS = ROUTE_POINTS.slice(0, -1).map((pt, i) => {
  const next = ROUTE_POINTS[i + 1]
  return { from: pt, to: next, len: Math.hypot(next.x - pt.x, next.y - pt.y) }
})

const TOTAL_LEN = SEGMENTS.reduce((sum, s) => sum + s.len, 0)

function pointAt(progress) {
  const target = TOTAL_LEN * Math.min(Math.max(progress, 0), 100) / 100
  let acc = 0
  for (const seg of SEGMENTS) {
    if (acc + seg.len >= target) {
      const t = (target - acc) / seg.len
      return {
        x: seg.from.x + (seg.to.x - seg.from.x) * t,
        y: seg.from.y + (seg.to.y - seg.from.y) * t,
      }
    }
    acc += seg.len
  }
  return ROUTE_POINTS[ROUTE_POINTS.length - 1]
}

function routePath() {
  return ROUTE_POINTS.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')
}

export default function MapCanvas({ progress = 0, className }) {
  const vehicle = pointAt(progress)

  return (
    <svg viewBox="0 0 340 240" className={className} role="img" aria-label={`Trip map, ${Math.round(progress)}% complete`}>
      <rect width="340" height="240" rx="12" fill="#F6F6F8" />
      <g stroke="#E2E2E8" strokeWidth="7">
        <path d="M0 52 H340 M0 118 H340 M0 184 H340 M64 0 V240 M148 0 V240 M232 0 V240 M304 0 V240" />
      </g>
      <g stroke="#ECECF1" strokeWidth="2">
        <path d="M0 22 H340 M0 86 H340 M0 152 H340 M0 218 H340 M32 0 V240 M106 0 V240 M190 0 V240 M268 0 V240" />
      </g>
      <path d={routePath()} fill="none" stroke="#D0D0D8" strokeWidth="4" strokeLinecap="round" strokeDasharray="7 6" className="route-dash" />
      <circle cx={ROUTE_POINTS[0].x} cy={ROUTE_POINTS[0].y} r="6" fill="#16161C" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx={ROUTE_POINTS.at(-1).x} cy={ROUTE_POINTS.at(-1).y} r="6" fill="#E01E26" stroke="#FFFFFF" strokeWidth="2" />
      <g transform={`translate(${vehicle.x}, ${vehicle.y})`}>
        <circle r="15" fill="#E01E26" opacity="0.18">
          <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="7.5" fill="#E01E26" stroke="#FFFFFF" strokeWidth="2.5" />
      </g>
    </svg>
  )
}

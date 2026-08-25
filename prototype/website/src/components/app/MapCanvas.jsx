/**
 * The SVG is drawn with preserveAspectRatio="slice", so at wide aspect ratios
 * the top and bottom of the 240-unit viewBox get cropped. Keeping every route
 * point inside y 60–175 guarantees the pickup and destination markers stay
 * visible in both the wide web map and the narrow phone map.
 */
const ROUTE_POINTS = [
  { x: 24, y: 172 },
  { x: 92, y: 150 },
  { x: 130, y: 108 },
  { x: 206, y: 92 },
  { x: 262, y: 70 },
  { x: 316, y: 62 },
]

const SEGMENTS = ROUTE_POINTS.slice(0, -1).map((pt, i) => {
  const next = ROUTE_POINTS[i + 1]
  return { from: pt, to: next, len: Math.hypot(next.x - pt.x, next.y - pt.y) }
})

const TOTAL_LEN = SEGMENTS.reduce((sum, s) => sum + s.len, 0)

function pointAt(progress) {
  const target = (TOTAL_LEN * Math.min(Math.max(progress, 0), 100)) / 100
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

const ROUTE_PATH = ROUTE_POINTS.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ')

export default function MapCanvas({ progress = 0, className }) {
  const vehicle = pointAt(progress)
  const travelled = (TOTAL_LEN * Math.min(Math.max(progress, 0), 100)) / 100

  return (
    <svg
      viewBox="0 0 340 240"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Trip map, ${Math.round(progress)} percent complete`}
    >
      <rect width="340" height="240" fill="#F9FAFB" />
      <g stroke="#EAECF0" strokeWidth="7">
        <path d="M0 52 H340 M0 118 H340 M0 184 H340 M64 0 V240 M148 0 V240 M232 0 V240 M304 0 V240" />
      </g>
      <g stroke="#F2F4F7" strokeWidth="2">
        <path d="M0 22 H340 M0 86 H340 M0 152 H340 M0 218 H340 M32 0 V240 M106 0 V240 M190 0 V240 M268 0 V240" />
      </g>
      {/* Full route, then the travelled portion drawn over it in brand red. */}
      <path d={ROUTE_PATH} fill="none" stroke="#D0D5DD" strokeWidth="4" strokeLinecap="round" strokeDasharray="7 6" />
      <path
        d={ROUTE_PATH}
        fill="none"
        stroke="#E01E26"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${travelled} ${TOTAL_LEN}`}
      />
      <circle cx={ROUTE_POINTS[0].x} cy={ROUTE_POINTS[0].y} r="6" fill="#101828" stroke="#FFFFFF" strokeWidth="2" />
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

import { FlaskConical } from 'lucide-react'
import { cn } from '../../lib/utils.js'

/**
 * Marks UI that is NOT backed by the Phase 1 API, so simulated data is never
 * mistaken for real data. See DEMO_FEATURES in lib/config.js for the list and
 * which backend phase each one is waiting on.
 */
export default function DemoBadge({ title = 'Not connected to the backend yet', className }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700',
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demo
    </span>
  )
}

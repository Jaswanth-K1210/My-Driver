import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '../../lib/utils.js'

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

/**
 * A real street map with a handful of coloured pins.
 *
 * `points`: [{ id, lat, lng, color, label }]. Points with no coordinates are
 * skipped. The view fits all pins once, then stays where the user leaves it,
 * so a moving driver does not yank the map around every frame.
 */
export default function RoadMap({ points, className, label = 'Map' }) {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const fitted = useRef(false)

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([17.44, 78.39], 12)
    L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])

  useEffect(() => {
    const shown = (points ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    layer.current.clearLayers()
    for (const p of shown) {
      L.circleMarker([p.lat, p.lng], {
        radius: 9, color: '#fff', weight: 3, fillColor: p.color, fillOpacity: 1,
      })
        .bindTooltip(p.label)
        .addTo(layer.current)
    }
    if (!fitted.current && shown.length > 0) {
      map.current.fitBounds(shown.map((p) => [p.lat, p.lng]), { padding: [48, 48], maxZoom: 15 })
      fitted.current = true
    }
  }, [points])

  // isolate: Leaflet panes use z-index 400+, which would otherwise paint over
  // the app's modals and the SOS overlay.
  return <div ref={el} role="region" aria-label={label} className={cn('isolate', className)} />
}

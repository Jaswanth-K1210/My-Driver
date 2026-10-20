import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/apiClient.js'

/**
 * The console's live feed over the WebSocket (SUBSCRIBE_OPS on the gateway).
 * One socket per tab, shared by every screen that uses it and closed when the
 * last one unmounts.
 *
 * Returns true while this view is subscribed. Screens keep a slow poll as a
 * backstop and poll at full speed whenever this is false: before the first
 * connect, after a drop, or for a role the gateway refuses.
 */
let realtime = null
let users = 0
let retry = null

function connect(rt) {
  rt.connect()
    // Every screen left while the ticket was in flight: close the late socket.
    .then(() => realtime !== rt && rt.close())
    .catch(() => {
      // The first connect has no automatic reconnect; retry while someone needs it.
      retry = setTimeout(() => realtime === rt && connect(rt), 5000)
    })
}

function acquire() {
  users++
  if (!realtime) {
    realtime = api.realtime()
    connect(realtime)
  }
  return realtime
}

function release() {
  users--
  if (users > 0) return
  clearTimeout(retry)
  realtime?.close()
  realtime = null
}

const FRAME = { board: 'OPS_CHANGED', map: 'DRIVERS_LIVE' }

export function useOpsFeed(view, onFrame) {
  const [live, setLive] = useState(false)
  const handler = useRef(onFrame)
  useEffect(() => {
    handler.current = onFrame
  })

  useEffect(() => {
    const rt = acquire()
    const offs = [
      rt.on(FRAME[view], (frame) => handler.current(frame)),
      rt.on('OPS_SUBSCRIBED', (frame) => frame.view === view && setLive(true)),
      rt.on('ERROR', (frame) => frame.code === 'FORBIDDEN_OPS' && setLive(false)),
    ]
    rt.subscribeOps(view)
    // A dropped socket loses the subscription until the reconnect re-sends it.
    const watchdog = setInterval(() => !rt.isOpen && setLive(false), 2000)
    return () => {
      clearInterval(watchdog)
      for (const off of offs) off()
      rt.unsubscribeOps(view)
      release()
    }
  }, [view])

  return live
}

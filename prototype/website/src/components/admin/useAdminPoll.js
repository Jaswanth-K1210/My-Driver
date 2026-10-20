import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Polls an API call on an interval.
 *
 * The live board and map get pushes over the console feed (useOpsFeed) and
 * poll only as a backstop; other console screens just poll.
 *
 * Three things this handles that a bare setInterval does not:
 *   - aborts the in-flight request on unmount, so a slow response cannot set
 *     state on a dead component
 *   - pauses while the tab is hidden, so a backgrounded desk stops calling the
 *     API every few seconds all night
 *   - refetches immediately on becoming visible again, so the first thing an
 *     agent sees on returning is current rather than minutes stale
 */
export function useAdminPoll(fetcher, intervalMs = 4000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const abortRef = useRef(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const refresh = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await fetcherRef.current()
      if (controller.signal.aborted) return
      setData(result)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(err)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let timer
    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      if (!document.hidden) await refresh()
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    void tick()

    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearTimeout(timer)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])

  return { data, error, loading, refresh }
}

import { useEffect, useRef, useState } from 'react'
import { Modal } from '../app/Primitives.jsx'
import { cn } from '../../lib/utils.js'

let openDialog = null

/**
 * In-app replacement for window.prompt. Resolves to the entered text, '' for
 * an empty optional field, or null when cancelled — so callers can tell
 * "no note" apart from "changed my mind", which window.prompt's `?? undefined`
 * pattern could not.
 */
export function ask({ title, label, placeholder, required = true, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    if (!openDialog) return resolve(null)
    openDialog({ title, label, placeholder, required, confirmLabel, danger, resolve })
  })
}

/** Mounted once in AdminLayout. */
export function PromptHost() {
  const [request, setRequest] = useState(null)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    openDialog = (req) => {
      setValue('')
      setRequest(req)
    }
    return () => {
      openDialog = null
    }
  }, [])

  useEffect(() => {
    if (request) setTimeout(() => inputRef.current?.focus(), 0)
  }, [request])

  const close = (result) => {
    request?.resolve(result)
    setRequest(null)
  }

  const trimmed = value.trim()
  const canSubmit = !request?.required || trimmed.length > 0

  return (
    <Modal open={Boolean(request)} onClose={() => close(null)} title={request?.title ?? ''}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) close(trimmed)
        }}
      >
        <label className="block text-sm font-semibold text-slate-700">
          {request?.label ?? (request?.required ? 'Reason' : 'Note (optional)')}
          <textarea
            ref={inputRef}
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) close(trimmed)
            }}
            placeholder={request?.placeholder}
            className="mt-2 block w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(null)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              'rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-40',
              request?.danger ? 'bg-brand-500 hover:bg-brand-600' : 'bg-slate-900 hover:bg-slate-800',
            )}
          >
            {request?.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

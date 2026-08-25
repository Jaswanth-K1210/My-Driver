const counters = new Map<string, number>()
const gauges = new Map<string, () => number>()

export const counter = (name: string, value = 1): void => {
  counters.set(name, (counters.get(name) ?? 0) + value)
}

/** Registers a live reader; evaluated at scrape time, never cached. */
export const gauge = (name: string, read: () => number): void => {
  gauges.set(name, read)
}

export function renderMetrics(): string {
  const lines: string[] = []
  for (const [name, value] of counters) lines.push(`# TYPE ${name} counter`, `${name} ${value}`)
  for (const [name, read] of gauges) {
    let value = 0
    try { value = read() } catch { value = -1 }
    lines.push(`# TYPE ${name} gauge`, `${name} ${value}`)
  }
  return lines.join('\n') + '\n'
}

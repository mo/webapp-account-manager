/* oxlint-disable no-console */
// Reads "wam list" output on stdin and prints the box drawn table as one
// line per logical row, with cells separated by " | ".
//
// Run wam with a wide COLUMNS (see wamlist in helpers.sh) so that tty-table
// doesn't wrap cell values. Cells that still span several physical lines
// (explicit newlines, e.g. several JWT audiences, or the fixed width date
// columns) are joined with a single space.
//
// Timestamps (YYYY-MM-DD HH:mm) become <date> (unless KEEP_DATES is set), random parts of shortened
// values become <rnd> and full JWTs are decoded like tokens-summary.js does.
import process from 'node:process'
import { describeValue, readStdin } from './lib/normalize.js'

// oxlint-disable-next-line no-control-regex
const input = (await readStdin()).replace(/\x1b\[[0-9;]*m/g, '')

const rows = []
let current = null
const flush = () => {
  if (current) rows.push(current)
  current = null
}

for (const line of input.split('\n')) {
  const trimmed = line.trim()
  if (/^[┌├└]/.test(trimmed)) {
    flush()
    continue
  }
  if (!trimmed.startsWith('│')) {
    flush()
    if (trimmed !== '') console.log(`(non-table output) ${trimmed}`)
    continue
  }
  const cells = trimmed.split('│').slice(1, -1)
  if (!current) current = cells.map(() => '')
  cells.forEach((cell, i) => {
    const content = cell.trim()
    if (content !== '') {
      current[i] = current[i] ? `${current[i]} ${content}` : content
    }
  })
}
flush()

const normalizeCell = (text) => {
  let t = process.env.KEEP_DATES ? text : text.replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, '<date>')
  if (/^ey[\w-]+\.[\w-]+\.[\w-]+$/.test(t) || /^\w+=ey[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) {
    const [prefix, jwt] = t.includes('=')
      ? [t.split('=')[0] + '=', t.slice(t.indexOf('=') + 1)]
      : ['', t]
    return prefix + describeValue(jwt)
  }
  t = t.replace(/\.\.\.\S+$/, '...<rnd>')
  return t.replace(/[0-9a-f]{8,}/g, '<hex>')
}

for (const row of rows) {
  console.log(row.map(normalizeCell).join(' | ').trimEnd())
}

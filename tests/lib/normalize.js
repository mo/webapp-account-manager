import { Buffer } from 'node:buffer'
import process from 'node:process'

// Helpers that turn random/time dependent wam output into stable text.

// Describe a credential value: JWTs become jwt{claim=value ...} (without
// iat, and exp shown relative to now), random hex runs become <hex>.
export const describeValue = (value) => {
  if (value === undefined) return '<undefined>'
  const parts = String(value).split('.')
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      const shown = Object.entries(claims)
        .filter(([k]) => k !== 'iat' && k !== 'exp')
        .map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.join(',')}]` : v}`)
      if (claims.exp) {
        shown.push(`exp=+${Math.round((claims.exp - Date.now() / 1000) / 60)}min`)
      }
      return `jwt{${shown.join(' ')}}`
    } catch {
      // not a JWT
    }
  }
  return String(value).replace(/[0-9a-f]{8,}/g, '<hex>')
}

// "+60min" style description of an ISO timestamp relative to now
export const describeExpires = (expiresUTC) => {
  if (!expiresUTC) return '<none>'
  const ms = Date.parse(expiresUTC)
  if (Number.isNaN(ms)) return `<invalid:${expiresUTC}>`
  const min = Math.round((ms - Date.now()) / 60000)
  return min >= 0 ? `+${min}min` : `${min}min`
}

// Read all of stdin as a string
export const readStdin = () =>
  new Promise((resolve) => {
    let s = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (d) => (s += d))
    process.stdin.on('end', () => resolve(s))
  })

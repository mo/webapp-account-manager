/* oxlint-disable no-console */
// Prints a *.tokens.json file in a stable, human readable form so cram tests
// can assert on it even though tokens/cookies are random and expiry times are
// relative to "now".
//
// Usage: node tokens-summary.js FILE.tokens.json
//
// Each credential is printed as one line:
//
//   appid userid type[:name|subtype] expires=<+N min> value=<shape>
//
// "expires" is rounded to the nearest minute relative to now. "value" masks
// random hex runs as <hex> and JWTs as jwt{claim=...} (iat/exp omitted).
import fs from 'node:fs'
import process from 'node:process'
import { describeExpires, describeValue } from './lib/normalize.js'

const file = process.argv[2]
if (!file || !fs.existsSync(file)) {
  console.log(`(no such file: ${file})`)
  process.exit(0)
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

for (const app of data) {
  for (const account of app.accounts || []) {
    const creds = account.cookiesAndTokens
    if (!creds || creds.length === 0) {
      console.log(`${app.appid} ${account.userid} (no credentials)`)
      continue
    }
    for (const c of creds) {
      const kind =
        c.type === 'cookie'
          ? `cookie:${c.name}`
          : c.type === 'authorization'
            ? `authorization:${c.subtype}`
            : c.type
      console.log(
        `${app.appid} ${account.userid} ${kind} expires=${describeExpires(
          c.expiresUTC,
        )} value=${describeValue(c.value)}`,
      )
    }
  }
}

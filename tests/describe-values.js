// deno-lint-ignore-file no-console
// Reads credential values (one per line, e.g. "wam get" output) on stdin and
// prints a stable description of each one (see lib/normalize.js).
import { describeValue, readStdin } from './lib/normalize.js'

for (const line of (await readStdin()).split('\n')) {
  if (line !== '') console.log(describeValue(line))
}

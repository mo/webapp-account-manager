# Sourced at the top of every cram test file:
#
#   $ . "$TESTDIR/helpers.sh"
#
# Starts a private fakeserver instance (killed when the test file finishes),
# exports FAKESERVER_URL and defines helper functions.
#
# The wam binary under test defaults to ../wam but can be overridden with
# WAM_BIN=/path/to/wam (cram passes that variable through).

# Make "wam ... | mask" etc. fail when wam fails, not only when the
# normalizer does (run-tests runs cram with bash).
set -o pipefail

WAM_BIN=${WAM_BIN:-"$TESTDIR/../wam"}
FIXTURES="$TESTDIR/fixtures"

# Each wam invocation is killed after WAM_TIMEOUT seconds so that a login
# waiting forever fails the test instead of hanging it. wam runs in its own
# process group and the whole group is killed (./wam is a wrapper script and
# its child would otherwise keep running and keep cram's output pipe open).
WAM_TIMEOUT=${WAM_TIMEOUT:-120}

wam() {
  perl -e '
    my $timeout = shift;
    my $pid = fork() // die "fork: $!";
    if ($pid == 0) { setpgrp(0, 0); exec(@ARGV) or die "exec: $!"; }
    $SIG{ALRM} = sub {
      print STDERR "wam: killed after ${timeout}s timeout\n";
      kill("KILL", -$pid);
      waitpid($pid, 0);
      exit 124;
    };
    alarm $timeout;
    waitpid($pid, 0);
    exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
  ' "$WAM_TIMEOUT" "$WAM_BIN" "$@"
}

_fakeserver_dir=$(mktemp -d "${TMPDIR:-/tmp}/fakeserver.XXXXXX")
node "$TESTDIR/fakeserver/server.js" >"$_fakeserver_dir/log" 2>&1 &
_fakeserver_pid=$!
trap 'kill $_fakeserver_pid 2>/dev/null; rm -rf "$_fakeserver_dir"' EXIT

_i=0
while ! grep -q '^LISTENING ' "$_fakeserver_dir/log" 2>/dev/null; do
  _i=$((_i + 1))
  if [ $_i -gt 100 ]; then
    echo "fakeserver did not start:" >&2
    cat "$_fakeserver_dir/log" >&2
    exit 1
  fi
  sleep 0.1
done
FAKESERVER_URL=$(sed -n 's/^LISTENING //p' "$_fakeserver_dir/log")
export FAKESERVER_URL

# Copy one or more fixture configs into the current (temporary) directory.
use_fixture() {
  for f in "$@"; do
    cp "$FIXTURES/$f" .
  done
}

# Print tokens.json in a deterministic form (see tokens-summary.js).
tokens() {
  node "$TESTDIR/tokens-summary.js" "$@"
}

# Print fakeserver request counters, one "key: count" per line, sorted.
fakestats() {
  curl -fsS "$FAKESERVER_URL/__stats" | node -e '
    let s = ""
    process.stdin.on("data", (d) => (s += d))
    process.stdin.on("end", () => {
      const stats = JSON.parse(s)
      for (const k of Object.keys(stats).sort()) console.log(`${k}: ${stats[k]}`)
    })'
}

fakereset() {
  curl -fsS -X POST "$FAKESERVER_URL/__reset" >/dev/null
}

fakeserver_log() {
  cat "$_fakeserver_dir/log"
}

# Run wam (normally "wam -c x.webapps.js list ...") and print the table
# normalized (see table-summary.js). A wide COLUMNS keeps tty-table from
# wrapping cell values (cram itself sets COLUMNS=80).
wamlist() {
  COLUMNS=1000 wam "$@" | node "$TESTDIR/table-summary.js"
}

# Mask the random tail of shortened tokens in "wam refresh" output
mask() {
  sed -E 's/\.\.\.[A-Za-z0-9_-]{7}$/...<rnd>/'
}

# Describe credential values read from stdin, e.g. "wam get ... | describe"
describe() {
  node "$TESTDIR/describe-values.js"
}

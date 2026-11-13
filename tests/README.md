# wam test suite

End-to-end [cram](https://bitheap.org/cram/) tests that run the real `wam`
executable against a local fake webapp / identity provider.

    pnpm test                      # same as ./run-tests
    ./run-tests                    # all tests, files in parallel (~25s)
    ./run-tests tests/list.t       # a single file
    ./run-tests -i tests/list.t    # interactively accept changed output
    WAM_BIN=/path/to/wam ./run-tests   # test another wam implementation
    JOBS=1 ./run-tests             # run the test files one at a time

Requirements: `node` and `pnpm` (wam, fakeserver + helper scripts), `uvx` (runs cram) and a
playwright chromium for the browser based logins
(`./install-playwright-browser`).

## Layout

- `*.t` cram test files, one per feature area. Each file starts its own
  fakeserver on a random port (see `helpers.sh`), so files are independent.
- `fakeserver/server.js` zero dependency node server with hardcoded accounts
  (alice@example.com/alice-pw, bob@example.com/bob-pw,
  carol@example.com/carol-pw):
  - `/cookie/*` HTML login form that sets a `SessionId` cookie (plus non-session
    `Tracking`/`Theme` cookies), and a registration form
  - `/spa/*` single page app sending `Authorization: Bearer <jwt>` (and a legacy
    `Authorization: Token ...`)
  - `/oauth/*` device flow, password grant and refresh_token grant
  - `/__stats`, `/__reset`, `/__revoke-refresh-tokens` for the tests to inspect
    how many logins / token requests wam made

  Cookie/JWT lifetime, audience etc. are controlled with query params on the
  login URL, see the comment at the top of the file.

- `fixtures/*.webapps.js` wam configs pointing at the fakeserver
  (`FAKESERVER_URL`).
- `tokens-summary.js`, `table-summary.js`, `describe-values.js` turn random
  tokens and "now" relative timestamps into stable text for assertions (shell
  helpers `tokens`, `wamlist`, `describe`, `mask`).

Not covered: `--debug` for browser logins (it opens a headed browser) and
browser logins that never produce the session credentials (wam waits forever).

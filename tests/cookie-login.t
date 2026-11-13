Browser (playwright) login to a webapp that keeps the session in a cookie.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture cookie.webapps.js

Nothing has been saved yet:

  $ wamlist -c cookie.webapps.js list cookie
  expiresUTC | expiresRel | appid | userid | type | value | note
   |  | cookie | alice@example.com |  |  |
   |  | cookie | bob@example.com |  |  |

Log in all enabled accounts of one app. carol@example.com has
"enabled: false" and is skipped:

  $ wam -c cookie.webapps.js refresh cookie 2>&1 | mask
  cookie alice@example.com: saving cookie: SessionId
  cookie bob@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:alice@example.com: 1
  cookie-login:bob@example.com: 1

Only the session cookie (SessionId) is saved, the Tracking and Theme cookies
are not listed in sessionCredentials. Expiry comes from Max-Age (3600s):

  $ tokens cookie.tokens.json
  cookie alice@example.com cookie:SessionId expires=+60min value=<hex>
  cookie bob@example.com cookie:SessionId expires=+60min value=<hex>
  $ wamlist -c cookie.webapps.js list cookie
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | cookie | alice@example.com | cookie | Session...<rnd> |
  <date> | in an hour | cookie | bob@example.com | cookie | Session...<rnd> |

The raw Set-Cookie header is kept too:

  $ node -e 'const t = require("./cookie.tokens.json"); console.log(t[0].accounts[0].cookiesAndTokens[0].raw.replace(/=[0-9a-f]+;/, "=<hex>;"))'
  SessionId=<hex>; Path=/; HttpOnly; Max-Age=3600

Credentials that are still fresh are not refreshed again...

  $ fakereset
  $ wam -c cookie.webapps.js refresh cookie 2>&1 | mask
  $ fakestats

...unless --force is used (here for a single account only):

  $ wam -c cookie.webapps.js refresh --force cookie bob@example.com 2>&1 | mask
  cookie bob@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:bob@example.com: 1

A plain "refresh" goes through all apps. The first one logs in every account
that has no saved credentials yet (alice and bob of "cookie" are still
fresh):

  $ fakereset
  $ wam -c cookie.webapps.js refresh 2>&1 | mask
  cookie-short alice@example.com: saving cookie: SessionId
  cookie-21min alice@example.com: saving cookie: SessionId
  cookie-18min alice@example.com: saving cookie: SessionId
  cookie-expires alice@example.com: saving cookie: SessionId
  cookie-session-maxage alice@example.com: saving cookie: SessionId
  cookie-session-default alice@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:alice@example.com: 6

The next one only logs in the stale ones (cookie-18min and cookie-short are
always stale):

  $ fakereset
  $ wam -c cookie.webapps.js refresh 2>&1 | mask
  cookie-short alice@example.com: saving cookie: SessionId
  cookie-18min alice@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:alice@example.com: 2

The tokens file follows the order of the apps in the config file:

  $ node -e 'console.log(require("./cookie.tokens.json").map((a) => a.appid).join("\n"))'
  cookie
  cookie-short
  cookie-21min
  cookie-18min
  cookie-expires
  cookie-session-maxage
  cookie-session-default

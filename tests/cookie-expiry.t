Expiry of saved session cookies, and when a cookie counts as fresh.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture cookie.webapps.js

"Fresh" means at least 20 minutes left. A cookie that is valid for 21 minutes
is fresh, one that is valid for 18 (or 10) minutes is refreshed every time:

  $ wam -c cookie.webapps.js refresh cookie-21min 2>&1 | mask
  cookie-21min alice@example.com: saving cookie: SessionId
  $ wam -c cookie.webapps.js refresh cookie-18min 2>&1 | mask
  cookie-18min alice@example.com: saving cookie: SessionId
  $ wam -c cookie.webapps.js refresh cookie-short 2>&1 | mask
  cookie-short alice@example.com: saving cookie: SessionId
  $ tokens cookie.tokens.json | grep -v '^cookie '
  cookie-short alice@example.com cookie:SessionId expires=+10min value=<hex>
  cookie-21min alice@example.com cookie:SessionId expires=+21min value=<hex>
  cookie-18min alice@example.com cookie:SessionId expires=+18min value=<hex>
  $ fakereset
  $ wam -c cookie.webapps.js refresh cookie-21min 2>&1 | mask
  $ wam -c cookie.webapps.js refresh cookie-18min 2>&1 | mask
  cookie-18min alice@example.com: saving cookie: SessionId
  $ wam -c cookie.webapps.js refresh cookie-short 2>&1 | mask
  cookie-short alice@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:alice@example.com: 2

Cookie expiry from an Expires= attribute (7200s):

  $ wam -c cookie.webapps.js refresh cookie-expires 2>&1 | mask
  cookie-expires alice@example.com: saving cookie: SessionId
  $ tokens cookie.tokens.json | grep cookie-expires
  cookie-expires alice@example.com cookie:SessionId expires=+120min value=<hex>

Browser session cookies (no expiry) use maxAge from the sessionCredentials
entry (5400s), or 24h if no maxAge is given:

  $ wam -c cookie.webapps.js refresh cookie-session-maxage 2>&1 | mask
  cookie-session-maxage alice@example.com: saving cookie: SessionId
  $ wam -c cookie.webapps.js refresh cookie-session-default 2>&1 | mask
  cookie-session-default alice@example.com: saving cookie: SessionId
  $ tokens cookie.tokens.json | grep cookie-session
  cookie-session-maxage alice@example.com cookie:SessionId expires=+90min value=<hex>
  cookie-session-default alice@example.com cookie:SessionId expires=+1440min value=<hex>

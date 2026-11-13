Cookies that are deleted, replaced or exist in several scopes during a
browser login. wam saves what the browser's cookie store ends up with.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture cookie-replace.webapps.js

Many webapps delete the session cookie (Max-Age=0) before setting a new one.
Only the new cookie is kept, so the account is fresh afterwards:

  $ wam -c cookie-replace.webapps.js refresh cookie-clearfirst 2>&1 | mask
  cookie-clearfirst alice@example.com: saving cookie: SessionId
  $ tokens cookie-replace.tokens.json | grep cookie-clearfirst
  cookie-clearfirst alice@example.com cookie:SessionId expires=+60min value=<hex>
  $ fakereset
  $ wam -c cookie-replace.webapps.js refresh cookie-clearfirst 2>&1 | mask
  $ fakestats

Cookies are identified by name, domain and path. Deleting a SessionId cookie
at another path doesn't affect the saved Path=/ one:

  $ wam -c cookie-replace.webapps.js refresh cookie-otherpath 2>&1 | mask
  cookie-otherpath alice@example.com: saving cookie: SessionId
  $ tokens cookie-replace.tokens.json | grep cookie-otherpath
  cookie-otherpath alice@example.com cookie:SessionId expires=+60min value=<hex>

A host-only cookie and a cookie with a Domain attribute are different cookies
too (deleting the latter keeps the former):

  $ wam -c cookie-replace.webapps.js refresh cookie-otherdomain 2>&1 | mask
  cookie-otherdomain alice@example.com: saving cookie: SessionId
  $ tokens cookie-replace.tokens.json | grep cookie-otherdomain
  cookie-otherdomain alice@example.com cookie:SessionId expires=+60min value=<hex>

Two live cookies with the same name and value but different paths are both
saved, and each keeps the Set-Cookie header that set it as "raw":

  $ wam -c cookie-replace.webapps.js refresh cookie-twopaths 2>&1 | mask
  cookie-twopaths alice@example.com: saving cookie: SessionId
  cookie-twopaths alice@example.com: saving cookie: SessionId
  $ tokens cookie-replace.tokens.json | grep cookie-twopaths
  cookie-twopaths alice@example.com cookie:SessionId expires=+120min value=<hex>
  cookie-twopaths alice@example.com cookie:SessionId expires=+60min value=<hex>
  $ node -e '
  >   const t = require("./cookie-replace.tokens.json").find((a) => a.appid === "cookie-twopaths")
  >   for (const c of t.accounts[0].cookiesAndTokens) console.log(c.raw.replace(/=[0-9a-f]+;/, "=<hex>;"))
  > '
  SessionId=<hex>; Path=/legacy; HttpOnly; Max-Age=7200
  SessionId=<hex>; Path=/; HttpOnly; Max-Age=3600

Every Set-Cookie header counts, even one identical to an earlier header: the
server sets a-..., then b-..., then the a-... header again, so a-... is saved:

  $ wam -c cookie-replace.webapps.js refresh cookie-aba 2>&1 | mask
  cookie-aba alice@example.com: saving cookie: SessionId
  $ tokens cookie-replace.tokens.json | grep cookie-aba
  cookie-aba alice@example.com cookie:SessionId expires=+60min value=a-<hex>

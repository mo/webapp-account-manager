Where and how the tokens file is stored.

  $ . "$TESTDIR/helpers.sh"
  $ mkdir conf
  $ cp "$FIXTURES/oauth.webapps.js" conf/my.webapps.js

The tokens file lives next to the config file, named *.tokens.json:

  $ wam -c conf/my.webapps.js refresh password-norefresh 2>&1 | mask
  password-norefresh alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ ls conf
  my.tokens.json
  my.webapps.js
  $ tokens conf/my.tokens.json
  password-norefresh alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-norefresh-client azp=wam-norefresh-client exp=+60min}

The file is pretty printed JSON:

  $ sed 's/"ey[^"]*"/"<jwt>"/; s/"20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z"/"<date>"/' conf/my.tokens.json
  [
      {
          "appid": "password-norefresh",
          "accounts": [
              {
                  "userid": "alice@example.com",
                  "cookiesAndTokens": [
                      {
                          "type": "authorization",
                          "subtype": "Bearer",
                          "value": "<jwt>",
                          "expiresUTC": "<date>"
                      }
                  ]
              }
          ]
      }
  ] (no-eol)

All expiry times (JWT, cookie, refresh token) use the same format, in UTC
without milliseconds:

  $ grep -ho '"expiresUTC": "[^"]*"' conf/my.tokens.json | sed 's/[0-9]/N/g'
  "expiresUTC": "NNNN-NN-NNTNN:NN:NNZ"

Apps are stored in config file order regardless of refresh order, and apps
that are no longer in the config file are dropped on the next save:

  $ wam -c conf/my.webapps.js refresh password alice@example.com 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ node -e 'console.log(require("./conf/my.tokens.json").map((a) => a.appid).join(" "))'
  password password-norefresh
  $ node -e '
  >   const fs = require("fs")
  >   const t = JSON.parse(fs.readFileSync("conf/my.tokens.json"))
  >   t.push({ appid: "removed-app", accounts: [] })
  >   fs.writeFileSync("conf/my.tokens.json", JSON.stringify(t))
  > '
  $ wam -c conf/my.webapps.js refresh password bob@example.com 2>&1 | mask
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ node -e 'console.log(require("./conf/my.tokens.json").map((a) => a.appid).join(" "))'
  password password-norefresh

Accounts that are disabled in the config keep their saved credentials:

  $ sed "s/{ userid: 'bob@example.com', passwd: 'bob-pw' }/{ userid: 'bob@example.com', passwd: 'bob-pw', enabled: false }/" conf/my.webapps.js > conf/my2.webapps.js
  $ cp conf/my.tokens.json conf/my2.tokens.json
  $ wam -c conf/my2.webapps.js refresh --force password 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens conf/my2.tokens.json | grep '^password '
  password alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  password bob@example.com authorization:Bearer expires=+60min value=jwt{sub=bob@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password bob@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  $ wamlist -c conf/my2.webapps.js list password
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | password | alice@example.com | authorization | eyJhbGc...<rnd> | audience:wam-password-client
  <date> | in 2 hours | password | alice@example.com | oauth2-refresh | refresh...<rnd> |

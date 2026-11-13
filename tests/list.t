"wam list" shows a table of all accounts and their saved credentials.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture oauth.webapps.js

Before any login every enabled account is listed with empty columns:

  $ wamlist -c oauth.webapps.js list
  expiresUTC | expiresRel | appid | userid | type | value | note
   |  | device | alice@example.com |  |  |
   |  | device | bob@example.com |  |  |
   |  | password | alice@example.com |  |  |
   |  | password | bob@example.com |  |  |
   |  | password-short | alice@example.com |  |  |
   |  | password-norefresh | alice@example.com |  |  |
   |  | password-sessioncreds | alice@example.com |  |  |
   |  | password-badpw | alice@example.com |  |  |

  $ wam -c oauth.webapps.js refresh password 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wam -c oauth.webapps.js refresh password-short 2>&1 | mask
  password-short alice@example.com: saving authorization Bearer eyJhbGc...<rnd>

Values are shortened unless --full is given:

  $ wamlist -c oauth.webapps.js list password
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | password | alice@example.com | authorization | eyJhbGc...<rnd> | audience:wam-password-client
  <date> | in 2 hours | password | alice@example.com | oauth2-refresh | refresh...<rnd> |
  <date> | in an hour | password | bob@example.com | authorization | eyJhbGc...<rnd> | audience:wam-password-client
  <date> | in 2 hours | password | bob@example.com | oauth2-refresh | refresh...<rnd> |
  $ wamlist -c oauth.webapps.js list password bob@example.com --full
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | password | bob@example.com | authorization | jwt{sub=bob@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min} | audience:wam-password-client
  <date> | in 2 hours | password | bob@example.com | oauth2-refresh | refresh-<hex> |

Filter by appid / userid:

  $ wamlist -c oauth.webapps.js list password-short alice@example.com
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in 10 minutes | password-short | alice@example.com | authorization | eyJhbGc...<rnd> | audience:wam-short-client
  <date> | in 2 hours | password-short | alice@example.com | oauth2-refresh | refresh...<rnd> |

Credentials that have expired are still listed (written by hand here):

  $ node -e '
  >   const ago = (s) => new Date(Date.now() - s * 1000).toISOString()
  >   require("fs").writeFileSync("oauth.tokens.json", JSON.stringify([{
  >     appid: "password",
  >     accounts: [{
  >       userid: "alice@example.com",
  >       cookiesAndTokens: [
  >         { type: "authorization", subtype: "Bearer", value: "old-token", expiresUTC: ago(7200) },
  >         { type: "cookie", name: "Session", value: "abc", expiresUTC: ago(3 * 86400) },
  >       ],
  >     }],
  >   }]))
  > '
  $ wamlist -c oauth.webapps.js list password alice@example.com
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | 2 hours ago | password | alice@example.com | authorization | old-token |
  <date> | 3 days ago | password | alice@example.com | cookie | Session=abc |

expiresUTC is shown in the local timezone:

  $ node -e '
  >   require("fs").writeFileSync("oauth.tokens.json", JSON.stringify([{
  >     appid: "password",
  >     accounts: [{
  >       userid: "alice@example.com",
  >       cookiesAndTokens: [
  >         { type: "cookie", name: "Session", value: "abc", expiresUTC: "2020-01-01T12:34:00Z" },
  >       ],
  >     }],
  >   }]))
  > '
  $ KEEP_DATES=1 wamlist -c oauth.webapps.js list password alice@example.com | sed 's/ |.*//'
  expiresUTC
  2020-01-01 12:34
  $ TZ=Asia/Tokyo KEEP_DATES=1 wamlist -c oauth.webapps.js list password alice@example.com | sed 's/ |.*//'
  expiresUTC
  2020-01-01 21:34

Expired credentials are refreshed by the next "refresh":

  $ wam -c oauth.webapps.js refresh password alice@example.com 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens oauth.tokens.json
  password alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>

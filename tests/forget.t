"wam forget" drops saved credentials.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture oauth.webapps.js

  $ wam -c oauth.webapps.js refresh password 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wam -c oauth.webapps.js refresh password-norefresh 2>&1 | mask
  password-norefresh alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens oauth.tokens.json
  password alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  password bob@example.com authorization:Bearer expires=+60min value=jwt{sub=bob@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password bob@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  password-norefresh alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-norefresh-client azp=wam-norefresh-client exp=+60min}

Forget a single account:

  $ wam -c oauth.webapps.js forget password bob@example.com
  $ tokens oauth.tokens.json
  password alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  password bob@example.com (no credentials)
  password-norefresh alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-norefresh-client azp=wam-norefresh-client exp=+60min}
  $ wam -c oauth.webapps.js get password bob@example.com
  $ wamlist -c oauth.webapps.js list password
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | password | alice@example.com | authorization | eyJhbGc...<rnd> | audience:wam-password-client
  <date> | in 2 hours | password | alice@example.com | oauth2-refresh | refresh...<rnd> |
   |  | password | bob@example.com |  |  |

Forget all accounts of an app:

  $ wam -c oauth.webapps.js refresh password 2>&1 | mask
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wam -c oauth.webapps.js forget password
  $ tokens oauth.tokens.json
  password alice@example.com (no credentials)
  password bob@example.com (no credentials)
  password-norefresh alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-norefresh-client azp=wam-norefresh-client exp=+60min}

Forget everything:

  $ wam -c oauth.webapps.js refresh password 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wam -c oauth.webapps.js forget
  $ tokens oauth.tokens.json
  password alice@example.com (no credentials)
  password bob@example.com (no credentials)
  password-norefresh alice@example.com (no credentials)

Forgetting accounts that were never logged in is a no-op:

  $ wam -c oauth.webapps.js forget device
  $ tokens oauth.tokens.json
  password alice@example.com (no credentials)
  password bob@example.com (no credentials)
  password-norefresh alice@example.com (no credentials)

After forget, refresh logs in again:

  $ fakereset
  $ wam -c oauth.webapps.js refresh password alice@example.com 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ fakestats
  token:password: 1
  token:password:alice@example.com: 1

OAuth2 resource owner password grant (no browser involved).

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture oauth.webapps.js

Without sessionCredentials both the access token and the refresh token are
saved. The configured scope is sent along:

  $ wam -c oauth.webapps.js refresh password 2>&1 | mask
  password alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  password bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ fakestats
  token:password: 2
  token:password:alice@example.com: 1
  token:password:bob@example.com: 1
  $ tokens oauth.tokens.json
  password alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  password bob@example.com authorization:Bearer expires=+60min value=jwt{sub=bob@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  password bob@example.com oauth2-refresh expires=+120min value=refresh-<hex>
  $ wam -c oauth.webapps.js get password alice@example.com --type authorization | describe
  jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  $ wam -c oauth.webapps.js get password alice@example.com --type oauth2-refresh | describe
  refresh-<hex>
  $ wam -c oauth.webapps.js get password alice@example.com | describe
  jwt{sub=alice@example.com aud=wam-password-client azp=wam-password-client scope=openid profile exp=+60min}
  refresh-<hex>

--debug prints which accounts are checked:

  $ wam -c oauth.webapps.js refresh password --debug 2>&1 | mask
  checking password alice@example.com
  checking password bob@example.com

When the access token is stale (password-short tokens live 10 minutes) the
saved refresh token is used instead of the password:

  $ fakereset
  $ wam -c oauth.webapps.js refresh password-short 2>&1 | mask
  password-short alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wam -c oauth.webapps.js refresh password-short 2>&1 | mask
  password-short alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ fakestats
  token:password: 1
  token:password:alice@example.com: 1
  token:refresh_token: 1
  token:refresh_token:alice@example.com: 1
  $ tokens oauth.tokens.json | grep password-short
  password-short alice@example.com authorization:Bearer expires=+10min value=jwt{sub=alice@example.com aud=wam-short-client azp=wam-short-client exp=+10min}
  password-short alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>

If the refresh token is rejected wam falls back to the password grant:

  $ fakereset
  $ curl -fsS -X POST "$FAKESERVER_URL/__revoke-refresh-tokens"
  {"ok":true} (no-eol)
  $ wam -c oauth.webapps.js refresh password-short 2>&1 | mask
  password-short alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ fakestats
  token:password: 1
  token:password:alice@example.com: 1
  token:refresh_token: 1

No refresh token in the token response:

  $ wam -c oauth.webapps.js refresh password-norefresh 2>&1 | mask
  password-norefresh alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens oauth.tokens.json | grep password-norefresh
  password-norefresh alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-norefresh-client azp=wam-norefresh-client exp=+60min}

With sessionCredentials listing both kinds, both are saved:

  $ wam -c oauth.webapps.js refresh password-sessioncreds 2>&1 | mask
  password-sessioncreds alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens oauth.tokens.json | grep password-sessioncreds
  password-sessioncreds alice@example.com authorization:Bearer expires=+10min value=jwt{sub=alice@example.com aud=wam-short-client azp=wam-short-client exp=+10min}
  password-sessioncreds alice@example.com oauth2-refresh expires=+120min value=refresh-<hex>

Wrong password: an error is printed, nothing is saved, exit code is still 0:

  $ wam -c oauth.webapps.js refresh password-badpw 2>&1 | mask
  failed to refresh credentials for password-badpw alice@example.com (error: Error: failed to refresh credentials for password-badpw alice@example.com ... tokenResponse={
      "error": "invalid_grant",
      "error_description": "Invalid user credentials"
  })
  $ tokens oauth.tokens.json | grep password-badpw
  [1]

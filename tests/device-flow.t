OAuth2 device authorization flow: wam requests a device code, approves it by
logging in on the activation page with playwright and then fetches the token.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture oauth.webapps.js

  $ wam -c oauth.webapps.js refresh device alice@example.com 2>&1 | mask
  device alice@example.com: executing interactive login steps for device flow
  $ fakestats
  device-activate:alice@example.com: 1
  device-code:wam-device-client: 1
  token:device_code:alice@example.com: 1
  token:urn:ietf:params:oauth:grant-type:device_code: 1
  $ tokens oauth.tokens.json
  device alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-device-client azp=wam-device-client exp=+60min}
  $ wam -c oauth.webapps.js get device alice@example.com | describe
  jwt{sub=alice@example.com aud=wam-device-client azp=wam-device-client exp=+60min}
  $ wamlist -c oauth.webapps.js list device alice@example.com
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | device | alice@example.com | authorization | eyJhbGc...<rnd> | audience:wam-device-client

Fresh tokens are reused:

  $ fakereset
  $ wam -c oauth.webapps.js refresh device alice@example.com 2>&1 | mask
  $ fakestats

--force runs the whole flow again:

  $ wam -c oauth.webapps.js refresh device alice@example.com --force 2>&1 | mask
  device alice@example.com: executing interactive login steps for device flow
  $ fakestats
  device-activate:alice@example.com: 1
  device-code:wam-device-client: 1
  token:device_code:alice@example.com: 1
  token:urn:ietf:params:oauth:grant-type:device_code: 1

If the approval fails (bob's passwd in the config is wrong) the token request
fails, an error is printed, and the remaining accounts are still processed.
The exit code is still 0:

  $ fakereset
  $ wam -c oauth.webapps.js refresh device 2>&1 | mask
  device bob@example.com: executing interactive login steps for device flow
  failed to refresh credentials for device bob@example.com (error: Error: failed to refresh credentials for device bob@example.com ... tokenResponseHttpStatus=400 tokenResponse={
      "error": "authorization_pending",
      "error_description": "not approved yet"
  })
  $ fakestats
  device-activate:bob@example.com: 1
  device-code:wam-device-client: 1
  token:urn:ietf:params:oauth:grant-type:device_code: 1
  $ tokens oauth.tokens.json
  device alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=wam-device-client azp=wam-device-client exp=+60min}

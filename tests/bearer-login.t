Browser (playwright) login to a single page app that sends its JWT in an
"Authorization: Bearer ..." header. wam intercepts the outgoing requests.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture spa.webapps.js

  $ wam -c spa.webapps.js refresh spa 2>&1 | mask
  spa alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  spa bob@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ fakestats
  spa-login:alice@example.com: 1
  spa-login:bob@example.com: 1

The expiry comes from the JWT "exp" claim:

  $ tokens spa.tokens.json
  spa alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com aud=spa-api exp=+60min}
  spa bob@example.com authorization:Bearer expires=+60min value=jwt{sub=bob@example.com aud=spa-api exp=+60min}
  $ wam -c spa.webapps.js get spa alice@example.com | describe
  jwt{sub=alice@example.com aud=spa-api exp=+60min}
  $ wam -c spa.webapps.js get spa alice@example.com --type authorization | describe
  jwt{sub=alice@example.com aud=spa-api exp=+60min}
  $ wam -c spa.webapps.js get spa alice@example.com --type cookie

The "note" column in "wam list" shows the JWT audience (string or array):

  $ wam -c spa.webapps.js refresh spa-multiaud 2>&1 | mask
  spa-multiaud alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ wamlist -c spa.webapps.js list spa
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | spa | alice@example.com | authorization | eyJhbGc...<rnd> | audience:spa-api
  <date> | in an hour | spa | bob@example.com | authorization | eyJhbGc...<rnd> | audience:spa-api
  $ wamlist -c spa.webapps.js list spa-multiaud
  expiresUTC | expiresRel | appid | userid | type | value | note
  <date> | in an hour | spa-multiaud | alice@example.com | authorization | eyJhbGc...<rnd> | audience:api-one api-two

JWT without an exp claim uses maxAge from sessionCredentials (2700s):

  $ wam -c spa.webapps.js refresh spa-noexp 2>&1 | mask
  spa-noexp alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens spa.tokens.json | grep spa-noexp
  spa-noexp alice@example.com authorization:Bearer expires=+45min value=jwt{sub=alice@example.com}

sessionCredentials select the authorization scheme ("subtype"). The SPA
also sends "Authorization: Token ..." to a legacy API:

  $ wam -c spa.webapps.js refresh spa-legacy 2>&1 | mask
  spa-legacy alice@example.com: saving authorization Token legacy-...ple.com
  $ tokens spa.tokens.json | grep spa-legacy
  spa-legacy alice@example.com authorization:Token expires=+1440min value=legacy-alice@example.com

With several sessionCredentials wam waits until all of them have been seen:

  $ wam -c spa.webapps.js refresh spa-both 2>&1 | mask
  spa-both alice@example.com: saving authorization Token legacy-...ple.com
  spa-both alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens spa.tokens.json | grep spa-both
  spa-both alice@example.com authorization:Token expires=+1440min value=legacy-alice@example.com
  spa-both alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com exp=+60min}

Nothing is stale, so a full refresh doesn't log in anywhere (the "Token"
header has no expiry information and gets the 24h default):

  $ fakereset
  $ wam -c spa.webapps.js refresh 2>&1 | mask
  $ fakestats

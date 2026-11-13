"wam register" runs the register() steps of an app and then verifies the
account by logging in with login().

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture register.webapps.js

  $ wam -c register.webapps.js register signup dave@example.com
  registering signup dave@example.com
  registration steps for account dave@example.com on webapp signup are done completed, will now verify that new userid/passwd actually works
  signup dave@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:dave@example.com: 1
  register:dave@example.com: 1
  $ tokens register.tokens.json
  signup dave@example.com cookie:SessionId expires=+60min value=<hex>

Without arguments all accounts of all apps are registered:

  $ fakereset
  $ wam -c register.webapps.js register
  registering signup dave@example.com
  registration steps for account dave@example.com on webapp signup are done completed, will now verify that new userid/passwd actually works
  signup dave@example.com: saving cookie: SessionId
  registering signup erin@example.com
  registration steps for account erin@example.com on webapp signup are done completed, will now verify that new userid/passwd actually works
  signup erin@example.com: saving cookie: SessionId
  $ fakestats
  cookie-login:dave@example.com: 1
  cookie-login:erin@example.com: 1
  register:dave@example.com: 1
  register:erin@example.com: 1
  $ tokens register.tokens.json
  signup dave@example.com cookie:SessionId expires=+60min value=<hex>
  signup erin@example.com cookie:SessionId expires=+60min value=<hex>

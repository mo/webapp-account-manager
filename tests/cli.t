Command line handling and error cases that don't need any login.

  $ . "$TESTDIR/helpers.sh"
  $ use_fixture cookie.webapps.js

Help output:

  $ wam --help
  Usage: wam [options] [command]
  
  Options:
    -c, --config [configFile]            config file (default: "webapps.js")
    -h, --help                           display help for command
  
  Commands:
    refresh [options] [appid] [userid]   ensure all accounts are created and
                                         logged in
    get [options] <appid> <userid>
    register [options] [appid] [userid]  register specified accounts (useful for
                                         re-creating accounts in test systems
                                         that delete all accounts periodically)
    forget [appid] [userid]
    list [options] [appid] [userid]
    help [command]                       display help for command
  $ wam refresh --help 2>&1 | mask
  Usage: wam refresh [options] [appid] [userid]
  
  ensure all accounts are created and logged in
  
  Options:
    --debug      show browser while updating tokens
    -f, --force  refresh cookies/tokens even if they have not expired yet
    -h, --help   display help for command
  $ wam get --help
  Usage: wam get [options] <appid> <userid>
  
  Options:
    -t, --type [type]      type of session credentials to get (choices: "cookie",
                           "authorization", "oauth2-refresh", "all", default:
                           "all")
    -f, --format [format]  output format (choices: "simple", default: "simple")
    -h, --help             display help for command
  $ wam list --help
  Usage: wam list [options] [appid] [userid]
  
  Options:
    -f, --full  Show full cookies/tokens
    -h, --help  display help for command

The config file defaults to ./webapps.js and must exist:

  $ wam list
  error: config file "webapps.js" does not exist
  [1]
  $ wam -c nope.webapps.js list
  error: config file "nope.webapps.js" does not exist
  [1]
  $ cp "$FIXTURES/oauth.webapps.js" webapps.js
  $ wam refresh password-norefresh 2>&1 | mask
  password-norefresh alice@example.com: saving authorization Bearer eyJhbGc...<rnd>

...and then the tokens file is ./tokens.json:

  $ ls *.json
  tokens.json
  $ rm webapps.js tokens.json

Unknown appid / userid:

  $ wam -c cookie.webapps.js list nosuchapp
  error: no such appid "nosuchapp"
  [1]
  $ wam -c cookie.webapps.js list cookie nosuchuser@example.com
  error: .accounts[] for appid "cookie" does not contain userid "nosuchuser@example.com"
  [1]
  $ wam -c cookie.webapps.js refresh nosuchapp
  error: no such appid "nosuchapp"
  [1]
  $ wam -c cookie.webapps.js refresh cookie nosuchuser@example.com
  error: .accounts[] for appid "cookie" does not contain userid "nosuchuser@example.com"
  [1]
  $ wam -c cookie.webapps.js forget nosuchapp
  error: no such appid "nosuchapp"
  [1]
  $ wam -c cookie.webapps.js register nosuchapp
  error: no such appid "nosuchapp"
  [1]
  $ wam -c cookie.webapps.js get nosuchapp alice@example.com
  error: no such appid "nosuchapp"
  [1]

"get" fails for accounts that have never been logged in:

  $ wam -c cookie.webapps.js get cookie alice@example.com
  error: no such account with userid "alice@example.com"
  [1]

"get" requires both appid and userid and validates its options:

  $ wam -c cookie.webapps.js get cookie
  error: missing required argument 'userid'
  [1]
  $ wam -c cookie.webapps.js get cookie alice@example.com --type bogus
  error: option '-t, --type [type]' argument 'bogus' is invalid. Allowed choices are cookie, authorization, oauth2-refresh, all.
  [1]
  $ wam -c cookie.webapps.js get cookie alice@example.com --format json
  error: option '-f, --format [format]' argument 'json' is invalid. Allowed choices are simple.
  [1]

Unknown commands:

  $ wam -c cookie.webapps.js frobnicate
  error: unknown command 'frobnicate'
  [1]

The tokens file (derived from the config file name) must contain a list:

  $ echo '{}' > cookie.tokens.json
  $ wam -c cookie.webapps.js list > out.txt 2>&1
  [1]
  $ grep -o 'cookie.tokens.json must be a json file containing a list at the top level' out.txt
  cookie.tokens.json must be a json file containing a list at the top level

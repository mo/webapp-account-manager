Apps without sessionCredentials save every cookie / authorization header seen
during the browser login.

  $ . "$TESTDIR/helpers.sh"
  $ cat > all.webapps.js <<'X'
  > import process from 'node:process'
  > const base = process.env.FAKESERVER_URL
  > export default [
  >   {
  >     appid: 'everything',
  >     accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  >     login: async (page, userid, passwd) => {
  >       await page.goto(`${base}/cookie/login`)
  >       await page.getByLabel('Email').fill(userid)
  >       await page.getByLabel('Password').fill(passwd)
  >       await page.click('input[type="submit"]')
  >     },
  >   },
  >   {
  >     appid: 'everything-spa',
  >     accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  >     login: async (page, userid, passwd) => {
  >       await page.goto(`${base}/spa/login`)
  >       await page.getByLabel('Email').fill(userid)
  >       await page.getByLabel('Password').fill(passwd)
  >       await page.getByRole('button', { name: 'Log in' }).click()
  >       await page.waitForSelector('text=Logged in as')
  >     },
  >   },
  >   {
  >     appid: 'everything-short',
  >     accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  >     login: async (page, userid, passwd) => {
  >       await page.goto(`${base}/cookie/login?ttl=600`)
  >       await page.getByLabel('Email').fill(userid)
  >       await page.getByLabel('Password').fill(passwd)
  >       await page.click('input[type="submit"]')
  >     },
  >   },
  > ]
  > X

  $ wam -c all.webapps.js refresh everything 2>&1 | mask
  everything alice@example.com: saving cookie: Tracking
  everything alice@example.com: saving cookie: SessionId
  everything alice@example.com: saving cookie: Theme
  $ tokens all.tokens.json
  everything alice@example.com cookie:Tracking expires=+525600min value=t-123
  everything alice@example.com cookie:SessionId expires=+60min value=<hex>
  everything alice@example.com cookie:Theme expires=+1440min value=dark

Each cookie keeps the expiry the server sent (Tracking: 1 year, SessionId: 1h,
Theme: 1 day).

"get" returns all of them:

  $ wam -c all.webapps.js get everything alice@example.com | describe
  t-123
  <hex>
  dark
  $ wam -c all.webapps.js get everything alice@example.com --type cookie | describe
  t-123
  <hex>
  dark

Both authorization header schemes used by the SPA are saved. Headers without
a JWT exp claim get the 24h default:

  $ wam -c all.webapps.js refresh everything-spa 2>&1 | mask
  everything-spa alice@example.com: saving authorization Token legacy-...ple.com
  everything-spa alice@example.com: saving authorization Bearer eyJhbGc...<rnd>
  $ tokens all.tokens.json | grep everything-spa
  everything-spa alice@example.com authorization:Token expires=+1440min value=legacy-alice@example.com
  everything-spa alice@example.com authorization:Bearer expires=+60min value=jwt{sub=alice@example.com exp=+60min}
  $ wam -c all.webapps.js get everything-spa alice@example.com --type authorization | describe
  legacy-alice@example.com
  jwt{sub=alice@example.com exp=+60min}

Every saved credential has to be fresh. In everything-short the SessionId
cookie only lives 10 minutes (Tracking and Theme are long lived), so it is
logged in again on every refresh while the other two apps are left alone:

  $ wam -c all.webapps.js refresh everything-short 2>&1 | mask
  everything-short alice@example.com: saving cookie: Tracking
  everything-short alice@example.com: saving cookie: SessionId
  everything-short alice@example.com: saving cookie: Theme
  $ tokens all.tokens.json | grep everything-short
  everything-short alice@example.com cookie:Tracking expires=+525600min value=t-123
  everything-short alice@example.com cookie:SessionId expires=+10min value=<hex>
  everything-short alice@example.com cookie:Theme expires=+1440min value=dark
  $ fakereset
  $ wam -c all.webapps.js refresh 2>&1 | mask
  everything-short alice@example.com: saving cookie: Tracking
  everything-short alice@example.com: saving cookie: SessionId
  everything-short alice@example.com: saving cookie: Theme
  $ fakestats
  cookie-login:alice@example.com: 1

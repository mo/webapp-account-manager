// Web apps that log in through a server rendered HTML form and keep the
// session in a cookie. See tests/fakeserver/server.js for the query params.
import process from 'node:process'

const base = process.env.FAKESERVER_URL

const cookieLogin =
  (query = '', host = base) =>
  async (page, userid, passwd) => {
    await page.goto(`${host}/cookie/login${query}`)
    await page.getByLabel('Email').click()
    await page.keyboard.type(userid)
    await page.getByLabel('Password').click()
    await page.keyboard.type(passwd)
    await page.click('input[type="submit"][value="Log in"]')
    await page.waitForSelector('text=You are logged in')
  }

export default [
  {
    appid: 'cookie',
    accounts: [
      { userid: 'alice@example.com', passwd: 'alice-pw' },
      { userid: 'bob@example.com', passwd: 'bob-pw' },
      { userid: 'carol@example.com', passwd: 'carol-pw', enabled: false },
    ],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin(),
  },
  {
    // Session cookie only lives 10 minutes, i.e. never "fresh" (wam wants
    // at least 20 minutes left), so every refresh logs in again.
    appid: 'cookie-short',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?ttl=600'),
  },
  {
    // Just above / below the "fresh" threshold (20 minutes left)
    appid: 'cookie-21min',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?ttl=1290'),
  },
  {
    appid: 'cookie-18min',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?ttl=1110'),
  },
  {
    // Cookie expiry given with Expires= instead of Max-Age=
    appid: 'cookie-expires',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?expires=1&ttl=7200'),
  },
  {
    // Browser session cookie (no expiry) with maxAge override from config
    appid: 'cookie-session-maxage',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId', maxAge: 5400 }],
    login: cookieLogin('?session=1'),
  },
  {
    // Browser session cookie (no expiry) and no maxAge => wam assumes 24h
    appid: 'cookie-session-default',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?session=1'),
  },
]

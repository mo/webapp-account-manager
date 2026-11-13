// Cookie apps where the session cookie is deleted, replaced or set in several
// scopes during login. See tests/fakeserver/server.js for the query params.
import process from 'node:process'

const base = process.env.FAKESERVER_URL

const cookieLogin =
  (query = '', host = base) => async (page, userid, passwd) => {
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
    // The server deletes SessionId (Max-Age=0) before setting a new one
    appid: 'cookie-clearfirst',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?clearfirst=1'),
  },
  {
    // After login a SessionId cookie with another Path is deleted; the
    // Path=/ one must still be saved
    appid: 'cookie-otherpath',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?otherpath=1'),
  },
  {
    // After login a SessionId cookie with a Domain attribute is deleted; the
    // host-only one must still be saved
    appid: 'cookie-otherdomain',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    // Domain= is meaningless for an IP address, so use a hostname (Chromium
    // resolves *.localhost to the loopback address)
    login: cookieLogin(
      '?otherdomain=1',
      base.replace('127.0.0.1', 'wam.localhost'),
    ),
  },
  {
    // Same SessionId value at Path=/ (1h) and Path=/legacy (2h)
    appid: 'cookie-twopaths',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?twopaths=1'),
  },
  {
    // SessionId is set to a-..., then b-..., then the same a-... header again
    appid: 'cookie-aba',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: cookieLogin('?aba=1'),
  },
]

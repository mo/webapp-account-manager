// Single page apps that keep a JWT in JS and send it in an Authorization
// header. wam intercepts the request headers to capture the token.
import process from 'node:process'

const base = process.env.FAKESERVER_URL

const spaLogin =
  (query = '') =>
  async (page, userid, passwd) => {
    await page.goto(`${base}/spa/login${query}`)
    await page.getByLabel('Email').click()
    await page.keyboard.type(userid)
    await page.getByLabel('Password').click()
    await page.keyboard.type(passwd)
    await page.getByRole('button', { name: 'Log in' }).click()
  }

export default [
  {
    appid: 'spa',
    accounts: [
      { userid: 'alice@example.com', passwd: 'alice-pw' },
      { userid: 'bob@example.com', passwd: 'bob-pw' },
    ],
    sessionCredentials: [{ type: 'authorization', subtype: 'Bearer' }],
    login: spaLogin('?aud=spa-api'),
  },
  {
    appid: 'spa-multiaud',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'authorization', subtype: 'Bearer' }],
    login: spaLogin('?aud=api-one,api-two'),
  },
  {
    // JWT without "exp" claim; lifetime comes from maxAge in the config
    appid: 'spa-noexp',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'authorization', subtype: 'Bearer', maxAge: 2700 }],
    login: spaLogin('?noexp=1'),
  },
  {
    // Track the legacy "Token" scheme instead of Bearer
    appid: 'spa-legacy',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [{ type: 'authorization', subtype: 'Token' }],
    login: spaLogin(),
  },
  {
    // Two session credentials of different subtypes: wam must wait for both
    appid: 'spa-both',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
    sessionCredentials: [
      { type: 'authorization', subtype: 'Bearer' },
      { type: 'authorization', subtype: 'Token' },
    ],
    login: spaLogin(),
  },
]

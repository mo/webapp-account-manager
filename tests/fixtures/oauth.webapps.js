// OAuth2 based apps: device flow (with a playwright driven approval step)
// and the resource owner password grant (pure HTTP, no browser).
import process from 'node:process'

const base = process.env.FAKESERVER_URL

export default [
  {
    appid: 'device',
    type: 'deviceflow',
    idpBaseUrl: `${base}/oauth`,
    clientId: 'wam-device-client',
    accounts: [
      { userid: 'alice@example.com', passwd: 'alice-pw' },
      { userid: 'bob@example.com', passwd: 'wrong-pw' },
    ],
    login: async (page, activationUrl, userid, passwd) => {
      await page.goto(activationUrl)
      await page.getByLabel('Email').click()
      await page.keyboard.type(userid)
      await page.getByLabel('Password').click()
      await page.keyboard.type(passwd)
      await page.click('input[type="submit"][value="Approve"]')
      await page.waitForSelector('h1')
    },
  },
  {
    appid: 'password',
    type: 'oauth2-password',
    tokenUrl: `${base}/oauth/token`,
    clientId: 'wam-password-client',
    scope: 'openid profile',
    accounts: [
      { userid: 'alice@example.com', passwd: 'alice-pw' },
      { userid: 'bob@example.com', passwd: 'bob-pw' },
    ],
  },
  {
    // Access token only valid 10 min => never fresh => refresh every time
    appid: 'password-short',
    type: 'oauth2-password',
    tokenUrl: `${base}/oauth/token`,
    clientId: 'wam-short-client',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  },
  {
    appid: 'password-norefresh',
    type: 'oauth2-password',
    tokenUrl: `${base}/oauth/token`,
    clientId: 'wam-norefresh-client',
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  },
  {
    appid: 'password-sessioncreds',
    type: 'oauth2-password',
    tokenUrl: `${base}/oauth/token`,
    clientId: 'wam-short-client',
    sessionCredentials: [
      { type: 'authorization', subtype: 'Bearer' },
      { type: 'oauth2-refresh' },
    ],
    accounts: [{ userid: 'alice@example.com', passwd: 'alice-pw' }],
  },
  {
    appid: 'password-badpw',
    type: 'oauth2-password',
    tokenUrl: `${base}/oauth/token`,
    clientId: 'wam-password-client',
    accounts: [{ userid: 'alice@example.com', passwd: 'not-alices-pw' }],
  },
]

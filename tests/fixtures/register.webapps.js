// App where accounts must be created with "wam register" first.
import process from 'node:process'

const base = process.env.FAKESERVER_URL

export default [
  {
    appid: 'signup',
    accounts: [
      { userid: 'dave@example.com', passwd: 'dave-pw' },
      { userid: 'erin@example.com', passwd: 'erin-pw' },
    ],
    sessionCredentials: [{ type: 'cookie', name: 'SessionId' }],
    login: async (page, userid, passwd) => {
      await page.goto(`${base}/cookie/login`)
      await page.getByLabel('Email').click()
      await page.keyboard.type(userid)
      await page.getByLabel('Password').click()
      await page.keyboard.type(passwd)
      await page.click('input[type="submit"][value="Log in"]')
    },
    register: async (page, userid, passwd) => {
      await page.goto(`${base}/cookie/register`)
      await page.getByLabel('Name').fill('Test User')
      await page.getByLabel('Email').fill(userid)
      await page.getByLabel('Password').fill(passwd)
      await page.click('input[type="submit"][value="Register"]')
      await page.waitForSelector('text=Registration complete')
    },
  },
]

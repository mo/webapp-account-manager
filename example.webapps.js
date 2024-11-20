export default [
  {
    appid: 'hyf',
    accounts: [
      {
        userid: 'a@a.com',
        passwd: 'a',
      },
    ],
    sessionCredentials: [
      { type: 'cookie', name: 'AuthCookie' },
    ],
    login: async (page, userid, passwd) => {
      await page.goto('https://hack-yourself-first.com/Account/Login')
      // Dismiss modal with ad for Troy Hunt pluralsight course
      await page.click('button:text("Close")')
      await page.getByLabel('Email').click()
      await page.keyboard.type(userid)
      await page.getByLabel('Password').click()
      await page.keyboard.type(passwd)
      await page.click('input[type="submit"][value="Log in"]')
    },
  },
]

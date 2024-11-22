export default [
  {
    appid: 'hyf',
    accounts: [
      {
        userid: 'a@a.com',
        passwd: 'a',
      },
      {
        userid: 'third@example.com',
        passwd: 'third',
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
    register: async (page, userid, passwd) => {
      await page.goto('https://hack-yourself-first.com/Account/Register')
      // Dismiss modal with ad for Troy Hunt pluralsight course
      await page.click('button:text("Close")')
      await page.getByLabel('Email').click()
      await page.keyboard.type(userid)
      await page.getByLabel('First name').click()
      await page.keyboard.type('firstname')
      await page.getByLabel('Last name').click()
      await page.keyboard.type('lastname')
      await page.click('#Password')
      await page.keyboard.type(passwd)
      await page.click('#ConfirmPassword')
      await page.keyboard.type(passwd)
      await page.click('input[type="submit"][value="Register"]')
      await page.waitForLoadState('networkidle')
    },
  },
]

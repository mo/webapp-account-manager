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
  {
    appid: 'owasp-juice',
    accounts: [
      {
        userid: 'a@a.com',
        passwd: 'Juicer4!',
      },
      {
        userid: 'b@b.com',
        passwd: 'Juicer4!',
      },
    ],
    sessionCredentials: [
      { type: 'authorization', subtype: 'Bearer', maxAge: 1500 },
    ],
    login: async (page, userid, passwd) => {
      await page.goto('https://demo.owasp-juice.shop/#/login')
      // Dismiss welcome to Juice shop modal
      await page.getByLabel('Close Welcome Banner').click()

      await page.click('#email')
      await page.keyboard.type(userid)
      await page.click('#password')
      await page.keyboard.type(passwd)
      await page.getByLabel('Login', { exact: true }).click()
    },
    register: async (page, userid, passwd) => {
      await page.goto('https://demo.owasp-juice.shop/#/register')
      // Dismiss welcome to Juice shop modal
      await page.getByLabel('Close Welcome Banner').click()

      await page.getByLabel('Email address field').click()
      await page.keyboard.type(userid)
      await page.getByLabel('Field for the password').click()
      await page.keyboard.type(passwd)
      await page.getByLabel('Field to confirm the password').click()
      await page.keyboard.type(passwd)
      await page.click('[name="securityQuestion"]')
      await page.click('#mat-option-0')

      await page.getByLabel('Field for the answer to the security question')
        .click()
      await page.keyboard.type('a')

      await page.getByLabel('Button to complete the registration').click()
    },
  },
]

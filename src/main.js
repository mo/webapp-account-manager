import process from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import { Option, program } from 'commander'
import { chromium } from 'playwright'
import cookie from 'cookie'

import dayjs from './dayjs.js'
import { consoleError, consoleLog } from './console.js'
import { waitForKey } from './utils.js'

const parseCookie = (setCookieValue) => {
  const cookieParts = setCookieValue.split(';')
  const cookieName = cookieParts[0].split('=')[0]
  const parsedCookie = cookie.parse(setCookieValue)
  const expires = dayjs(parsedCookie.expires)
  return {
    type: 'cookie',
    name: cookieName,
    value: parsedCookie[cookieName],
    expires: expires.utc().format(),
    raw: setCookieValue,
  }
}

const executeSteps = async (options, app, account, playwrightFunction) => {
  const browser = await chromium.launch({
    headless: !options.debug,
    logger: {
      isEnabled: (name, _severity) => name === 'api',
      log: (_name, _severity, message, _args) => {
        if (
          options.debug &&
          message.includes('started') &&
          !message.includes('response.headersArray')
        ) {
          consoleLog(message)
        }
      },
    },
  })
  const context = await browser.newContext()
  context.setDefaultTimeout(0)
  context.setDefaultNavigationTimeout(0)
  const page = await context.newPage()

  const interceptedCookiesAndTokens = []
  page.on('response', async (response) => {
    const headers = await response.headersArray()
    headers.filter((headerEntry) => headerEntry.name === 'set-cookie').forEach(
      (headerEntry) => {
        const cookie = parseCookie(headerEntry.value)
        if (isSessionCredential(app, cookie)) {
          consoleLog('Saving cookie: ' + cookie.name)
        } else if (options.debug) {
          consoleLog(
            `Ignoring cookie not marked as session credential: ${cookie.name}`,
          )
        }
        interceptedCookiesAndTokens.push(cookie)
      },
    )
  })

  await playwrightFunction(page, account.userid, account.passwd)

  if (options.debug) {
    consoleLog('Press any key to close browser...')
    await waitForKey()
  }

  await context.close()
  await browser.close()
  return interceptedCookiesAndTokens
}

const updateToken = async (options, app, account, tokensJsonObj) => {
  const interceptedCookiesAndTokens = await executeSteps(
    options,
    app,
    account,
    app.login,
  )
  let tokensJsonAppEntry = tokensJsonObj.find((entry) =>
    entry.appid === app.appid
  )
  if (!tokensJsonAppEntry) {
    tokensJsonAppEntry = { appid: app.appid, accounts: [] }
    tokensJsonObj.push(tokensJsonAppEntry)
  }
  let tokensJsonAccountEntry = tokensJsonAppEntry.accounts.find(
    (accountEntry) => accountEntry.userid === account.userid,
  )
  if (!tokensJsonAccountEntry) {
    tokensJsonAccountEntry = { userid: account.userid }
    tokensJsonAppEntry.accounts.push(tokensJsonAccountEntry)
  }
  tokensJsonAccountEntry.cookiesAndTokens = interceptedCookiesAndTokens
}

const tokenIsValid = (app, account, tokensJsonObj) => {
  const tokenAccountEntry = tokensJsonObj.find((tokenAppInfo) =>
    tokenAppInfo.appid === app.appid
  )?.accounts
    ?.find((tokenAccountEntry) => tokenAccountEntry.userid === account.userid)
  return tokenAccountEntry && dayjs(tokenAccountEntry.expires).isAfter(dayjs())
}

const loadConfig = async () => {
  const webappsJsFilename = program.opts().config
  const tokensJsonFilename = webappsJsFilename.replace(
    'webapps.js',
    'tokens.json',
  )
  const webappsJsonObj = (await import(
    path.resolve(process.cwd(), webappsJsFilename)
  )).default
  let tokensJsonObj
  if (fs.existsSync(tokensJsonFilename)) {
    tokensJsonObj = JSON.parse(fs.readFileSync(tokensJsonFilename))
    if (!Array.isArray(tokensJsonObj)) {
      throw Error(
        `${tokensJsonFilename} must be a json file containing a list at the top level`,
      )
    }
  } else {
    tokensJsonObj = []
  }

  return { webappsJsonObj, tokensJsonObj, tokensJsonFilename }
}

const cmdRefresh = async (options) => {
  const config = await loadConfig()
  for (const app of config.webappsJsonObj) {
    for (const account of app.accounts) {
      consoleLog(`checking ${app.appid} ${account.userid}`)
      if (!tokenIsValid(app, account, config.tokensJsonObj)) {
        await updateToken(options, app, account, config.tokensJsonObj)
        // Reorder "tokensJsonObj" to same order used in webapps.js file
        config.tokensJsonObj = config.webappsJsonObj.map((app) =>
          config.tokensJsonObj.find((tokenAppInfo) =>
            tokenAppInfo.appid === app.appid
          )
        )
        fs.writeFileSync(
          config.tokensJsonFilename,
          JSON.stringify(config.tokensJsonObj, null, 4),
        )
      }
    }
  }
}

const isSessionCredential = (app, cookieOrToken) =>
  app.sessionCredentials.some((cred) => {
    const isSessionCookie = cred.type === 'cookie' &&
      cookieOrToken.type === 'cookie' && cookieOrToken.name === cred.name
    const isSessionToken = cred.type === 'token' &&
      cookieOrToken.type === 'token'
    return isSessionCookie || isSessionToken
  })

const cmdGet = async (appid, userid) => {
  const config = await loadConfig()
  const app = config.webappsJsonObj.find((appEntry) => appEntry.appid === appid)
  const cookiesAndTokens =
    config.tokensJsonObj.find((appEntry) => appEntry.appid === appid)?.accounts
      ?.find((accountEntry) => accountEntry.userid === userid)
      .cookiesAndTokens || []
  let credentials
  if (app.sessionCredentials && app.sessionCredentials.length > 0) {
    credentials = cookiesAndTokens.filter((cookieOrToken) =>
      isSessionCredential(app, cookieOrToken)
    )
  } else {
    credentials = cookiesAndTokens
  }
  if (credentials.length > 0) {
    credentials.forEach((cred) => {
      consoleLog(cred.value)
    })
  }
}

program
  .name('wam')
  .option(
    '-c, --config [configFile]',
    'config file',
    'webapps.js',
  )

program.hook('preAction', () => {
  if (!fs.existsSync(program.opts().config)) {
    consoleError(`error: config file "${program.opts().config}" does not exist`)
    process.exit(1)
  }
})

program
  .command('refresh').description(
    'ensure all accounts are created and logged in',
  ).option(
    '--debug',
    'show browser while updating tokens and run steps slowly',
  )
  .action(cmdRefresh)

program
  .command('get <appid> <userid>')
  .option(
    '-a, --all',
    'get all cookies/tokens, not just the one marked as session credentials',
    false,
  )
  .addOption(new Option(
    '-f, --format [format]',
    'output format',
    'simple',
  ).choices(['simple', 'raw']))
  .action(cmdGet)

await program.parseAsync(process.argv)

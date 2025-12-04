import process from 'node:process'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { Option, program } from 'commander'
import playwright from 'playwright'
import cookie from 'cookie'
import jwt from 'jsonwebtoken'
import Table from 'tty-table'

import dayjs from './dayjs.js'
import { consoleError, consoleLog } from './console.js'

const parseCookie = (setCookieValue) => {
  const cookieParts = setCookieValue.split(';')
  const cookieName = cookieParts[0].split('=')[0]
  const parsedCookie = cookie.parse(setCookieValue)
  let expiresUTC
  if (parsedCookie.maxAge) {
    expiresUTC = dayjs().add(parsedCookie.maxAge, 'seconds')
  } else if (parsedCookie.expires) {
    expiresUTC = dayjs(parsedCookie.expires)
  }
  return {
    type: 'cookie',
    name: cookieName,
    value: parsedCookie[cookieName],
    expiresUTC: expiresUTC ? expiresUTC.utc().format() : undefined,
    raw: setCookieValue,
  }
}

const tryDecodeJWT = (maybeJwt) => {
  try {
    return jwt.decode(maybeJwt)
  } catch {
    return false
  }
}

const getExpirationTime = (token) => {
  const decodedJwt = tryDecodeJWT(token)
  // Note: "exp" claim is optional:
  // https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1.4
  if (decodedJwt && decodedJwt.exp) {
    return dayjs.unix(decodedJwt.exp)
  }
  return undefined
}

const waitUntilFoundAllSessionCredentials = (
  app,
  interceptedCookiesAndTokens,
  debug,
) => {
  return new Promise((resolve) => {
    const intervalId = setInterval(() => {
      if (
        app.sessionCredentials.every((sessionCred) =>
          interceptedCookiesAndTokens.some((cookieOrToken) =>
            isMatchingSessionCredential(sessionCred, cookieOrToken)
          )
        )
      ) {
        clearInterval(intervalId)
        resolve()
      } else if (debug) {
        consoleLog(`Still havn't found, what i'm looking for:`)
      }
      if (debug) {
        consoleLog(
          `${
            app.sessionCredentials.map((sessionCred) =>
              `${
                interceptedCookiesAndTokens.some((
                    cookieOrToken,
                  ) =>
                    isMatchingSessionCredential(
                      sessionCred,
                      cookieOrToken,
                    )
                  )
                  ? '✅ Found        '
                  : '❓ Not Found Yet'
              } ---> ${JSON.stringify(sessionCred)}`
            ).join('\n') + '\n\n'
          }`,
        )
      }
    }, 1250)
  })
}

const hasSessionCredentialsDefined = (app) =>
  app.sessionCredentials && app.sessionCredentials.length > 0

const shortenString = (str, maxLen = 23) => {
  if (str.length > maxLen) {
    const prefixSuffixLength = Math.floor((maxLen - 3) / 2)
    return str.slice(0, prefixSuffixLength) + '...' +
      str.slice(-1 * prefixSuffixLength)
  } else {
    return str
  }
}

const getDefaultExpiresUTC = (app, cookieOrToken) => {
  let defaultExpiresUTC
  // For auth session cookies (cookies that makes you logged in) that
  // are browser session cookies (no expiration, deleted when browser closes)
  // we support the ability to set a specific cookie maxAge via the sessionCredential
  // specification because we might know that the server treats these cookies as
  // valid for X days even though it sends them to the client as browser session cookies.
  // Similarly, it's possible to set maxAge in the sessionCredential specification to
  // handle JWTs that doesn't have an .exp claim.
  const sessionCredMaxAge = app.sessionCredentials?.find((cred) =>
    (cred.type === 'cookie' && cookieOrToken.type === 'cookie' &&
      cred.name === cookieOrToken.name) ||
    (cred.type === 'authorization' && cookieOrToken.type === 'authorization' &&
      cred.subtype === cookieOrToken.subtype)
  )
    ?.maxAge
  if (sessionCredMaxAge) {
    defaultExpiresUTC = dayjs().add(
      sessionCredMaxAge,
      'seconds',
    ).utc().format()
  } else {
    // If we literally have no idea how long the credential is valid, then assume it's valid for at least 24h
    defaultExpiresUTC = dayjs().add(
      24 * 60 * 60,
      'seconds',
    ).utc().format()
  }
  return defaultExpiresUTC
}

const startPlaywrightChromium = async (debugMode) => {
  const browser = await playwright.chromium.launch({
    headless: !debugMode,
    logger: {
      isEnabled: (name, _severity) => name === 'api',
      log: (_name, _severity, message, _args) => {
        if (
          debugMode &&
          message.includes('started') &&
          !message.includes('response.headersArray') &&
          !message.includes('request.headersArray')
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
  return { browser, context, page }
}

const executeRegisterStep = async (
  options,
  account,
  playwrightFunction,
) => {
  const { browser, context, page } = await startPlaywrightChromium(
    options.debug,
  )
  await playwrightFunction(page, account.userid, account.passwd)
  // Wait for networkidle with timeout because page might have websocket alive forever
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 })
  } catch (err) {
    if (!(err instanceof playwright.errors.TimeoutError)) {
      throw err
    }
  }

  if (options.debug) {
    consoleLog('All session credentials has been saved.')
  }

  await context.close()
  await browser.close()
}

const executeLoginSteps = async (options, app, account, playwrightFunction) => {
  const interceptedCookiesAndTokens = []
  let browser, context
  try {
    const pwObjs = await startPlaywrightChromium(
      options.debug,
    )
    browser = pwObjs.browser
    context = pwObjs.context
    const page = pwObjs.page

    const alreadySeenHeaders = new Set()
    page.on('request', async (request) => {
      try {
        ;(await request.headersArray())
          .filter((headerEntry) =>
            !alreadySeenHeaders.has(
              `${headerEntry.name}: ${headerEntry.value}`,
            )
          ).filter((headerEntry) => headerEntry.name === 'authorization')
          .forEach(
            (headerEntry) => {
              alreadySeenHeaders.add(
                `${headerEntry.name}: ${headerEntry.value}`,
              )
              if (headerEntry.name === 'authorization') {
                const subtype = headerEntry.value.split(' ')[0]
                const token = headerEntry.value.slice(
                  subtype.length + 1,
                )
                const authHeader = {
                  type: 'authorization',
                  subtype,
                  value: token,
                }
                authHeader.expiresUTC = getExpirationTime(token) ||
                  getDefaultExpiresUTC(app, authHeader)
                if (
                  !hasSessionCredentialsDefined(app) ||
                  isSessionCredential(app, authHeader)
                ) {
                  consoleLog(
                    `${app.appid} ${account.userid}: saving authorization ${authHeader.subtype} ${
                      shortenString(authHeader.value)
                    }`,
                  )
                  interceptedCookiesAndTokens.push(authHeader)
                } else if (options.debug) {
                  consoleLog(
                    `Ignoring authorization header (not marked as session credential) subtype=${authHeader.subtype} value=${authHeader.value}`,
                  )
                }
              }
            },
          )
      } catch {
        // Ignore errors thrown when context.close() is called while headersArray() is running
      }
    })
    page.on('response', async (response) => {
      try {
        ;(await response.headersArray())
          .filter((headerEntry) =>
            !alreadySeenHeaders.has(
              `${headerEntry.name}: ${headerEntry.value}`,
            )
          )
          .filter((headerEntry) => headerEntry.name === 'set-cookie')
          .forEach(
            (headerEntry) => {
              alreadySeenHeaders.add(
                `${headerEntry.name}: ${headerEntry.value}`,
              )
              const cookie = parseCookie(headerEntry.value)
              if (!cookie.expiresUTC) {
                cookie.expiresUTC = getDefaultExpiresUTC(app, cookie)
              }
              if (
                !hasSessionCredentialsDefined(app) ||
                isSessionCredential(app, cookie)
              ) {
                consoleLog(
                  `${app.appid} ${account.userid}: saving cookie: ${cookie.name}`,
                )
                interceptedCookiesAndTokens.push(cookie)
              } else if (options.debug) {
                consoleLog(
                  `Ignoring cookie not marked as session credential: ${cookie.name}`,
                )
              }
            },
          )
      } catch {
        // Ignore errors thrown when context.close() is called while headersArray() is running
      }
    })

    await playwrightFunction(page, account.userid, account.passwd)

    await waitUntilFoundAllSessionCredentials(
      app,
      interceptedCookiesAndTokens,
      options.debug,
    )
    if (options.debug) {
      consoleLog('All session credentials has been saved.')
    }
  } finally {
    await context.close()
    await browser.close()
  }
  return interceptedCookiesAndTokens
}

const loginWithAccountAndGetFreshCredentials = async (
  options,
  app,
  account,
  tokensJsonObj,
) => {
  const interceptedCookiesAndTokens = await executeLoginSteps(
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

const isValidForAtleast15Minutes = (credential) => {
  return dayjs(credential.expiresUTC).diff(dayjs(), 'minute') >= 20
}

const allCredentialsForAccountAreValidForAtLeast15Minutes = (
  app,
  account,
  tokensJsonObj,
) => {
  const cookiesAndTokens =
    tokensJsonObj.find((tokenAppInfo) => tokenAppInfo.appid === app.appid)
      ?.accounts
      ?.find((tokenAccountEntry) => tokenAccountEntry.userid === account.userid)
      ?.cookiesAndTokens || []

  if (hasSessionCredentialsDefined(app)) {
    return cookiesAndTokens.filter((cookieOrToken) =>
      isSessionCredential(app, cookieOrToken)
    ).filter(isValidForAtleast15Minutes).length ===
      app.sessionCredentials.length
  } else {
    return cookiesAndTokens.every(isValidForAtleast15Minutes)
  }
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
    tokensJsonObj = JSON.parse(await fsPromises.readFile(tokensJsonFilename))
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

const cmdRefresh = async (appid, userid, options) => {
  const config = await loadConfig()
  for (
    const { app, account } of getSelectedAppAccountPairs(config, appid, userid)
  ) {
    if (options.debug) {
      consoleLog(`checking ${app.appid} ${account.userid}`)
    }
    if (
      options.force || !allCredentialsForAccountAreValidForAtLeast15Minutes(
        app,
        account,
        config.tokensJsonObj,
      )
    ) {
      try {
        await loginWithAccountAndGetFreshCredentials(
          options,
          app,
          account,
          config.tokensJsonObj,
        )
        await saveTokensJsonToDisk(config)
      } catch (err) {
        consoleError(
          `failed to refresh credentials for ${app.appid} ${account.userid} (error: ${err})`,
        )
      }
    }
  }
}

const registerAccount = async (
  options,
  app,
  account,
) => {
  await executeRegisterStep(
    options,
    account,
    app.register,
  )
}

const saveTokensJsonToDisk = async (config) => {
  // Reorder "tokensJsonObj" to same order used in webapps.js file
  config.tokensJsonObj = config.webappsJsonObj.map((
    app,
  ) =>
    config.tokensJsonObj.find((
      tokenAppInfo,
    ) => tokenAppInfo.appid === app.appid)
  ).filter(Boolean)
  await fsPromises.writeFile(
    config.tokensJsonFilename,
    JSON.stringify(config.tokensJsonObj, null, 4),
  )
}

const cmdRegister = async (appid, userid, options) => {
  const config = await loadConfig()
  for (
    const { app, account } of getSelectedAppAccountPairs(config, appid, userid)
  ) {
    consoleLog(`registering ${app.appid} ${account.userid}`)
    await registerAccount(
      options,
      app,
      account,
    )
    consoleLog(
      `registration steps for account ${account.userid} on webapp ${app.appid} are done completed, will now verify that new userid/passwd actually works`,
    )
    await loginWithAccountAndGetFreshCredentials(
      options,
      app,
      account,
      config.tokensJsonObj,
    )
    await saveTokensJsonToDisk(config)
  }
}

const isMatchingSessionCredential = (sessionCredential, cookieOrToken) => {
  const isSessionCookie = sessionCredential.type === 'cookie' &&
    cookieOrToken.type === 'cookie' &&
    cookieOrToken.name === sessionCredential.name
  const isSessionToken = sessionCredential.type === 'authorization' &&
    cookieOrToken.type === 'authorization' &&
    cookieOrToken.subtype === sessionCredential.subtype
  return isSessionCookie || isSessionToken
}

const isSessionCredential = (app, cookieOrToken) =>
  app.sessionCredentials.some((cred) =>
    isMatchingSessionCredential(cred, cookieOrToken)
  )

const cmdGet = async (appid, userid, options) => {
  const config = await loadConfig()
  const app = config.webappsJsonObj.find((appEntry) => appEntry.appid === appid)
  const cookiesAndTokens =
    config.tokensJsonObj.find((appEntry) => appEntry.appid === appid)
      ?.accounts
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
  credentials.filter((cred) =>
    options.type === 'all' || cred.type === options.type
  ).forEach((cred) => {
    if (options.format === 'simple') {
      consoleLog(cred.value)
    }
  })
}

const forgetCredentials = async (config, appid, userid) => {
  const tokenAccountObj = config.tokensJsonObj.find((appEntry) =>
    appEntry.appid === appid
  )
    ?.accounts
    ?.find((accountEntry) => accountEntry.userid === userid)
  if (tokenAccountObj) {
    tokenAccountObj.cookiesAndTokens = []
    await saveTokensJsonToDisk(config)
  }
}

const cmdForget = async (appid, userid) => {
  const config = await loadConfig()
  for (
    const { app, account } of getSelectedAppAccountPairs(config, appid, userid)
  ) {
    await forgetCredentials(config, app.appid, account.userid)
  }
}

const getSelectedAppAccountPairs = (config, appid, userid) => {
  const selectedAppAccountPairs = []
  if (appid && !config.webappsJsonObj.map((app) => app.appid).includes(appid)) {
    consoleError(`error: no such appid "${appid}"`)
    process.exit(1)
  }
  if (
    userid &&
    !config.webappsJsonObj.find((app) => app.appid === appid).accounts.map(
      (account) => account.userid,
    ).includes(userid)
  ) {
    consoleError(
      `error: .accounts[] for appid "${appid}" does not contain userid "${userid}"`,
    )
    process.exit(1)
  }
  for (const app of config.webappsJsonObj) {
    if (!appid || app.appid === appid) {
      for (const account of app.accounts) {
        if (account.enabled !== false) {
          if (!userid || account.userid === userid) {
            selectedAppAccountPairs.push({
              app,
              account,
            })
          }
        }
      }
    }
  }
  return selectedAppAccountPairs
}

const cmdList = async (appid, userid, options) => {
  const config = await loadConfig()
  const tableRows = []
  for (
    const { app, account } of getSelectedAppAccountPairs(config, appid, userid)
  ) {
    const cookiesAndTokens = config.tokensJsonObj.find((appEntry) =>
      appEntry.appid === app.appid
    )
      ?.accounts
      ?.find((accountEntry) => accountEntry.userid === account.userid)
      ?.cookiesAndTokens || []

    if (cookiesAndTokens.length === 0) {
      tableRows.push({
        expiresUTC: '',
        appid: app.appid,
        userid: account.userid,
        type: '',
        value: '',
      })
    }
    cookiesAndTokens.forEach((cookieOrToken) => {
      const credentialValue = cookieOrToken.type === 'cookie'
        ? `${cookieOrToken.name}=${cookieOrToken.value}`
        : cookieOrToken.value
      const maybeShortenedCredValue = options.full
        ? credentialValue
        : shortenString(credentialValue, 60)

      tableRows.push({
        expiresUTC: cookieOrToken.expiresUTC,
        appid: app.appid,
        userid: account.userid,
        type: cookieOrToken.type,
        value: maybeShortenedCredValue,
      })
    })
  }

  const columns = [{
    value: 'expiresUTC',
    width: 18,
    formatter: function (value) {
      const localExpiration = (expiresUTC) =>
        expiresUTC
          ? dayjs(expiresUTC)
            .format(
              'YYYY-MM-DD HH:mm',
            )
          : ''
      if (dayjs().isBefore(dayjs(value))) {
        value = this.style(localExpiration(value), 'green')
      } else {
        value = this.style(localExpiration(value), 'red')
      }
      return value
    },
  }, {
    value: 'expiresRel',
    width: 15,
    formatter: function (value, _columnIndex, rowIndex, _rowData, inputData) {
      const row = inputData[rowIndex]
      const expiresRel = row.expiresUTC
        ? dayjs(row.expiresUTC).from(dayjs())
        : ''
      if (dayjs().isBefore(dayjs(row.expiresUTC))) {
        value = this.style(expiresRel, 'green')
      } else {
        value = this.style(expiresRel, 'red')
      }
      return value
    },
  }, {
    value: 'appid',
  }, {
    value: 'userid',
  }, {
    value: 'value',
  }]
  consoleLog(
    Table(
      columns,
      tableRows,
      { align: 'left', headerAlign: 'left', headerColor: 'cyan' },
    ).render(),
  )
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
    consoleError(
      `error: config file "${program.opts().config}" does not exist`,
    )
    process.exit(1)
  }
})

program
  .command('refresh [appid] [userid]').description(
    'ensure all accounts are created and logged in',
  ).option(
    '--debug',
    'show browser while updating tokens',
  ).option(
    '-f, --force',
    'refresh cookies/tokens even if they have not expired yet',
  )
  .action(cmdRefresh)

program
  .command('get <appid> <userid>')
  .addOption(
    new Option(
      '-t, --type [type]',
      'type of session credentials to get',
    ).default('all').choices(['cookie', 'authorization', 'all']),
  )
  .addOption(
    new Option(
      '-f, --format [format]',
      'output format',
    ).default('simple').choices(['simple']),
  )
  .action(cmdGet)

program
  .command('register [appid] [userid]').description(
    'register specified accounts (useful for re-creating accounts in test systems that delete all accounts periodically)',
  ).option(
    '--debug',
    'show browser while registering users',
  )
  .action(cmdRegister)

program
  .command('forget [appid] [userid]')
  .action(cmdForget)

program
  .command('list [appid] [userid]')
  .option('-f, --full', 'Show full cookies/tokens')
  .action(cmdList)

await program.parseAsync(process.argv)

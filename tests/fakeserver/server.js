/* oxlint-disable no-console */
// Fake webapp + identity provider used by the cram test suite.
//
// Zero dependencies (only node: builtins) so it runs on any recent node.
// All state is in memory; every test file starts its own instance.
//
// Usage: node server.js [--port N]
// Prints "LISTENING http://127.0.0.1:PORT" on stdout once it accepts
// connections (use --port 0, the default, to get a random free port).
//
// Apps served:
//
//   /cookie/*  classic server-rendered login form that sets a session cookie
//   /spa/*     single page app that keeps a JWT in JS and sends it as an
//              "Authorization: Bearer" header on API calls
//   /oauth/*   OAuth2 IdP: device flow, password grant and refresh_token grant
//   /__*       test control endpoints (stats, reset, revoke)
//
// Most behavior can be tweaked with query params on the login page URL so
// that each test config (webapps.js) can ask for exactly what it needs:
//
//   ttl=SECONDS     lifetime of the session cookie / JWT (default 3600)
//   expires=1       (cookie) use an Expires= attribute instead of Max-Age=
//   session=1       (cookie) session cookie without any expiry at all
//   clearfirst=1    (cookie) delete SessionId (Max-Age=0) on the login page
//                   and again right before setting the new one
//   otherpath=1     (cookie) after login, delete a *different* SessionId
//                   cookie (Path=/legacy); the Path=/ one stays valid
//   otherdomain=1   (cookie) after login, delete a SessionId cookie that has
//                   a Domain attribute; the host-only one stays valid
//   twopaths=1      (cookie) after login, also set SessionId with the same
//                   value at Path=/legacy (Max-Age=7200); both stay valid
//   aba=1           (cookie) set SessionId=a-..., then b-..., then the exact
//                   same a-... Set-Cookie header again (a-... wins)
//   noexp=1         (spa) JWT without an "exp" claim
//   aud=a,b         (spa) JWT audience; one value => string, several => array

import { Buffer } from 'node:buffer'
import http from 'node:http'
import crypto from 'node:crypto'
import process from 'node:process'

const JWT_SECRET = 'fakeserver-secret'

// Hardcoded accounts. Registration (/cookie/register) adds more at runtime.
const accounts = new Map([
  ['alice@example.com', 'alice-pw'],
  ['bob@example.com', 'bob-pw'],
  ['carol@example.com', 'carol-pw'],
])

// OAuth clients. accessTtl/refreshTtl are in seconds.
const clients = {
  'wam-password-client': { accessTtl: 3600, refreshTtl: 7200 },
  'wam-short-client': { accessTtl: 600, refreshTtl: 7200 },
  'wam-norefresh-client': { accessTtl: 3600, refreshTtl: null },
  'wam-device-client': { accessTtl: 3600, refreshTtl: 7200 },
}

const deviceCodes = new Map() // device_code -> { userCode, clientId, approvedFor }
const refreshTokens = new Map() // refresh token -> { clientId, userid, scope }
let stats = {}

const bump = (key) => {
  stats[key] = (stats[key] || 0) + 1
}

const b64url = (buf) => Buffer.from(buf).toString('base64url')

const makeJwt = (claims) => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify(claims))
  const sig = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

const verifyJwt = (token) => {
  const [header, payload, sig] = (token || '').split('.')
  if (!header || !payload || !sig) return null
  const expected = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`).digest('base64url')
  if (expected !== sig) return null
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (claims.exp && claims.exp < Date.now() / 1000) return null
  return claims
}

const now = () => Math.floor(Date.now() / 1000)
const randomId = (len = 16) => crypto.randomBytes(len).toString('hex')

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

const parseBody = async (req) => {
  const raw = await readBody(req)
  if ((req.headers['content-type'] || '').includes('application/json')) {
    return raw ? JSON.parse(raw) : {}
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body === 'object'
  res.writeHead(status, {
    'content-type': isJson ? 'application/json' : 'text/html; charset=utf-8',
    ...headers,
  })
  res.end(isJson ? JSON.stringify(body) : body)
  return true
}

const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const loginForm = (action, extraFields = '', submitLabel = 'Log in') => `
  <form method="post" action="${escapeHtml(action)}">
    ${extraFields}
    <label for="email">Email</label><input id="email" name="email" type="text">
    <label for="password">Password</label><input id="password" name="password" type="password">
    <input type="submit" value="${escapeHtml(submitLabel)}">
  </form>`

const checkPassword = (userid, passwd) =>
  accounts.has(userid) && accounts.get(userid) === passwd

// ---------------------------------------------------------------- /cookie/*

// Deletes the session cookie, like many webapps do on the login page
const CLEAR_SESSION = 'SessionId=; Path=/; Max-Age=0'

const sessionCookieHeader = (query, prefix = '') => {
  const value = `${prefix}${randomId()}`
  const ttl = parseInt(query.get('ttl') || '3600', 10)
  let attrs = 'Path=/; HttpOnly'
  if (query.get('session') === '1') {
    // browser session cookie, no expiry
  } else if (query.get('expires') === '1') {
    attrs += `; Expires=${new Date(Date.now() + ttl * 1000).toUTCString()}`
  } else {
    attrs += `; Max-Age=${ttl}`
  }
  return `SessionId=${value}; ${attrs}`
}

const cookieRoutes = async (req, res, url) => {
  const qs = url.search
  if (url.pathname === '/cookie/login' && req.method === 'GET') {
    return send(
      res,
      200,
      page('Cookie app login', loginForm(`/cookie/login${qs}`)),
      {
        'set-cookie': [
          // A non-session cookie that is set before login has happened
          'Tracking=t-123; Path=/; Max-Age=31536000',
          ...(url.searchParams.get('clearfirst') === '1'
            ? [CLEAR_SESSION]
            : []),
        ],
      },
    )
  }
  if (url.pathname === '/cookie/login' && req.method === 'POST') {
    const { email, password } = await parseBody(req)
    bump(`cookie-login:${email}`)
    if (!checkPassword(email, password)) {
      bump(`cookie-login-failed:${email}`)
      return send(
        res,
        401,
        page('Invalid login', '<p>Bad email or password</p>'),
      )
    }
    const q = url.searchParams
    const sessionHeader = sessionCookieHeader(
      q,
      q.get('aba') === '1' ? 'a-' : '',
    )
    let location = '/cookie/home'
    if (q.get('aba') === '1') {
      location = `/cookie/aba-b?h=${encodeURIComponent(sessionHeader)}`
    } else if (q.get('otherpath') === '1') {
      location = '/cookie/home?otherpath=1'
    } else if (q.get('otherdomain') === '1') {
      location = '/cookie/home?otherdomain=1'
    } else if (q.get('twopaths') === '1') {
      const value = sessionHeader.split(';')[0].split('=')[1]
      location = `/cookie/home?twopaths=${value}`
    }
    // Redirect (like most real webapps do) and set cookies on the redirect
    res.writeHead(303, {
      location,
      'set-cookie': [
        ...(q.get('clearfirst') === '1' ? [CLEAR_SESSION] : []),
        sessionHeader,
        'Theme=dark; Path=/; Max-Age=86400',
      ],
    })
    res.end()
    return true
  }
  if (url.pathname === '/cookie/aba-b') {
    const h = url.searchParams.get('h')
    res.writeHead(303, {
      location: `/cookie/aba-a?h=${encodeURIComponent(h)}`,
      'set-cookie': `SessionId=b-${randomId()}; Path=/; HttpOnly; Max-Age=3600`,
    })
    res.end()
    return true
  }
  if (url.pathname === '/cookie/aba-a') {
    // Re-send the exact Set-Cookie header from the login response
    res.writeHead(303, {
      location: '/cookie/home',
      'set-cookie': url.searchParams.get('h'),
    })
    res.end()
    return true
  }
  if (url.pathname === '/cookie/home') {
    let headers = {}
    if (url.searchParams.get('otherpath') === '1') {
      headers = { 'set-cookie': 'SessionId=; Path=/legacy; Max-Age=0' }
    } else if (url.searchParams.get('twopaths')) {
      headers = {
        'set-cookie': `SessionId=${
          url.searchParams.get('twopaths')
        }; Path=/legacy; HttpOnly; Max-Age=7200`,
      }
    } else if (url.searchParams.get('otherdomain') === '1') {
      headers = {
        'set-cookie': `SessionId=; Domain=${url.hostname}; Path=/; Max-Age=0`,
      }
    }
    return send(res, 200, page('Welcome', '<p>You are logged in</p>'), headers)
  }
  if (url.pathname === '/cookie/register' && req.method === 'GET') {
    return send(
      res,
      200,
      page(
        'Register',
        loginForm(
          '/cookie/register',
          '<label for="name">Name</label><input id="name" name="name">',
          'Register',
        ),
      ),
    )
  }
  if (url.pathname === '/cookie/register' && req.method === 'POST') {
    const { email, password } = await parseBody(req)
    bump(`register:${email}`)
    if (!email || !password) {
      return send(
        res,
        400,
        page('Registration failed', '<p>missing fields</p>'),
      )
    }
    accounts.set(email, password)
    return send(res, 200, page('Registration complete', '<p>Welcome!</p>'))
  }
  return null
}

// ---------------------------------------------------------------- /spa/*

const spaLoginPage = `
  <form id="login">
    <label for="email">Email</label><input id="email" type="text">
    <label for="password">Password</label><input id="password" type="password">
    <button type="submit">Log in</button>
  </form>
  <div id="status"></div>
  <script>
    document.getElementById('login').addEventListener('submit', async (ev) => {
      ev.preventDefault()
      const resp = await fetch('/spa/api/login' + location.search, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        }),
      })
      if (!resp.ok) {
        document.getElementById('status').textContent = 'Invalid login'
        return
      }
      const { token } = await resp.json()
      // A legacy API using a non-Bearer authorization scheme
      await fetch('/spa/api/legacy', { headers: { authorization: 'Token legacy-' + document.getElementById('email').value } })
      const me = await (await fetch('/spa/api/me', { headers: { authorization: 'Bearer ' + token } })).json()
      document.getElementById('status').textContent = 'Logged in as ' + me.sub
    })
  </script>`

const spaRoutes = async (req, res, url) => {
  if (url.pathname === '/spa/login' && req.method === 'GET') {
    return send(res, 200, page('SPA login', spaLoginPage))
  }
  if (url.pathname === '/spa/api/login' && req.method === 'POST') {
    const { email, password } = await parseBody(req)
    bump(`spa-login:${email}`)
    if (!checkPassword(email, password)) {
      return send(res, 401, { error: 'invalid_login' })
    }
    const q = url.searchParams
    const claims = { sub: email, iat: now() }
    if (q.get('noexp') !== '1') {
      claims.exp = now() + parseInt(q.get('ttl') || '3600', 10)
    }
    if (q.get('aud')) {
      const aud = q.get('aud').split(',')
      claims.aud = aud.length === 1 ? aud[0] : aud
    }
    return send(res, 200, { token: makeJwt(claims) })
  }
  if (url.pathname === '/spa/api/me') {
    const auth = req.headers.authorization || ''
    const claims = auth.startsWith('Bearer ') && verifyJwt(auth.slice(7))
    if (!claims) return send(res, 401, { error: 'unauthorized' })
    return send(res, 200, claims)
  }
  if (url.pathname === '/spa/api/legacy') {
    return send(res, 200, { ok: true })
  }
  return null
}

// ---------------------------------------------------------------- /oauth/*

const issueTokens = (clientId, userid, scope) => {
  const client = clients[clientId]
  const claims = {
    sub: userid,
    iat: now(),
    exp: now() + client.accessTtl,
    aud: clientId,
    azp: clientId,
  }
  if (scope) claims.scope = scope
  const resp = {
    access_token: makeJwt(claims),
    token_type: 'Bearer',
    expires_in: client.accessTtl,
  }
  if (client.refreshTtl) {
    const rt = `refresh-${randomId()}`
    refreshTokens.set(rt, { clientId, userid, scope })
    resp.refresh_token = rt
    resp.refresh_expires_in = client.refreshTtl
  }
  return resp
}

const oauthError = (res, error, description, status = 400) =>
  send(res, status, { error, error_description: description })

const oauthRoutes = async (req, res, url, baseUrl) => {
  if (url.pathname === '/oauth/device/code' && req.method === 'POST') {
    const { client_id: clientId } = await parseBody(req)
    bump(`device-code:${clientId}`)
    if (!clients[clientId]) {
      return oauthError(res, 'invalid_client', 'unknown client', 401)
    }
    const deviceCode = `dc-${randomId()}`
    const userCode = randomId(3).toUpperCase()
    deviceCodes.set(deviceCode, { userCode, clientId, approvedFor: null })
    return send(res, 200, {
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${baseUrl}/oauth/activate`,
      activation_url: `${baseUrl}/oauth/activate`,
      expires_in: 600,
      interval: 1,
    })
  }
  if (url.pathname === '/oauth/activate' && req.method === 'GET') {
    const code = url.searchParams.get('code') || ''
    return send(
      res,
      200,
      page(
        'Activate device',
        loginForm(
          '/oauth/activate',
          `<label for="code">Code</label><input id="code" name="code" value="${
            escapeHtml(code)
          }">`,
          'Approve',
        ),
      ),
    )
  }
  if (url.pathname === '/oauth/activate' && req.method === 'POST') {
    const { code, email, password } = await parseBody(req)
    bump(`device-activate:${email}`)
    if (!checkPassword(email, password)) {
      return send(
        res,
        401,
        page('Invalid login', '<p>Bad email or password</p>'),
      )
    }
    const entry = [...deviceCodes.values()].find((dc) => dc.userCode === code)
    if (!entry) {
      return send(res, 400, page('Unknown code', '<p>No such code</p>'))
    }
    entry.approvedFor = email
    return send(
      res,
      200,
      page('Device approved', '<p>You can close this window</p>'),
    )
  }
  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const body = await parseBody(req)
    const clientId = body.client_id
    bump(`token:${body.grant_type}`)
    if (!clients[clientId]) {
      return oauthError(res, 'invalid_client', 'unknown client', 401)
    }
    if (body.grant_type === 'password') {
      bump(`token:password:${body.username}`)
      if (!checkPassword(body.username, body.password)) {
        return oauthError(
          res,
          'invalid_grant',
          'Invalid user credentials',
          401,
        )
      }
      return send(res, 200, issueTokens(clientId, body.username, body.scope))
    }
    if (body.grant_type === 'refresh_token') {
      const rt = refreshTokens.get(body.refresh_token)
      if (!rt || rt.clientId !== clientId) {
        return oauthError(res, 'invalid_grant', 'Invalid refresh token')
      }
      bump(`token:refresh_token:${rt.userid}`)
      refreshTokens.delete(body.refresh_token) // rotate
      return send(res, 200, issueTokens(clientId, rt.userid, rt.scope))
    }
    if (body.grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
      const dc = deviceCodes.get(body.device_code)
      if (!dc || dc.clientId !== clientId) {
        return oauthError(res, 'invalid_grant', 'unknown device code')
      }
      if (!dc.approvedFor) {
        return oauthError(res, 'authorization_pending', 'not approved yet')
      }
      deviceCodes.delete(body.device_code)
      bump(`token:device_code:${dc.approvedFor}`)
      return send(res, 200, issueTokens(clientId, dc.approvedFor))
    }
    return oauthError(res, 'unsupported_grant_type', String(body.grant_type))
  }
  return null
}

// ---------------------------------------------------------------- /__*

const controlRoutes = (req, res, url) => {
  if (url.pathname === '/__stats') {
    return send(res, 200, stats)
  }
  if (url.pathname === '/__reset' && req.method === 'POST') {
    stats = {}
    return send(res, 200, { ok: true })
  }
  if (url.pathname === '/__revoke-refresh-tokens' && req.method === 'POST') {
    refreshTokens.clear()
    return send(res, 200, { ok: true })
  }
  return null
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2)
const portArgIdx = args.indexOf('--port')
const port = portArgIdx >= 0 ? parseInt(args[portArgIdx + 1], 10) : 0

const server = http.createServer(async (req, res) => {
  const baseUrl = `http://${req.headers.host}`
  const url = new URL(req.url, baseUrl)
  try {
    const handled = controlRoutes(req, res, url) ??
      (await cookieRoutes(req, res, url)) ??
      (await spaRoutes(req, res, url)) ??
      (await oauthRoutes(req, res, url, baseUrl))
    if (handled === null) send(res, 404, page('Not found', ''))
  } catch (err) {
    console.error(err)
    send(res, 500, { error: String(err) })
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`LISTENING http://127.0.0.1:${server.address().port}`)
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

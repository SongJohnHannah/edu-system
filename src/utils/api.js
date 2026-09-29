const API_BASE = '/edusystem/api'
export const apiUrl = path => `${API_BASE}${path}`

function getAccessToken() {
  return localStorage.getItem('access_token')
}

function getRefreshToken() {
  return localStorage.getItem('refresh_token')
}

function setTokens(access, refresh) {
  localStorage.setItem('access_token', access)
  if (refresh) localStorage.setItem('refresh_token', refresh)
}

function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user')
}

let refreshPending = null
function refreshAccessToken() {
  if (!refreshPending) refreshPending = refreshOnce().finally(() => { refreshPending = null })
  return refreshPending
}
async function refreshOnce() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(apiUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal
    })
    if (!response.ok) return false
    const data = await response.json()
    setTokens(data.accessToken)
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function request(method, path, data = null) {
  window.dispatchEvent(new Event('api-loading-start'))
  try {
    const headers = { 'Content-Type': 'application/json' }
    const accessToken = getAccessToken()
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const options = { method, headers, cache: 'no-store' }
    if (data && method !== 'GET') {
      options.body = JSON.stringify(data)
    }

    const send = async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)
      try { return await fetch(apiUrl(path), { ...options, signal: controller.signal }) }
      finally { clearTimeout(timeout) }
    }
    let response = await send()

    if (response.status === 401 && !['/auth/login', '/auth/refresh'].includes(path) && getRefreshToken()) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        headers['Authorization'] = `Bearer ${getAccessToken()}`
        response = await send()
      } else {
        clearTokens()
        window.location.href = '/login'
        throw new Error('登录已过期，请重新登录')
      }
    }

    if (response.status === 401) {
      clearTokens()
      if (window.location.pathname !== '/login') window.location.href = '/login'
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }))
      const message = error.details?.length ? `${error.error}：\n${error.details.map(d => `${d.date} ${d.time} · ${d.student} · ${d.teacher}`).join('\n')}` : error.error || error.message || '请求失败'
      throw Object.assign(new Error(message), { status: response.status, details: error.details })
    }

    return response.json()
  } finally {
    window.dispatchEvent(new Event('api-loading-end'))
  }
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, data) => request('POST', path, data),
  put: (path, data) => request('PUT', path, data),
  del: (path) => request('DELETE', path),
  tryRefresh: refreshAccessToken
}

export { setTokens, clearTokens, getAccessToken, getRefreshToken }

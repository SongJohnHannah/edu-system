const API_BASE = '/edusystem/api'

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
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
    if (!response.ok) return false
    const data = await response.json()
    setTokens(data.accessToken)
    return true
  } catch {
    return false
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

    let response = await fetch(`${API_BASE}${path}`, options)

    if (response.status === 401 && getRefreshToken()) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        headers['Authorization'] = `Bearer ${getAccessToken()}`
        response = await fetch(`${API_BASE}${path}`, options)
      } else {
        clearTokens()
        window.location.href = '/login'
        throw new Error('登录已过期，请重新登录')
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '请求失败' }))
      throw new Error(error.error || error.message || '请求失败')
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

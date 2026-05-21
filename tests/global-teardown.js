async function globalTeardown() {
  try {
    const loginRes = await fetch('http://localhost:3001/edusystem/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    })
    const { accessToken } = await loginRes.json()
    if (!accessToken) return

    await fetch('http://localhost:3001/edusystem/api/admin/test-data', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {}
}

export default globalTeardown

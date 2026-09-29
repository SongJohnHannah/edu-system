const lockName = 'edu-system-teacher-identity'

export async function acquireTeacherIdentityLock(conn) {
  const [rows] = await conn.execute(`SELECT GET_LOCK('${lockName}', 5) AS acquired`)
  if (rows[0]?.acquired !== 1) {
    throw Object.assign(new Error('教师资料正由其他人修改，请稍后重试'), { status: 409 })
  }
}

export async function closeTeacherIdentityConnection(conn, locked) {
  let discard = false
  if (locked) {
    try {
      const [rows] = await conn.execute(`SELECT RELEASE_LOCK('${lockName}') AS released`)
      if (rows[0]?.released !== 1) discard = true
    } catch { discard = true }
  }
  if (discard) {
    try { conn.destroy() } catch { /* The connection is already unusable. */ }
  } else {
    try { conn.release() } catch { try { conn.destroy() } catch { /* The connection is already unusable. */ } }
  }
}

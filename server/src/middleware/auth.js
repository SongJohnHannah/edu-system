import pool from '../config/database.js'
import { credentialVersion } from '../services/authService.js'
import jwt from 'jsonwebtoken'
import authConfig from '../config/auth.js'

export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, authConfig.secret)
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ? AND is_active = TRUE', [decoded.id])
    const user = rows[0]
    if (!user || decoded.kind !== 'access' || decoded.credential !== credentialVersion(user)) return res.status(401).json({ error: '登录已失效，请重新登录' })
    req.user = {
      id: decoded.id,
      username: user.username,
      role: user.role,
      teacherId: user.teacher_id
    }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' })
    }
    return res.status(401).json({ error: '无效的登录凭证' })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' })
    }
    next()
  }
}

export function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next)
}

export function filterByTeacher(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '未登录' })
  if (req.user.role === 'admin') {
    req.teacherScope = null
  } else if (req.user.role === 'teacher') {
    req.teacherScope = req.user.teacherId
  } else {
    return res.status(403).json({ error: '未知角色' })
  }
  next()
}

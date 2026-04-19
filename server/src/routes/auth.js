import { Router } from 'express'
import { verifyToken } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/rbac.js'
import * as authService from '../services/authService.js'

const router = Router()

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' })
    }
    const result = await authService.login(username, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      return res.status(400).json({ error: '缺少 refreshToken' })
    }
    const result = await authService.refreshAccessToken(refreshToken)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// 获取当前用户资料
router.get('/profile', verifyToken, async (req, res, next) => {
  try {
    const profile = await authService.getUserProfile(req.user.id)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

// 更新自己的资料
router.put('/profile', verifyToken, async (req, res, next) => {
  try {
    const { displayName } = req.body
    await authService.updateProfile(req.user.id, { displayName })

    // 返回更新后的 profile
    const profile = await authService.getUserProfile(req.user.id)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

// 修改自己的密码
router.put('/password', verifyToken, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' })
    }
    await authService.changePassword(req.user.id, oldPassword, newPassword)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// 管理员：重置教师密码
router.put('/users/:id/password', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' })
    }
    await authService.resetPassword(req.params.id, newPassword)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// 管理员：编辑教师用户信息
router.put('/users/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { displayName, phone } = req.body
    await authService.updateUserByAdmin(req.params.id, { displayName, phone })

    const profile = await authService.getUserProfile(req.params.id)
    res.json(profile)
  } catch (err) {
    next(err)
  }
})

export default router

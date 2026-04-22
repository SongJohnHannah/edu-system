import { Router } from 'express'
import { requireAdmin } from '../middleware/rbac.js'
import * as handoverService from '../services/handoverService.js'

const router = Router()

// 获取交接记录
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { courseId } = req.query
    const data = await handoverService.getHandoverHistory({ courseId })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// 执行交接
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { courseId, newTeacherId, reason } = req.body
    if (!courseId || !newTeacherId) {
      return res.status(400).json({ error: '缺少必要参数' })
    }
    const result = await handoverService.performHandover({
      courseId,
      newTeacherId,
      performedBy: req.user.username,
      reason
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router

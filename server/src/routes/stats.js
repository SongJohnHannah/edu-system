import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as statsService from '../services/statsService.js'

const router = Router()

router.get('/teachers', filterByTeacher, async (req, res, next) => {
  try {
    const { start, end } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: '请提供 start 和 end 日期参数' })
    }
    const stats = await statsService.getTeacherStats(start, end, req.teacherScope)
    res.json(stats)
  } catch (err) { next(err) }
})

router.get('/weekday-distribution', filterByTeacher, async (req, res, next) => {
  try {
    const distribution = await statsService.getWeekdayDistribution(req.teacherScope)
    res.json(distribution)
  } catch (err) { next(err) }
})

router.get('/overall', filterByTeacher, async (req, res, next) => {
  try {
    const { start, end } = req.query
    if (!start || !end) {
      return res.status(400).json({ error: '请提供 start 和 end 日期参数' })
    }
    const stats = await statsService.getOverallStats(start, end, req.teacherScope)
    res.json(stats)
  } catch (err) { next(err) }
})

export default router

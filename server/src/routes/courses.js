import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as courseService from '../services/courseService.js'
import * as studentService from '../services/studentService.js'

const router = Router()

// 必须在 '/:id' 路由之前定义，否则会被吞掉
router.get('/effective', filterByTeacher, async (req, res, next) => {
  try {
    const weekStart = req.query.weekStart
    if (!weekStart) return res.status(400).json({ error: '缺少 weekStart 参数' })
    const slots = await courseService.getEffectiveForWeek(weekStart)
    res.json(slots)
  } catch (err) { next(err) }
})

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const courses = await courseService.getAll(req.teacherScope)
    res.json(courses)
  } catch (err) { next(err) }
})

router.get('/:id/history', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    const history = await courseService.getHistory(req.params.id)
    res.json(history)
  } catch (err) { next(err) }
})

router.get('/:id/temp', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    const temp = await courseService.getCurrentTempSchedule(req.params.id, req.query.weekStart)
    res.json(temp)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    if (req.teacherScope && req.body.teacherId !== req.teacherScope) {
      return res.status(403).json({ error: '只能创建属于自己的课程' })
    }
    await studentService.validateStudentsForCourse(req.body.studentIds, req.teacherScope)
    req.body.createdBy = req.user?.id || null
    const course = await courseService.create(req.body)
    res.status(201).json(course)
  } catch (err) { next(err) }
})

router.put('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    if (req.teacherScope && req.body.teacherId && req.body.teacherId !== req.teacherScope) {
      return res.status(403).json({ error: '教师不能转让课程，请使用课程交接功能' })
    }
    await studentService.validateStudentsForCourse(req.body.studentIds, req.teacherScope, req.params.id)
    req.body.createdBy = req.user?.id || null
    const course = await courseService.update(req.params.id, req.body)
    res.json(course)
  } catch (err) { next(err) }
})

// 软删除：保留 course_schedule / course_history
router.delete('/:id/status', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    await courseService.softDelete(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.delete('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    await courseService.remove(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
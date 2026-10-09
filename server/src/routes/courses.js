import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as courseService from '../services/courseService.js'
import * as studentService from '../services/studentService.js'
import * as scheduleService from '../services/scheduleService.js'
import * as substitutionService from '../services/substitutionService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const courses = await courseService.getAll(req.teacherScope, req.query.includeArchived === '1')
    res.json(courses)
  } catch (err) { next(err) }
})

router.get('/occurrences', filterByTeacher, async (req, res, next) => {
  try {
    res.json(await scheduleService.listOccurrences(req.query.start, req.query.end))
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    if (typeof req.body.name !== 'string' || !req.body.name.trim() || !req.body.teacherId || !Array.isArray(req.body.studentIds) || !req.body.studentIds.length) {
      return res.status(400).json({ error: '请填写课程名称、教师和正式学生' })
    }
    if (req.teacherScope && req.body.teacherId !== req.teacherScope) {
      return res.status(403).json({ error: '只能创建属于自己的课程' })
    }
    await studentService.validateStudentsForCourse(req.body.studentIds, req.teacherScope)
    const course = await courseService.create(req.body)
    res.status(201).json(course)
  } catch (err) { next(err) }
})

router.post('/reschedule-day', filterByTeacher, async (req, res, next) => {
  try { res.json(await scheduleService.rescheduleDay(req.body, req.teacherScope)) }
  catch (err) { next(err) }
})

router.put('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    if (req.teacherScope && req.body.teacherId && req.body.teacherId !== req.teacherScope) {
      return res.status(403).json({ error: '教师不能转让课程，请使用课程交接功能' })
    }
    await studentService.validateStudentsForCourse(req.body.studentIds, req.teacherScope, req.params.id)
    const course = await courseService.update(req.params.id, req.body, req.teacherScope)
    res.json(course)
  } catch (err) { next(err) }
})

router.post('/:id/reschedule', filterByTeacher, async (req, res, next) => {
  try {
    res.json(await scheduleService.reschedule(req.params.id, req.body, req.teacherScope))
  } catch (err) { next(err) }
})

router.post('/:id/substitution', filterByTeacher, async (req, res, next) => {
  try { res.json(await substitutionService.arrange(req.params.id, req.body, req.teacherScope, req.user)) }
  catch (err) { next(err) }
})

router.delete('/:id/substitution/:originalDate', filterByTeacher, async (req, res, next) => {
  try { res.json(await substitutionService.cancel(req.params.id, req.params.originalDate, req.teacherScope, req.user)) }
  catch (err) { next(err) }
})

router.delete('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await courseService.verifyAccess(req.params.id, req.teacherScope)
    await courseService.remove(req.params.id, req.teacherScope)
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.get('/:id/adjustments', filterByTeacher, async (req, res, next) => {
  try {
    const adjustments = await scheduleService.getAdjustments(req.params.id)
    res.json({ ...adjustments, course: await courseService.getById(req.params.id) })
  } catch (err) { next(err) }
})
router.delete('/:id/adjustments/:kind/:adjustmentId', filterByTeacher, async (req, res, next) => {
  try { res.json(await scheduleService.removeAdjustment(req.params.id, req.params.kind, req.params.adjustmentId, req.teacherScope)) } catch (err) { next(err) }
})
export default router

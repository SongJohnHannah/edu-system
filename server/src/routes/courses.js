import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as courseService from '../services/courseService.js'
import * as studentService from '../services/studentService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const courses = await courseService.getAll(req.teacherScope)
    res.json(courses)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    if (req.teacherScope && req.body.teacherId !== req.teacherScope) {
      return res.status(403).json({ error: '只能创建属于自己的课程' })
    }
    await studentService.validateStudentsForCourse(req.body.studentIds, req.teacherScope)
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
    const course = await courseService.update(req.params.id, req.body)
    res.json(course)
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

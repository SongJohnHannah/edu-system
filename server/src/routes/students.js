import { Router } from 'express'
import { filterByTeacher, requireAdmin } from '../middleware/rbac.js'
import * as studentService from '../services/studentService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const students = await studentService.getAll(req.teacherScope)
    res.json(students)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    const data = {
      ...req.body,
      createdBy: req.user.role === 'admin' ? 'admin' : 'teacher',
      creatorId: req.user.role === 'admin' ? null : req.user.teacherId
    }
    const student = await studentService.create(data)
    res.status(201).json(student)
  } catch (err) { next(err) }
})

router.put('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await studentService.verifyAccess(req.params.id, req.teacherScope)
    const student = await studentService.update(req.params.id, req.body)
    res.json(student)
  } catch (err) { next(err) }
})

router.delete('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await studentService.verifyAccess(req.params.id, req.teacherScope)
    await studentService.remove(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.get('/check-name', filterByTeacher, async (req, res, next) => {
  try {
    const { name, excludeId } = req.query
    const exists = await studentService.checkNameExists(name, excludeId)
    res.json({ exists })
  } catch (err) { next(err) }
})

router.put('/:id/status', filterByTeacher, async (req, res, next) => {
  try {
    await studentService.verifyAccess(req.params.id, req.teacherScope)
    const student = await studentService.updateStatus(req.params.id, req.body.status)
    res.json(student)
  } catch (err) { next(err) }
})

router.post('/:id/add-hours', filterByTeacher, async (req, res, next) => {
  try {
    await studentService.verifyAccess(req.params.id, req.teacherScope)
    const student = await studentService.addHours(
      req.params.id, req.body.hours, req.body.remark, req.user.username
    )
    res.json(student)
  } catch (err) { next(err) }
})

router.post('/:id/subtract-hours', filterByTeacher, async (req, res, next) => {
  try {
    await studentService.verifyAccess(req.params.id, req.teacherScope)
    const student = await studentService.subtractHours(
      req.params.id, req.body.hours, req.body.remark, req.user.username
    )
    res.json(student)
  } catch (err) { next(err) }
})

router.post('/batch', filterByTeacher, async (req, res, next) => {
  try {
    const createdBy = req.user.role === 'admin' ? 'admin' : 'teacher'
    const creatorId = req.user.role === 'admin' ? null : req.user.teacherId
    const result = await studentService.addBatch(req.body.students, req.body.defaultHours, createdBy, creatorId)
    res.json(result)
  } catch (err) { next(err) }
})

export default router

import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as attendanceService from '../services/attendanceService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const { limit, offset } = req.query
    const result = await attendanceService.getAll(req.teacherScope, { limit, offset })
    res.json(result)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    const record = await attendanceService.create(req.body, req.teacherScope, req.user)
    res.status(201).json(record)
  } catch (err) { next(err) }
})

router.delete('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await attendanceService.remove(req.params.id, req.teacherScope)
    res.json({ success: true })
  } catch (err) { next(err) }
})

router.post('/:id/remove-students', filterByTeacher, async (req, res, next) => {
  try {
    await attendanceService.removeStudents(req.params.id, req.body.studentIds, req.teacherScope)
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router

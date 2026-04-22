import { Router } from 'express'
import { filterByTeacher, requireAdmin } from '../middleware/rbac.js'
import * as teacherService from '../services/teacherService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const teachers = await teacherService.getAll(req.teacherScope)
    res.json(teachers)
  } catch (err) { next(err) }
})

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const teacher = await teacherService.create(req.body)
    res.status(201).json(teacher)
  } catch (err) { next(err) }
})

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const teacher = await teacherService.update(req.params.id, req.body)
    res.json(teacher)
  } catch (err) { next(err) }
})

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await teacherService.updateStatus(req.params.id, 'deleted')
    res.json(result?.[0] || { success: true })
  } catch (err) { next(err) }
})

router.put('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const result = await teacherService.updateStatus(req.params.id, req.body.status)
    res.json(result?.[0] || { success: true })
  } catch (err) { next(err) }
})

export default router

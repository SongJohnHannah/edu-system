import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as classService from '../services/classService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    const classes = await classService.getAll(req.teacherScope)
    res.json(classes)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, async (req, res, next) => {
  try {
    const cls = await classService.create(req.body)
    res.status(201).json(cls)
  } catch (err) { next(err) }
})

router.put('/:id', filterByTeacher, async (req, res, next) => {
  try {
    const cls = await classService.update(req.params.id, req.body)
    res.json(cls)
  } catch (err) { next(err) }
})

router.delete('/:id', filterByTeacher, async (req, res, next) => {
  try {
    await classService.remove(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router

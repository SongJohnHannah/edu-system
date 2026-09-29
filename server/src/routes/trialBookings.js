import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as service from '../services/trialBookingService.js'

const router = Router()
router.get('/', filterByTeacher, async (req, res, next) => {
  try { res.json(await service.getAll(req.query)) } catch (err) { next(err) }
})
router.post('/', filterByTeacher, async (req, res, next) => {
  try { res.status(201).json(await service.create(req.body, req.teacherScope)) } catch (err) { next(err) }
})
router.put('/:id', filterByTeacher, async (req, res, next) => {
  try { res.json(await service.update(req.params.id, req.body, req.teacherScope)) } catch (err) { next(err) }
})
router.post('/:id/cancel', filterByTeacher, async (req, res, next) => {
  try { res.json(await service.cancel(req.params.id, req.teacherScope)) } catch (err) { next(err) }
})
export default router

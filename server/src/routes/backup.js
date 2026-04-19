import { Router } from 'express'
import * as backupService from '../services/backupService.js'

const router = Router()

router.get('/export', async (req, res, next) => {
  try {
    const data = await backupService.exportData()
    res.json(data)
  } catch (err) { next(err) }
})

router.post('/import', async (req, res, next) => {
  try {
    const result = await backupService.importData(req.body.data || req.body)
    res.json(result)
  } catch (err) { next(err) }
})

export default router

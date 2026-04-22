import express from 'express'
import * as backupService from '../services/backupService.js'

const router = express.Router()

router.get('/export', async (req, res, next) => {
  try {
    const sql = await backupService.exportSQL()
    const timestamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="edu_backup_${timestamp}.sql"`)
    res.send(sql)
  } catch (err) { next(err) }
})

router.post('/import', async (req, res, next) => {
  try {
    const result = await backupService.importData(req.body.data || req.body)
    res.json(result)
  } catch (err) { next(err) }
})

router.post('/import-sql', express.text({ type: 'text/plain' }), async (req, res, next) => {
  try {
    const result = await backupService.importSQL(req.body)
    res.json(result)
  } catch (err) { next(err) }
})

export default router

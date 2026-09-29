import { Router } from 'express'
import { filterByTeacher } from '../middleware/rbac.js'
import * as hourRecordService from '../services/hourRecordService.js'

const router = Router()

router.get('/', filterByTeacher, async (req, res, next) => {
  try {
    if (req.query.studentId) {
      const { limit, offset } = req.query
      const result = await hourRecordService.getByStudent(req.query.studentId, req.teacherScope, { limit, offset })
      return res.json(result)
    }
    const records = await hourRecordService.getAll(req.teacherScope)
    res.json(records)
  } catch (err) { next(err) }
})

router.post('/', filterByTeacher, (_req, res) => {
  res.status(405).json({ error: '请通过学生课时操作或正式课程点名生成课时记录' })
})

export default router

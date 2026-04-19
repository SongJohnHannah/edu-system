export function errorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] Error:`, err.message)
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack)
  }
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误'
  })
}

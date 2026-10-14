const { join } = require('node:path')
const { realpathSync } = require('node:fs')

module.exports = {
  apps: [{
    name: 'edu-system',
    cwd: join(__dirname, 'server'),
    script: 'src/index.js',
    interpreter: realpathSync(process.execPath),
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    wait_ready: true,
    listen_timeout: 30000,
    kill_timeout: 10000,
    watch: false,
    max_memory_restart: '512M',
    out_file: join(__dirname, 'logs/out.log'),
    error_file: join(__dirname, 'logs/error.log'),
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: {
      NODE_ENV: 'production'
    }
  }]
}

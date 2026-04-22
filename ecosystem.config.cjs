module.exports = {
  apps: [{
    name: 'edu-system',
    cwd: './server',
    script: 'start.sh',
    interpreter: '/bin/bash',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    max_memory_restart: '512M',
    out_file: '/home/song/www/edu-system/logs/out.log',
    error_file: '/home/song/www/edu-system/logs/error.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: {
      NODE_ENV: 'production'
    }
  }]
}

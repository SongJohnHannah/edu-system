import dotenv from 'dotenv'

dotenv.config()

const secret = process.env.JWT_SECRET || 'default_secret_change_me'

if (secret === 'default_secret_change_me') {
  console.warn('[WARN] JWT_SECRET 未配置，正在使用默认密钥，请在 .env 中设置自定义密钥！')
}

export default {
  secret,
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
}

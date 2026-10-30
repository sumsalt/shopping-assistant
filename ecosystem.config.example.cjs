// PM2 配置示例：复制为 ecosystem.config.cjs 后填写 SMTP_PASS。
// 真实的 ecosystem.config.cjs 已被 .gitignore 忽略，只放在服务器上（chmod 600）。
module.exports = {
  apps: [
    {
      name: 'shopping-assistant',
      script: '.output/server/index.mjs',
      cwd: '/var/www/shopping-assistant',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.qq.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'sumsalt@qq.com',
        // QQ 邮箱 SMTP 授权码（不是登录密码）
        SMTP_PASS: '',
      },
    },
  ],
}

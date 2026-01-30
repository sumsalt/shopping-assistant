/**
 * 密码哈希生成脚本
 * 
 * 使用方法:
 * npx ts-node scripts/hashPassword.ts <password>
 * 
 * 或者在安装tsx后:
 * npx tsx scripts/hashPassword.ts <password>
 */

import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

const main = async () => {
  const password = process.argv[2]

  if (!password) {
    console.error('使用方法: npx tsx scripts/hashPassword.ts <password>')
    console.error('示例: npx tsx scripts/hashPassword.ts mypassword123')
    process.exit(1)
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    console.log('\n密码哈希生成成功!')
    console.log('=====================================')
    console.log('原始密码:', password)
    console.log('哈希密码:', hash)
    console.log('=====================================')
    console.log('\n请将上述哈希密码复制到 config/users.json 中的 password 字段')
  } catch (error) {
    console.error('哈希生成失败:', error)
    process.exit(1)
  }
}

main()

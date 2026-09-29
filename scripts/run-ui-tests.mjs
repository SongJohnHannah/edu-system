import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const endpoint = 'http://127.0.0.1:4174/'
try {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
} catch (error) {
  console.error(`先运行 npm run build 和 npm run preview -- --host 127.0.0.1 --port 4174：${error.message}`)
  process.exit(1)
}

const files = readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.ui.mjs')).sort()
const failed = []
for (const file of files) {
  console.log(`\n▶ ${file}`)
  const result = spawnSync(process.execPath, [path.join(root, 'tests', file)], {
    cwd: root,
    stdio: 'inherit',
    timeout: 120_000
  })
  if (result.status !== 0) failed.push(`${file}: ${result.error?.message || result.signal || `exit ${result.status}`}`)
}

if (failed.length) {
  console.error(`\n${failed.length}/${files.length} 个页面测试失败：\n${failed.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`\n${files.length} 个页面测试全部通过`)
}

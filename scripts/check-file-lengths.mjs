import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseline = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'line-limit-baseline.json'), 'utf8')))
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.css', '.scss', '.sql', '.md', '.json', '.html', '.yml', '.yaml', '.toml', '.xml', '.sh', '.ps1'])
const excludedDirectories = new Set(['.git', '.qa', 'node_modules', 'dist', 'release', 'coverage', 'test-results', 'playwright-report'])
const excludedFiles = new Set(['package-lock.json', 'pnpm-lock.yaml', 'edu_system_snapshot.sql'])
const failures = []

function checkFile(absolute) {
  const relative = path.relative(root, absolute).replaceAll('\\', '/')
  if (excludedFiles.has(path.basename(relative)) || !extensions.has(path.extname(relative).toLowerCase())) return
  const source = fs.readFileSync(absolute, 'utf8')
  const lines = source === '' ? 0 : source.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(source) ? 1 : 0)
  if (lines > 1800) failures.push(`${relative}: ${lines} 行，超过所有文件适用的 1800 行上限`)
  else if (!baseline.has(relative) && lines > 600) failures.push(`${relative}: ${lines} 行，新文件超过 600 行上限`)
}

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) scan(absolute)
    } else if (entry.isFile()) checkFile(absolute)
  }
}

scan(root)

if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log('文件行数检查通过：新文件 ≤ 600 行，所有文件 ≤ 1800 行')
}

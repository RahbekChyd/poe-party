import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const binName = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
const binPath = join(repoRoot, 'node_modules', 'supabase', 'bin', binName)

if (!existsSync(binPath)) {
  console.error('Supabase CLI binary was not found. Run `pnpm install` first.')
  process.exit(1)
}

const child = spawn(binPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})

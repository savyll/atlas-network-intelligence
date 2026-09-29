import { build } from 'esbuild'
import { spawn } from 'node:child_process'
await build({ entryPoints: ['tests/network.test.ts'], outfile: 'artifacts/network.test.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external' })
const child = spawn(process.execPath, ['--test', ...process.argv.slice(2), 'artifacts/network.test.mjs'], { stdio: 'inherit', windowsHide: true })
child.on('exit', code => { process.exitCode = code ?? 1 })

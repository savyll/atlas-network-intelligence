import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const timestamp = (): string => new Date().toISOString()
export const round = (value: number): number => Math.round(value * 100) / 100
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
export function windowsBinary(name: string): string { return join(process.env.SystemRoot || 'C:\\Windows', 'System32', name) }
export function abortError(): Error { return new Error('Diagnostic cancelled.') }
export function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError() }

export function bounded<T>(promise: Promise<T>, timeout: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (fn: () => void) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn() }
    const abort = () => finish(() => reject(abortError()))
    const timer = setTimeout(() => finish(() => reject(new Error('Operation timed out.'))), timeout)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
  })
}
export async function resolveTarget(target: string, signal?: AbortSignal): Promise<string> {
  checkAbort(signal)
  if (isIP(target)) return target
  const addresses = await bounded(lookup(target, { all: true }), 5000, signal)
  return (addresses.find(address => address.family === 4) ?? addresses[0]).address
}
export interface CommandResult { stdout: string; stderr: string; code: number | null; timedOut: boolean; cancelled: boolean }
/** Fixed executable + separate arguments. Never a shell; every native window is hidden. */
export function runCommand(file: string, args: string[], input: string, timeout: number, signal?: AbortSignal): Promise<CommandResult> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false, cancelled = false, overflow = false
    const stop = () => { cancelled = true; child.kill() }
    const timer = setTimeout(() => { timedOut = true; child.kill() }, timeout)
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop) }
    signal?.addEventListener('abort', stop, { once: true })
    if (signal?.aborted) stop()
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); if (stdout.length > 131072) { overflow = true; child.kill() } })
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-8192) })
    child.stdin.on('error', () => { /* Early process exit is handled by close/error. */ })
    child.on('error', error => { clean(); reject(error) })
    child.on('close', code => { clean(); if (overflow) reject(new Error('Native output exceeded the safe limit.')); else resolve({ stdout, stderr, code, timedOut, cancelled }) })
    child.stdin.end(input)
  })
}
export async function powershell(script: string, input: object, timeout: number, signal?: AbortSignal): Promise<unknown> {
  if (process.platform !== 'win32') throw new Error('This native diagnostic currently requires Windows.')
  const prefix = '$ErrorActionPreference="Stop"; $ProgressPreference="SilentlyContinue"; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); '
  const encoded = Buffer.from(prefix + script, 'utf16le').toString('base64')
  const result = await runCommand(windowsBinary('WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], JSON.stringify(input) + '\n', timeout, signal)
  if (result.cancelled) throw abortError()
  if (result.timedOut) throw new Error('Windows diagnostic timed out.')
  if (result.code !== 0) throw new Error('Windows could not execute this diagnostic. PowerShell or this OS capability may be restricted.')
  return JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()) as unknown
}

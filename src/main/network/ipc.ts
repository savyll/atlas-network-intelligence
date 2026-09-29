import { ipcMain, type IpcMainInvokeEvent, type BrowserWindow } from 'electron'
import { ping } from './ping'
import { dnsLookup } from './dns'
import { httpCheck } from './http'
import { traceroute } from './traceroute'
import { detectGateway } from './gateway'
import { runDiagnostic } from './diagnostics'
import { NetworkMonitor } from './monitor'
import { pingInput, requestId, requestInput } from './validation'

export function registerNetworkIPC(trusted: (event: IpcMainInvokeEvent) => BrowserWindow, getWindow: () => BrowserWindow | null) {
  const jobs = new Map<string, AbortController>()
  const monitor = new NetworkMonitor(snapshot => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('atlas:network:snapshot', snapshot)
  }, () => jobs.size > 0)
  async function job<T>(id: string, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (jobs.has(id)) throw new Error('This diagnostic is already running.')
    if (jobs.size >= 2) throw new Error('Two diagnostics are already running. Wait or cancel one first.')
    const controller = new AbortController(); jobs.set(id, controller)
    try { return await task(controller.signal) } finally { jobs.delete(id) }
  }
  ipcMain.handle('atlas:network:ping', (event, value: unknown) => { trusted(event); const request = pingInput(value); return job(request.requestId, signal => ping(request.target, request.count, signal)) })
  ipcMain.handle('atlas:network:dns', (event, value: unknown) => { trusted(event); const request = requestInput(value); return job(request.requestId, signal => dnsLookup(request.target, signal)) })
  ipcMain.handle('atlas:network:http', (event, value: unknown) => { trusted(event); const request = requestInput(value, true); return job(request.requestId, signal => httpCheck(request.target, signal)) })
  ipcMain.handle('atlas:network:traceroute', (event, value: unknown) => { trusted(event); const request = requestInput(value); return job(request.requestId, signal => traceroute(request.target, signal)) })
  ipcMain.handle('atlas:network:gateway', (event, value: unknown) => { trusted(event); return job(requestId(value), detectGateway) })
  ipcMain.handle('atlas:network:diagnose', (event, value: unknown) => { trusted(event); const id = requestId(value); return job(id, signal => runDiagnostic(signal, 6, undefined, stage => { if (!event.sender.isDestroyed()) event.sender.send('atlas:network:progress', { requestId: id, stage }) })) })
  ipcMain.handle('atlas:network:cancel', (event, value: unknown) => { trusted(event); const controller = jobs.get(requestId(value)); controller?.abort(); return Boolean(controller) })
  ipcMain.handle('atlas:network:start', event => { trusted(event); return monitor.start() })
  ipcMain.handle('atlas:network:get-snapshot', event => { trusted(event); return monitor.snapshot() })
  return { snapshot: () => monitor.snapshot(), job, stop: () => { monitor.stop(); for (const controller of jobs.values()) controller.abort() } }
}

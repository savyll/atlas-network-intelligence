import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { registerNetworkIPC } from '../network/ipc'
import { runDiagnostic } from '../network/diagnostics'
import { requestId } from '../network/validation'
import { timestamp } from '../network/native'
import type { DiagnosticStage, ServiceDiagnostic } from '../../shared/services'
import { serviceId } from './serviceRegistry'
import { ServiceMonitor } from './serviceMonitor'
import { classify } from './classification'

export function registerServicesIPC(trusted: (event: IpcMainInvokeEvent) => BrowserWindow, getWindow: () => BrowserWindow | null, network: ReturnType<typeof registerNetworkIPC>) {
  const jobs = new Map<string, AbortController>()
  const monitor = new ServiceMonitor(snapshot => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('atlas:services:snapshot', snapshot)
  }, network.snapshot)
  ipcMain.handle('atlas:services:list', event => { trusted(event); return monitor.snapshot() })
  ipcMain.handle('atlas:services:get', (event, id: unknown) => { trusted(event); return monitor.get(serviceId(id)) })
  ipcMain.handle('atlas:services:add', (event, input: unknown) => { trusted(event); return monitor.add(input) })
  ipcMain.handle('atlas:services:remove', (event, id: unknown) => { trusted(event); monitor.remove(serviceId(id)) })
  ipcMain.handle('atlas:services:check', (event, id: unknown) => { trusted(event); return monitor.check(serviceId(id)) })
  ipcMain.handle('atlas:services:start', event => { trusted(event); return monitor.start() })
  ipcMain.handle('atlas:services:stop', event => { trusted(event); monitor.stop() })
  ipcMain.handle('atlas:services:cancel', (event, id: unknown) => { trusted(event); const job = jobs.get(requestId(id)); job?.abort(); return Boolean(job) })
  ipcMain.handle('atlas:services:diagnose', async (event, input: unknown): Promise<ServiceDiagnostic> => {
    trusted(event)
    if (!input || typeof input !== 'object' || !('id' in input) || !('requestId' in input)) throw new Error('Provide a service and request identifier.')
    const id = serviceId(input.id), jobId = requestId(input.requestId)
    monitor.get(id)
    if (jobs.size) throw new Error('A service diagnostic is already running.')
    const controller = new AbortController(); jobs.set(jobId, controller)
    const progress = (stage: DiagnosticStage) => { if (!event.sender.isDestroyed()) event.sender.send('atlas:services:progress', { requestId: jobId, stage }) }
    try {
      // Share the native job limit with Stage 2 so user requests cannot spawn unbounded probes.
      return await network.job(jobId, async networkSignal => {
        const abort = () => controller.abort(); networkSignal.addEventListener('abort', abort, { once: true })
        try {
          const result = await runDiagnostic(controller.signal, 4, undefined, stage => { if (stage !== 'ATLAS Conclusion') progress(stage) })
          progress('Service Endpoint')
          const service = await monitor.check(id, controller.signal, progress)
          progress('Official Status')
          progress('ATLAS Conclusion')
          const evaluated = { ...service, classification: classify(service, { updatedAt: result.timestamp, latest: result }, 0) }
          return { service: evaluated, network: result, timestamp: timestamp(), cancelled: controller.signal.aborted }
        } finally { networkSignal.removeEventListener('abort', abort) }
      })
    } finally { jobs.delete(jobId) }
  })
  return { stop: () => { monitor.stop(); for (const job of jobs.values()) job.abort() } }
}

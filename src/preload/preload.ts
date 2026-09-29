import { contextBridge, ipcRenderer } from 'electron'
import type { AtlasDesktop } from '../shared/desktop'
import type { MonitorSnapshot } from '../shared/network'
import type { DiagnosticProgress, ServicesSnapshot } from '../shared/services'

function progressListener(channel: string, callback: (progress: DiagnosticProgress) => void) {
  const listener = (_event: Electron.IpcRendererEvent, progress: DiagnosticProgress) => callback(progress)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: AtlasDesktop = {
  network: {
    onProgress: callback => progressListener('atlas:network:progress', callback),
    ping: request => ipcRenderer.invoke('atlas:network:ping', request),
    dns: request => ipcRenderer.invoke('atlas:network:dns', request),
    http: request => ipcRenderer.invoke('atlas:network:http', request),
    traceroute: request => ipcRenderer.invoke('atlas:network:traceroute', request),
    gateway: id => ipcRenderer.invoke('atlas:network:gateway', id),
    diagnose: id => ipcRenderer.invoke('atlas:network:diagnose', id),
    cancel: id => ipcRenderer.invoke('atlas:network:cancel', id),
    startMonitoring: () => ipcRenderer.invoke('atlas:network:start'),
    getSnapshot: () => ipcRenderer.invoke('atlas:network:get-snapshot'),
    onSnapshot: callback => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: MonitorSnapshot) => callback(snapshot)
      ipcRenderer.on('atlas:network:snapshot', listener)
      return () => ipcRenderer.removeListener('atlas:network:snapshot', listener)
    }
  },
  services: {
    list: () => ipcRenderer.invoke('atlas:services:list'),
    get: id => ipcRenderer.invoke('atlas:services:get', id),
    add: input => ipcRenderer.invoke('atlas:services:add', input),
    remove: id => ipcRenderer.invoke('atlas:services:remove', id),
    check: id => ipcRenderer.invoke('atlas:services:check', id),
    diagnose: input => ipcRenderer.invoke('atlas:services:diagnose', input),
    cancel: id => ipcRenderer.invoke('atlas:services:cancel', id),
    start: () => ipcRenderer.invoke('atlas:services:start'),
    stop: () => ipcRenderer.invoke('atlas:services:stop'),
    onProgress: callback => progressListener('atlas:services:progress', callback),
    onSnapshot: callback => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: ServicesSnapshot) => callback(snapshot)
      ipcRenderer.on('atlas:services:snapshot', listener)
      return () => ipcRenderer.removeListener('atlas:services:snapshot', listener)
    }
  },
  getAppInfo: () => ipcRenderer.invoke('atlas:app-info'),
  minimize: () => ipcRenderer.invoke('atlas:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('atlas:toggle-maximize'),
  close: () => ipcRenderer.invoke('atlas:close'),
  onMaximizedChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on('atlas:maximized-change', listener)
    return () => ipcRenderer.removeListener('atlas:maximized-change', listener)
  }
}
contextBridge.exposeInMainWorld('atlas', api)

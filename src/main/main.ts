import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerNetworkIPC } from './network/ipc'
import { registerServicesIPC } from './services/ipc'

let mainWindow: BrowserWindow | null = null
let network: ReturnType<typeof registerNetworkIPC> | undefined
let services: ReturnType<typeof registerServicesIPC> | undefined
const rendererFile = join(__dirname, '../renderer/index.html')
const developmentURL = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined

function assertTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const window = mainWindow
  const frame = event.senderFrame
  const expected = new URL(developmentURL ?? pathToFileURL(rendererFile).href).href
  if (!window || event.sender !== window.webContents || frame !== event.sender.mainFrame || frame.url !== expected) {
    throw new Error('Untrusted IPC sender')
  }
  return window
}

function registerIPC(): void {
  ipcMain.handle('atlas:app-info', (event) => {
    assertTrustedSender(event)
    return { version: app.getVersion(), platform: process.platform, mode: 'live' }
  })
  ipcMain.handle('atlas:minimize', (event) => assertTrustedSender(event).minimize())
  ipcMain.handle('atlas:toggle-maximize', (event) => {
    const window = assertTrustedSender(event)
    window.isMaximized() ? window.unmaximize() : window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle('atlas:close', (event) => assertTrustedSender(event).close())
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1060, minHeight: 720,
    title: 'ATLAS — Network Intelligence', backgroundColor: '#14191d',
    frame: false, show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, spellcheck: false,
      // In-memory session only. No application history is persisted.
      partition: 'atlas-stage-one'
    }
  })
  mainWindow = window
  window.setMenu(null)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  const notifyMaximized = (): void => window.webContents.send('atlas:maximized-change', window.isMaximized())
  window.on('maximize', notifyMaximized)
  window.on('unmaximize', notifyMaximized)
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => { network?.stop(); services?.stop(); mainWindow = null })
  window.webContents.on('render-process-gone', () => { network?.stop(); services?.stop() })
  if (developmentURL) void window.loadURL(developmentURL)
  else void window.loadFile(rendererFile)
}

app.whenReady().then(() => {
  const isolatedSession = session.fromPartition('atlas-stage-one')
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  isolatedSession.setPermissionCheckHandler(() => false)
  // Vite's dev refresh requires inline bootstrap code; the production CSP does not.
  const scriptPolicy = developmentURL ? "'self' 'unsafe-inline'" : "'self'"
  const connectionPolicy = developmentURL ? `${new URL(developmentURL).origin} ws://127.0.0.1:5173` : "'none'"
  isolatedSession.webRequest.onHeadersReceived((details, callback) => callback({
    responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [
      `default-src 'self'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connectionPolicy}; object-src 'none'; base-uri 'none'; form-action 'none'`
    ] }
  }))
  registerIPC()
  network = registerNetworkIPC(assertTrustedSender, () => mainWindow)
  services = registerServicesIPC(assertTrustedSender, () => mainWindow, network)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { network?.stop(); services?.stop() })

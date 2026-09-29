import type { NetworkAPI } from './network'
import type { ServicesAPI } from './services'
/** Explicit, minimal bridge. No generic IPC or command execution. */
export interface AtlasDesktop {
  getAppInfo: () => Promise<{ version: string; platform: string; mode: 'live' }>
  network: NetworkAPI
  services: ServicesAPI
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void
}

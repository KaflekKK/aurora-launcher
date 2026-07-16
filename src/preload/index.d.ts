import type { ElectronAPI } from '@electron-toolkit/preload'

interface JavaInfo {
  installed: boolean
  version: string | null
  fullVersion: string | null
  vendor: string | null
  path: string | null
  architecture: string
  error: string | null
}

interface AuroraAPI {
  getJavaInfo: () => Promise<JavaInfo>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AuroraAPI
  }
}

export {}
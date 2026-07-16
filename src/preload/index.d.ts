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

interface MinecraftVersionInfo {
  available: boolean
  id: string
  type: string | null
  releaseTime: string | null
  metadataUrl: string | null
  latestRelease: string | null
  error: string | null
}

interface AuroraAPI {
  getJavaInfo: () => Promise<JavaInfo>

  checkMinecraftVersion: (
    versionId: string,
    forceRefresh?: boolean
  ) => Promise<MinecraftVersionInfo>

  getDefaultGameDirectory: () => Promise<string>

  chooseGameDirectory: (
    currentPath: string | null
  ) => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AuroraAPI
  }
}

export {}
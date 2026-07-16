import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

interface MinecraftVersionDetails {
  available: boolean
  id: string
  type: string | null
  releaseTime: string | null
  javaMajorVersion: number | null
  javaComponent: string | null
  mainClass: string | null
  minimumLauncherVersion: number | null
  clientUrl: string | null
  clientSha1: string | null
  clientSize: number | null
  assetIndexId: string | null
  assetIndexUrl: string | null
  assetIndexSha1: string | null
  assetIndexSize: number | null
  assetTotalSize: number | null
  libraryCount: number
  gameArgumentCount: number
  jvmArgumentCount: number
  error: string | null
}

type InstallPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'error'

interface MinecraftInstallProgress {
  versionId: string
  phase: InstallPhase
  downloadedBytes: number
  totalBytes: number
  percent: number
  message: string
}

interface MinecraftInstallStatus {
  versionId: string
  installed: boolean
  valid: boolean
  jarPath: string | null
  currentSize: number | null
  expectedSize: number | null
  currentSha1: string | null
  expectedSha1: string | null
  error: string | null
}

interface MinecraftInstallResult {
  success: boolean
  alreadyInstalled: boolean
  versionId: string
  jarPath: string | null
  error: string | null
}

interface AuroraAPI {
  getJavaInfo: () => Promise<JavaInfo>

  checkMinecraftVersion: (
    versionId: string,
    forceRefresh?: boolean
  ) => Promise<MinecraftVersionInfo>

  getMinecraftVersionDetails: (
    versionId: string,
    forceRefresh?: boolean
  ) => Promise<MinecraftVersionDetails>

  getMinecraftInstallStatus: (
    versionId: string,
    gameDirectory: string
  ) => Promise<MinecraftInstallStatus>

  installMinecraftClient: (
    versionId: string,
    gameDirectory: string
  ) => Promise<MinecraftInstallResult>

  onInstallProgress: (
    callback: (progress: MinecraftInstallProgress) => void
  ) => void

  removeInstallProgressListener: () => void

  getDefaultGameDirectory: () => Promise<string>

  chooseGameDirectory: (
    currentPath: string | null
  ) => Promise<string | null>
}

const api: AuroraAPI = {
  getJavaInfo: async (): Promise<JavaInfo> => {
    return ipcRenderer.invoke('java:get-info') as Promise<JavaInfo>
  },

  checkMinecraftVersion: async (
    versionId: string,
    forceRefresh = false
  ): Promise<MinecraftVersionInfo> => {
    return ipcRenderer.invoke(
      'minecraft:check-version',
      versionId,
      forceRefresh
    ) as Promise<MinecraftVersionInfo>
  },

  getMinecraftVersionDetails: async (
    versionId: string,
    forceRefresh = false
  ): Promise<MinecraftVersionDetails> => {
    return ipcRenderer.invoke(
      'minecraft:get-version-details',
      versionId,
      forceRefresh
    ) as Promise<MinecraftVersionDetails>
  },

  getMinecraftInstallStatus: async (
    versionId: string,
    gameDirectory: string
  ): Promise<MinecraftInstallStatus> => {
    return ipcRenderer.invoke(
      'minecraft:get-install-status',
      versionId,
      gameDirectory
    ) as Promise<MinecraftInstallStatus>
  },

  installMinecraftClient: async (
    versionId: string,
    gameDirectory: string
  ): Promise<MinecraftInstallResult> => {
    return ipcRenderer.invoke(
      'minecraft:install-client',
      versionId,
      gameDirectory
    ) as Promise<MinecraftInstallResult>
  },

  onInstallProgress: (
    callback: (progress: MinecraftInstallProgress) => void
  ): void => {
    ipcRenderer.removeAllListeners('minecraft:install-progress')

    ipcRenderer.on(
      'minecraft:install-progress',
      (_event, progress: MinecraftInstallProgress) => {
        callback(progress)
      }
    )
  },

  removeInstallProgressListener: (): void => {
    ipcRenderer.removeAllListeners('minecraft:install-progress')
  },

  getDefaultGameDirectory: async (): Promise<string> => {
    return ipcRenderer.invoke(
      'folder:get-default-game-directory'
    ) as Promise<string>
  },

  chooseGameDirectory: async (
    currentPath: string | null
  ): Promise<string | null> => {
    return ipcRenderer.invoke(
      'folder:choose-game-directory',
      currentPath
    ) as Promise<string | null>
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)

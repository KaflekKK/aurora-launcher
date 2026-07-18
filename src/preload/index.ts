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
  | 'extracting'
  | 'complete'
  | 'error'

interface MinecraftInstallProgress {
  versionId: string
  phase: InstallPhase
  downloadedBytes: number
  totalBytes: number
  percent: number
  message: string
  currentFile: string | null
  completedFiles: number
  totalFiles: number
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
  clientValid: boolean

  libraryCount: number
  validLibraryCount: number
  missingLibraryCount: number
  invalidLibraryCount: number

  assetIndexValid: boolean
  assetCount: number
  validAssetCount: number
  missingAssetCount: number
  invalidAssetCount: number

  nativeArchiveCount: number
  validNativeArchiveCount: number
  missingNativeArchiveCount: number
  invalidNativeArchiveCount: number
  nativesExtracted: boolean
  nativeFileCount: number

  totalExpectedSize: number | null
  error: string | null
}

interface MinecraftInstallResult {
  success: boolean
  alreadyInstalled: boolean
  versionId: string
  jarPath: string | null
  libraryCount: number
  assetCount: number
  nativeArchiveCount: number
  extractedNativeFileCount: number
  downloadedFileCount: number
  error: string | null
}

type MinecraftRunMode = 'microsoft' | 'ui-test'

type MinecraftGamePhase =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error'

interface MicrosoftAccountState {
  signedIn: boolean
  hasMinecraft: boolean
  username: string | null
  id: string | null
  xuid: string | null
  error: string | null
}

interface MicrosoftLoginResult extends MicrosoftAccountState {
  success: boolean
}

type AuroraRenderer = 'sodium' | 'vulkan'

type AuroraProfileId =
  | '1.20.1-sodium'
  | '1.20.1-vulkan'
  | '1.21.4-sodium'
  | '1.21.4-vulkan'
  | '1.21.11-sodium'
  | '1.21.11-vulkan'

interface MinecraftLaunchRequest {
  versionId: string
  gameDirectory: string
  launchMode: MinecraftRunMode
  username: string | null
  ram: number
  profileName: string
  profileId: AuroraProfileId | null
  renderer: AuroraRenderer | null
  minimizeOnLaunch: boolean
  closeOnLaunch: boolean
}

interface MinecraftLaunchResult {
  success: boolean
  running: boolean
  pid: number | null
  mode: MinecraftRunMode | null
  error: string | null
}

interface MinecraftGameState {
  phase: MinecraftGamePhase
  running: boolean
  pid: number | null
  startedAt: string | null
  exitCode: number | null
  signal: string | null
  message: string
}

interface MinecraftGameLog {
  stream: 'system' | 'stdout' | 'stderr'
  message: string
  timestamp: string
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

  installMinecraftVersion: (
    versionId: string,
    gameDirectory: string
  ) => Promise<MinecraftInstallResult>

  onInstallProgress: (
    callback: (progress: MinecraftInstallProgress) => void
  ) => void

  removeInstallProgressListener: () => void

  getMicrosoftAccount: () => Promise<MicrosoftAccountState>

  loginMicrosoft: () => Promise<MicrosoftLoginResult>

  logoutMicrosoft: () => Promise<boolean>

  launchMinecraftGame: (
    request: MinecraftLaunchRequest
  ) => Promise<MinecraftLaunchResult>

  getMinecraftGameState: () => Promise<MinecraftGameState>

  stopMinecraftGame: () => Promise<boolean>

  onGameLog: (
    callback: (log: MinecraftGameLog) => void
  ) => void

  onGameState: (
    callback: (state: MinecraftGameState) => void
  ) => void

  removeGameListeners: () => void

  getDefaultGameDirectory: () => Promise<string>

  chooseGameDirectory: (
    currentPath: string | null
  ) => Promise<string | null>

  openUserModsFolder: (
    gameDirectory: string
  ) => Promise<boolean>
}

const api: AuroraAPI = {
  getJavaInfo: async (): Promise<JavaInfo> => {
    return ipcRenderer.invoke(
      'java:get-info'
    ) as Promise<JavaInfo>
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

  installMinecraftVersion: async (
    versionId: string,
    gameDirectory: string
  ): Promise<MinecraftInstallResult> => {
    return ipcRenderer.invoke(
      'minecraft:install-version',
      versionId,
      gameDirectory
    ) as Promise<MinecraftInstallResult>
  },

  onInstallProgress: (
    callback: (progress: MinecraftInstallProgress) => void
  ): void => {
    ipcRenderer.removeAllListeners(
      'minecraft:install-progress'
    )

    ipcRenderer.on(
      'minecraft:install-progress',
      (_event, progress: MinecraftInstallProgress) => {
        callback(progress)
      }
    )
  },

  removeInstallProgressListener: (): void => {
    ipcRenderer.removeAllListeners(
      'minecraft:install-progress'
    )
  },

  getMicrosoftAccount: async (): Promise<MicrosoftAccountState> => {
    return ipcRenderer.invoke(
      'auth:get-microsoft-account'
    ) as Promise<MicrosoftAccountState>
  },

  loginMicrosoft: async (): Promise<MicrosoftLoginResult> => {
    return ipcRenderer.invoke(
      'auth:login-microsoft'
    ) as Promise<MicrosoftLoginResult>
  },

  logoutMicrosoft: async (): Promise<boolean> => {
    return ipcRenderer.invoke(
      'auth:logout-microsoft'
    ) as Promise<boolean>
  },

  launchMinecraftGame: async (
    request: MinecraftLaunchRequest
  ): Promise<MinecraftLaunchResult> => {
    return ipcRenderer.invoke(
      'minecraft:launch-game',
      request
    ) as Promise<MinecraftLaunchResult>
  },

  getMinecraftGameState: async (): Promise<MinecraftGameState> => {
    return ipcRenderer.invoke(
      'minecraft:get-game-state'
    ) as Promise<MinecraftGameState>
  },

  stopMinecraftGame: async (): Promise<boolean> => {
    return ipcRenderer.invoke(
      'minecraft:stop-game'
    ) as Promise<boolean>
  },

  onGameLog: (
    callback: (log: MinecraftGameLog) => void
  ): void => {
    ipcRenderer.removeAllListeners(
      'minecraft:game-log'
    )

    ipcRenderer.on(
      'minecraft:game-log',
      (_event, log: MinecraftGameLog) => {
        callback(log)
      }
    )
  },

  onGameState: (
    callback: (state: MinecraftGameState) => void
  ): void => {
    ipcRenderer.removeAllListeners(
      'minecraft:game-state'
    )

    ipcRenderer.on(
      'minecraft:game-state',
      (_event, state: MinecraftGameState) => {
        callback(state)
      }
    )
  },

  removeGameListeners: (): void => {
    ipcRenderer.removeAllListeners(
      'minecraft:game-log'
    )

    ipcRenderer.removeAllListeners(
      'minecraft:game-state'
    )
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
  },

  openUserModsFolder: async (
    gameDirectory: string
  ): Promise<boolean> => {
    return ipcRenderer.invoke(
      'folder:open-user-mods',
      gameDirectory
    ) as Promise<boolean>
  }
}

contextBridge.exposeInMainWorld(
  'electron',
  electronAPI
)

contextBridge.exposeInMainWorld(
  'api',
  api
)
/// <reference types="vite/client" />

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
  'checking' | 'downloading' | 'verifying' | 'extracting' | 'complete' | 'error'

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
type MinecraftGamePhase = 'idle' | 'starting' | 'running' | 'stopped' | 'error'

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

interface MinecraftLaunchRequest {
  versionId: string
  gameDirectory: string
  launchMode: MinecraftRunMode
  username: string | null
  ram: number
  profileName: string
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

  onGameLog: (callback: (log: MinecraftGameLog) => void) => void

  onGameState: (callback: (state: MinecraftGameState) => void) => void

  removeGameListeners: () => void

  getDefaultGameDirectory: () => Promise<string>

  chooseGameDirectory: (currentPath: string | null) => Promise<string | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AuroraAPI
  }
}

export {}
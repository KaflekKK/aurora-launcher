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
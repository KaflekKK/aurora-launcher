import {
  contextBridge,
  ipcRenderer
} from 'electron'
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

  getDefaultGameDirectory:
    async (): Promise<string> => {
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

contextBridge.exposeInMainWorld(
  'electron',
  electronAPI
)

contextBridge.exposeInMainWorld(
  'api',
  api
)
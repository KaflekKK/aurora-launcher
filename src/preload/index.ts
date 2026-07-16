import {
  contextBridge,
  ipcRenderer
} from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getJavaInfo: () => {
    return ipcRenderer.invoke(
      'java:get-info'
    )
  },

  checkMinecraftVersion: (
    versionId: string,
    forceRefresh = false
  ) => {
    return ipcRenderer.invoke(
      'minecraft:check-version',
      versionId,
      forceRefresh
    )
  },

  getMinecraftVersionDetails: (
    versionId: string,
    forceRefresh = false
  ) => {
    return ipcRenderer.invoke(
      'minecraft:get-version-details',
      versionId,
      forceRefresh
    )
  },

  getDefaultGameDirectory: () => {
    return ipcRenderer.invoke(
      'folder:get-default-game-directory'
    )
  },

  chooseGameDirectory: (
    currentPath: string | null
  ) => {
    return ipcRenderer.invoke(
      'folder:choose-game-directory',
      currentPath
    )
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
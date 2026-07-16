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

interface AuroraAPI {
  getJavaInfo: () => Promise<JavaInfo>
}

const api: AuroraAPI = {
  getJavaInfo: async (): Promise<JavaInfo> => {
    return ipcRenderer.invoke('java:get-info') as Promise<JavaInfo>
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
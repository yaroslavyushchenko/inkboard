import { contextBridge } from 'electron'

// File system APIs (save / open boards) will be exposed here in stage 3.
contextBridge.exposeInMainWorld('inkboard', {
  platform: process.platform
})

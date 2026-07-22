import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    getBackendPort: () => ipcRenderer.invoke('get:backendPort'),
    showNotification: (title: string, body: string) => ipcRenderer.send('notification:show', { title, body }),
});
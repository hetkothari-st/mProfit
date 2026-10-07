import { contextBridge, ipcRenderer } from 'electron';

// The one thing the web app learns about the shell: that it is in it, and
// which version. Lets it hide "Download the desktop app" here. Nothing else
// crosses over.
const info = ipcRenderer.sendSync('everypaisa:desktop-info') as { version: string; platform: string };
contextBridge.exposeInMainWorld('everypaisaDesktop', Object.freeze(info));

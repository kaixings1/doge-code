const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '后台管理系统',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.loadURL('http://127.0.0.1:8086');
  win.on('closed', () => { app.quit(); });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

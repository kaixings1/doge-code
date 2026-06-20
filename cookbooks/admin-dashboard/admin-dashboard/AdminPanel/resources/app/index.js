const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.maximize();
  win.setTitle('工业X射线智能检测系统');
  win.loadURL('http://127.0.0.1:8086');
  win.once('ready-to-show', () => { win.show(); });
  win.on('closed', () => { app.quit(); });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

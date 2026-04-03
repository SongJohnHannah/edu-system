const { app, BrowserWindow, shell, ipcMain } = require('electron')
const path = require('path')
const Store = require('electron-store')

// 初始化数据存储
const store = new Store({
  name: 'edu-system-data',
  defaults: {
    students: [],
    teachers: [],
    courses: [],
    attendance: [],
    hourRecords: [],
    classes: []
  }
})

// IPC 处理数据操作
ipcMain.handle('get-data', () => {
  return store.store
})

ipcMain.handle('save-data', (event, data) => {
  store.store = data
  return true
})

ipcMain.handle('get-store-path', () => {
  return store.path
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: 'left'
  })

  // 开发工具（调试用，生产环境可注释）
  // win.webContents.openDevTools()

  // 加载 Vite 构建后的文件
  win.loadFile(path.join(__dirname, '../dist/index.html')).catch(err => {
    console.error('Failed to load index.html:', err)
  })

  // 在新窗口中打开外部链接
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  return win
}

// macOS 特殊处理
if (process.platform === 'darwin') {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.whenReady().then(() => {
  createWindow()
})
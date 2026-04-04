const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// 设置应用中文名称（显示在菜单和 Dock）
if (process.platform === 'darwin') {
  app.setName('嘉言思听教务管理系统')
}

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
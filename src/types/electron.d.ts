// Electron API 类型声明
interface ElectronAPI {
  platform: string
  getData: () => Promise<AppData>
  saveData: (data: AppData) => Promise<boolean>
  getStorePath: () => Promise<string>
}

interface AppData {
  students: any[]
  teachers: any[]
  courses: any[]
  attendance: any[]
  hourRecords: any[]
  classes: any[]
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    _electronData: AppData
  }
}

export {}
export const SCENE_STORAGE_KEY = 'edu.login.scene'

export function readSceneTheme(storage) {
  try {
    const value = (storage || window.localStorage).getItem(SCENE_STORAGE_KEY)
    return value === 'day' ? 'day' : 'night'
  } catch { return 'night' }
}

export function saveSceneTheme(theme, storage) {
  try {
    const target = storage || window.localStorage
    target.setItem(SCENE_STORAGE_KEY, theme === 'day' ? 'day' : 'night')
  } catch { /* The scene still switches when browser storage is unavailable. */ }
}

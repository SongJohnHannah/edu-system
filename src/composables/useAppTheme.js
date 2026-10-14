import { computed, onUnmounted, ref, watchEffect } from 'vue'

const STORAGE_KEY = 'edu.app.theme'
const classicColors = {
  primary: '#4178b9', primaryHover: '#31689f', primaryPressed: '#285a8c',
  primaryText: '#356ba8', text: '#26384d', textSecondary: '#63758a',
  border: '#dbe5ef', surface: '#f8fafd', selected: '#eaf3fc'
}

const themes = [
  {
    id: 'aurora', name: '柔和渐变', ...classicColors,
    surface: '#f0f5fc', border: '#d0deed',
    background: 'radial-gradient(ellipse at 8% 8%, #cde2fa 0, transparent 48%), radial-gradient(ellipse at 95% 30%, #d9f2e7 0, transparent 44%), radial-gradient(ellipse at 55% 100%, #fce7d7 0, transparent 52%), #f5f8fc'
  },
  {
    id: 'mint', name: '薄荷绿', ...classicColors,
    primary: '#28725c', primaryHover: '#205f4c', primaryPressed: '#184b3b',
    primaryText: '#246650', text: '#263e35', textSecondary: '#5f766b',
    border: '#cfe3d8', surface: '#eff8f3', selected: '#e1f2e8',
    background: 'radial-gradient(ellipse at 6% 0%, #d1efdf 0, transparent 58%), radial-gradient(ellipse at 96% 35%, #dceef1 0, transparent 48%), radial-gradient(ellipse at 55% 100%, #f5eed6 0, transparent 52%), #f5faf7'
  },
  {
    id: 'apricot', name: '暖杏色', ...classicColors,
    primary: '#a65b32', primaryHover: '#904a27', primaryPressed: '#783e22',
    primaryText: '#95502c', text: '#49362d', textSecondary: '#826b5e',
    border: '#ead8ca', surface: '#fbf4ed', selected: '#f8e7d9',
    background: 'radial-gradient(ellipse at 8% 5%, #f8dcc2 0, transparent 54%), radial-gradient(ellipse at 100% 35%, #f6e0dd 0, transparent 45%), radial-gradient(ellipse at 48% 100%, #eeead1 0, transparent 52%), #fcf8f2'
  },
  { id: 'classic', name: '经典蓝', ...classicColors, background: '#f8fafd' }
]

const cssProperties = {
  '--color-primary': 'primary', '--color-primary-hover': 'primaryHover',
  '--color-primary-text': 'primaryText', '--color-text': 'text',
  '--color-text-secondary': 'textSecondary', '--color-border': 'border',
  '--color-bg-secondary': 'surface', '--color-selected': 'selected',
  '--app-background': 'background'
}

function readTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return themes.find(theme => theme.id === saved) || themes[0]
  } catch { return themes[0] }
}

export function useAppTheme(isLoginPage) {
  const selectedTheme = ref(readTheme())
  const nextTheme = computed(() => themes[(themes.findIndex(theme => theme.id === selectedTheme.value.id) + 1) % themes.length])
  const themeSwitchLabel = computed(() => `切换主题配色，当前${selectedTheme.value.name}，切换为${nextTheme.value.name}`)
  const activeTheme = computed(() => isLoginPage.value ? themes[3] : selectedTheme.value)
  const themeOverrides = computed(() => {
    const theme = activeTheme.value
    return {
      common: {
        primaryColor: theme.primary, primaryColorHover: theme.primaryHover,
        primaryColorPressed: theme.primaryPressed, primaryColorSuppl: theme.primary,
        textColorBase: theme.text, textColor2: theme.textSecondary,
        borderColor: theme.border, bodyColor: theme.surface, cardColor: '#ffffff',
        borderRadius: '10px', fontFamily: "Inter, 'Microsoft YaHei', 'PingFang SC', sans-serif"
      }
    }
  })

  // Root variables also reach menus and dialogs teleported outside the app.
  function clearTheme() {
    delete document.documentElement.dataset.appTheme
    for (const property of Object.keys(cssProperties)) document.documentElement.style.removeProperty(property)
  }
  watchEffect(() => {
    if (isLoginPage.value) return clearTheme()
    document.documentElement.dataset.appTheme = selectedTheme.value.id
    for (const [property, color] of Object.entries(cssProperties)) {
      document.documentElement.style.setProperty(property, selectedTheme.value[color])
    }
  })
  onUnmounted(clearTheme)

  function cycleTheme() {
    selectedTheme.value = nextTheme.value
    try { localStorage.setItem(STORAGE_KEY, selectedTheme.value.id) }
    catch { /* The theme still switches if browser storage is unavailable. */ }
  }

  return { selectedTheme, themeSwitchLabel, themeOverrides, cycleTheme }
}

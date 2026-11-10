import { readFile } from 'node:fs/promises'

function loadEnv(text) {
  return Object.fromEntries(
    text.split(/\r?\n/)
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const index = line.indexOf('=')
        return index === -1 ? [line, ''] : [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const env = loadEnv(await readFile('.env', 'utf8'))
const appUrl = process.env.KKMONTH_APP_URL || 'https://kkmonth.web.app/'
const gasUrl = env.VITE_APPS_SCRIPT_URL
const secret = env.VITE_API_SECRET

if (!gasUrl || !secret) throw new Error('.env 缺少 VITE_APPS_SCRIPT_URL 或 VITE_API_SECRET')

const apiUrl = action => {
  const url = new URL(gasUrl)
  url.search = new URLSearchParams({ action, secret }).toString()
  return url
}

const [app, period, squads, localGas, deployedGas] = await Promise.all([
  fetch(appUrl, { signal: AbortSignal.timeout(20_000) }),
  getJson(apiUrl('getPeriod')),
  getJson(apiUrl('getSquadPosts')),
  readFile('gas.txt', 'utf8'),
  readFile('apps-script/程式碼.js', 'utf8'),
])

const failures = []
if (!app.ok) failures.push(`主站 HTTP ${app.status}`)
if (!period.currentPeriod) failures.push('getPeriod 未回傳 currentPeriod')
if (!squads.success || !Array.isArray(squads.posts)) failures.push('getSquadPosts 回應異常')
if (localGas !== deployedGas) failures.push('gas.txt 與 apps-script/程式碼.js 不一致')

console.log(`主站：HTTP ${app.status}`)
console.log(`Apps Script：${period.currentPeriod || '未設定期數'}`)
console.log(`隊伍徵求 API：${squads.success ? `正常（${squads.posts.length} 筆）` : '異常'}`)
console.log(`GAS 原始碼：${localGas === deployedGas ? '同步' : '不同步'}`)

if (failures.length) {
  console.error(`檢查失敗：${failures.join('；')}`)
  process.exitCode = 1
}

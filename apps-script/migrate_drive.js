// ===== Drive 資料夾搬遷腳本 =====
// 目的：把 krenzartwork 帳號下的參加者資料夾複製到 xiah6415tw 個人雲端
// 使用方式：在 GAS 編輯器手動執行 migrateStep()，重複執行直到 log 顯示「全部完成」
// 完成確認後再手動刪除舊資料夾（不會自動刪）

const MIGRATE_ROOT_ID = '1GZ-ncCHasg1o0HYsFGtLYJ_JkYCGdNaE'

// ── 主要執行函式，重複呼叫直到完成 ────────────────────────────
function migrateStep() {
  const props = PropertiesService.getScriptProperties()
  const cursor = props.getProperty('mg_cursor') || null
  const totalDone = parseInt(props.getProperty('mg_done') || '0')
  const BATCH = 30
  const startTime = Date.now()
  const MAX_MS = 5 * 60 * 1000

  let processed = 0
  let pausedMidBatch = false

  const body = {
    page_size: 100,
    filter: { property: '資料夾連結', url: { is_not_empty: true } }
  }
  if (cursor) body.start_cursor = cursor

  const res = UrlFetchApp.fetch(
    `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
    {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(body)
    }
  )
  const data = JSON.parse(res.getContentText())

  for (const page of data.results) {
    if (Date.now() - startTime > MAX_MS) {
      pausedMidBatch = true
      break
    }

    const pageId = page.id
    const status = props.getProperty(`mg_${pageId}`)
    if (status === 'done' || status === 'skip') continue

    const oldUrl = page.properties['資料夾連結']?.url
    if (!oldUrl) {
      props.setProperty(`mg_${pageId}`, 'skip')
      continue
    }

    const oldFolderId = oldUrl.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1]
    if (!oldFolderId) {
      props.setProperty(`mg_${pageId}`, 'skip')
      continue
    }

    try {
      const period = page.properties['期數']?.rich_text?.[0]?.plain_text || 'unknown'
      const nickname = page.properties['伺服器暱稱']?.rich_text?.[0]?.plain_text
        || page.properties['Discord_ID']?.title?.[0]?.plain_text
        || 'unknown'

      const periodFolderId = mgGetOrCreatePeriodFolder(period, props)
      const newFolder = DriveApp.getFolderById(periodFolderId).createFolder(nickname)
      mgCopyFolderContents(oldFolderId, newFolder.getId())

      const newUrl = `https://drive.google.com/drive/folders/${newFolder.getId()}`
      UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: 'patch',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({ properties: { '資料夾連結': { url: newUrl } } })
      })

      props.setProperty(`mg_${pageId}`, 'done')
      processed++

    } catch (e) {
      console.error(`[migrate] ${pageId} 失敗: ${e.message}`)
      props.setProperty(`mg_${pageId}`, `err:${e.message.substring(0, 100)}`)
    }

    if (processed >= BATCH) break
  }

  // 更新 cursor
  if (!pausedMidBatch && data.has_more) {
    props.setProperty('mg_cursor', data.next_cursor)
  } else if (!pausedMidBatch && !data.has_more) {
    props.deleteProperty('mg_cursor')
  }
  // pausedMidBatch 時保持原 cursor，下次從同一頁重跑

  props.setProperty('mg_done', String(totalDone + processed))

  const remaining = data.has_more || pausedMidBatch ? '繼續執行 migrateStep()' : '全部完成！可以查看 migrateSummary()'
  console.log(`本次完成 ${processed} 筆，累計 ${totalDone + processed} 筆 → ${remaining}`)
}

// ── 取得或建立期數子資料夾（結果快取到 Properties）──────────────
function mgGetOrCreatePeriodFolder(period, props) {
  const cacheKey = `mg_pf_${period}`
  const cached = props.getProperty(cacheKey)
  if (cached) return cached

  const root = DriveApp.getFolderById(MIGRATE_ROOT_ID)
  const existing = root.getFoldersByName(period)
  const folder = existing.hasNext() ? existing.next() : root.createFolder(period)
  props.setProperty(cacheKey, folder.getId())
  return folder.getId()
}

// ── 遞迴複製資料夾內容 ──────────────────────────────────────────
function mgCopyFolderContents(srcId, dstId) {
  const src = DriveApp.getFolderById(srcId)
  const dst = DriveApp.getFolderById(dstId)

  const files = src.getFiles()
  while (files.hasNext()) {
    files.next().makeCopy(dst)
  }

  const folders = src.getFolders()
  while (folders.hasNext()) {
    const sub = folders.next()
    const newSub = dst.createFolder(sub.getName())
    mgCopyFolderContents(sub.getId(), newSub.getId())
  }
}

// ── 查看目前進度 ────────────────────────────────────────────────
function migrateSummary() {
  const props = PropertiesService.getScriptProperties().getProperties()
  let done = 0, errors = 0, skipped = 0, errorList = []
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith('mg_') || k === 'mg_cursor' || k === 'mg_done') continue
    if (k.startsWith('mg_pf_')) continue
    if (v === 'done') done++
    else if (v === 'skip') skipped++
    else if (v.startsWith('err:')) { errors++; errorList.push(`${k}: ${v}`) }
  }
  console.log(`完成: ${done} / 跳過: ${skipped} / 錯誤: ${errors}`)
  if (errorList.length) console.log('錯誤清單:\n' + errorList.slice(0, 20).join('\n'))
}

// ── 重置進度（出問題時用）──────────────────────────────────────
function migrateReset() {
  const props = PropertiesService.getScriptProperties()
  const all = props.getProperties()
  for (const k of Object.keys(all)) {
    if (k.startsWith('mg_')) props.deleteProperty(k)
  }
  console.log('進度已清除')
}

// ================================================================
// 月月繪 Google Apps Script
// 最後更新：2026-09-02
// 版本：v40
// 變更：
//   - v40：getUserRecords 改用 fetchAll 平行查詢（batch1: discordId+legacy同時送；batch3: 多 username 同時送），大幅縮短載入時間
//   - v39：配額計數只算 WRITE_ACTIONS（純讀取不計入），避免瀏覽流量誤觸鎖死；SOFT/HARD 上限由 70%/90% 放寬為 90%/100%
//   - autoSyncSheet 不再掃描 Drive/Docs，避免觸發器逾時（v15）
//   - findTeamsByEmail / claimRecordByEmail（v17）
//   - 新增期數設定管理：periodsConfig JSON 陣列，每期獨立設定
//   - getActivePeriodInfo：依日期自動判斷當前期數／補交期
//   - 新增 getPeriodsConfig / setPeriodsConfig action
//   - getPeriod / initDashboard / getUserRecords 回傳 isMakeup + periods
//   - createFolder 改用 getActivePeriodInfo，依期數 rootFolderId 建資料夾
//   - getPeriodsConfig：若 periodsConfig 空則自動從舊屬性建立初始資料（向下相容）
//   - 補交期建檔改用 targetPeriod 的 rootFolderId，補交期本身不建資料夾（v19）
//   - getActivePeriodInfo 改為正常期優先，新增 makeupActive 欄位支援並行（v20）
//   - createFolder 改以 targetPeriod + open 欄位判斷，移除 isMakeup 路徑（v21）
//   - v25：createFolder 加速率限制（每小時 30 次）＋ discordId 格式驗證
//   - v25：setPeriodsConfig / setPeriod 更新封面圖 URL 須驗證管理員 discordId
//   - v26：每月呼叫配額保護，70% 限寫入，90% 全停，避免超出免費額度付費
//   - v28：清除第一至三期資料夾搬移臨時程式碼（搬移已完成）；移除 migrateAttendanceToNewField
//   - v29：新增隊伍徵求版（getSquadPosts / createSquadPost），貼文存於 Google Sheet
//   - v30：_getSquadSheet 改用 PropertiesService 快取 Sheet ID，避免每次搜尋 Drive
//   - v31：新增個人信箱 Profile 系統（getProfile / saveProfile），getUserRecords 加入信箱關聯查詢
//   - v32：新增使用者基本資料暫存（saveUserInfo / getUserInfo），分離「登記個人」與「建檔」兩步驟
//   - v33：全勤連動（updateAttendanceStatus 標記團體時自動連動隊員）；新增 acceptTeamInvite / declineTeamInvite；登記不再收類型
//   - v34：新增 backfillUserProfiles（批次回填舊用戶個人資料）；新增 clearTestAccount（測試帳號清除工具）
//   - v35：Profile 資料改存 Notion（期數="profile"），PropertiesService 只當 cache；backfillUserProfiles 改寫 Notion
//   - v36：新增管理面板（adminPanel HTML）；新增 migrateRootFolder；doGet 開放 backfillUserProfiles / clearTestAccount / migrateRootFolder
//   - v37：getAllRecords 過濾 profile 紀錄，修復管理員頁面顯示 profile 假期數的問題
// ================================================================

// ── 設定 ────────────────────────────────────────────────────
const DISCORD_CLIENT_ID = '1496529238583414886'
const DISCORD_CLIENT_SECRET = 'j0XeUHrF1Xhxb_HWj-gskrQZShNIf0fC'
const ROOT_FOLDER_ID = '1CKtRyVxDqiP7ebaw0obPW2yX9A5LObZy'
const NOTION_TOKEN = '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'
const NOTION_DATABASE_ID = '34a63b0885958042ad79d27f8abe63e4'
const API_SECRET = '月月繪2026secret_KK'

// ── 每月配額保護 ─────────────────────────────────────────────
// 每月上限 3000 次「寫入」呼叫（正常活動用量約數百次，足夠抵禦攻擊）
// v39：只計入 WRITE_ACTIONS，純讀取（getPeriod/getUserRecords 等）不計入，避免瀏覽流量誤觸鎖死
const MONTHLY_SOFT_LIMIT = 2700  // 90%：禁止寫入操作
const MONTHLY_HARD_LIMIT = 3000  // 100%：全面停止
const WRITE_ACTIONS = new Set([
  'createFolder', 'updateGoogleAccounts', 'adminUpdateRecord',
  'updateReportStatus', 'cancelReportStatus', 'updateSocialLink',
  'updateAttendanceStatus', 'addLegacyRecord', 'setPeriodsConfig',
  'setPeriod', 'addAdminId', 'removeAdminId', 'exportToSheet',
  'createSquadPost', 'saveProfile', 'saveUserInfo', 'acceptTeamInvite', 'declineTeamInvite'
])

// ── 設定資料夾管理者權限（Drive API v3）─────────────────────
function setFolderOrganizer(folderId, email) {
  const perms = Drive.Permissions.list(folderId, {
    supportsAllDrives: true,
    fields: 'permissions(id,emailAddress,role)'
  })
  const existing = (perms.permissions || []).find(p =>
    p.emailAddress && p.emailAddress.toLowerCase() === email.toLowerCase()
  )
  if (existing) {
    if (existing.role === 'fileOrganizer') return
    Drive.Permissions.update({ role: 'fileOrganizer' }, folderId, existing.id, {
      supportsAllDrives: true
    })
  } else {
    Drive.Permissions.create({
      role: 'fileOrganizer',
      type: 'user',
      emailAddress: email
    }, folderId, {
      supportsAllDrives: true,
      sendNotificationEmail: false
    })
  }
}

// ── 工具 ─────────────────────────────────────────────────────
function getCurrentPeriod() {
  return PropertiesService.getScriptProperties().getProperty('currentPeriod') || ''
}

function getActivityDates() {
  const props = PropertiesService.getScriptProperties()
  return {
    startDate:  props.getProperty('startDate')  || '',
    endDate:    props.getProperty('endDate')    || '',
    extendDate: props.getProperty('extendDate') || ''
  }
}

function getCoverImageUrl() {
  return PropertiesService.getScriptProperties().getProperty('coverImageUrl') || ''
}

function isAdminUser(discordId) {
  const ids = (PropertiesService.getScriptProperties().getProperty('adminIds') || '')
    .split(',').map(s => s.split('|')[0].trim()).filter(Boolean)
  return ids.includes(discordId)
}

// 每月配額狀態：只累計「寫入」action 次數，回傳 'ok' / 'throttled' / 'blocked'
function getMonthlyQuotaStatus(action) {
  const props = PropertiesService.getScriptProperties()
  const monthBucket = new Date().toISOString().slice(0, 7)  // YYYY-MM
  const key = 'monthly_calls_' + monthBucket
  let count = parseInt(props.getProperty(key) || '0')
  if (WRITE_ACTIONS.has(action)) {
    count += 1
    props.setProperty(key, String(count))
  }
  if (count >= MONTHLY_HARD_LIMIT) return 'blocked'
  if (count >= MONTHLY_SOFT_LIMIT) return 'throttled'
  return 'ok'
}

// 手動重置本月配額計數（管理用，例如舊版計數邏輯累積的數字需要歸零時）
function resetMonthlyQuota() {
  const props = PropertiesService.getScriptProperties()
  const monthBucket = new Date().toISOString().slice(0, 7)
  props.deleteProperty('monthly_calls_' + monthBucket)
  return { success: true, monthBucket }
}

// 全域速率限制：每小時最多 maxPerHour 次呼叫（用 PropertiesService 記錄每小時的 bucket）
function checkGlobalRateLimit(action, maxPerHour) {
  const props = PropertiesService.getScriptProperties()
  const hourBucket = Math.floor(Date.now() / 3600000)
  const key = 'rl_' + action + '_' + hourBucket
  const count = parseInt(props.getProperty(key) || '0')
  if (count >= maxPerHour) return false
  props.setProperty(key, String(count + 1))
  return true
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

// ── 期數設定管理 ──────────────────────────────────────────────
function getPeriodsConfig() {
  const raw = PropertiesService.getScriptProperties().getProperty('periodsConfig')
  return raw ? JSON.parse(raw) : []
}

function savePeriodsConfig(periods) {
  PropertiesService.getScriptProperties().setProperty('periodsConfig', JSON.stringify(periods))
  const makeup = periods.find(p => p.name === '補交期')
  if (makeup && makeup.makeupRootFolder !== undefined) {
    PropertiesService.getScriptProperties().setProperty('makeupRootFolder', makeup.makeupRootFolder || '')
  }
}

function getActivePeriodInfo() {
  const now = new Date()
  const periods = getPeriodsConfig()

  if (periods.length === 0) {
    // 舊系統 fallback
    const name = getCurrentPeriod()
    const dates = getActivityDates()
    return { name, isMakeup: name === '補交期', isPast: false, ...dates, rootFolderId: '', makeupActive: false }
  }

  // 判斷補交期是否同時進行中
  const makeup = periods.find(p => p.name === '補交期')
  let makeupActive = false
  if (makeup && makeup.startDate && makeup.endDate) {
    const start = new Date(makeup.startDate)
    const end = new Date(makeup.endDate + 'T23:59:59')
    if (now >= start && now <= end) makeupActive = true
  }

  // 先找當前活躍的正常期數（正常期優先）
  for (const p of periods) {
    if (p.name === '補交期') continue
    if (!p.startDate || !p.endDate) continue
    const effectiveEnd = p.extendDate
      ? new Date(p.extendDate + 'T23:59:59')
      : new Date(p.endDate + 'T23:59:59')
    if (now >= new Date(p.startDate) && now <= effectiveEnd) {
      return { ...p, isMakeup: false, isPast: false, makeupActive }
    }
  }

  // 沒有活躍正常期，若補交期在進行中則回傳補交期
  if (makeupActive) {
    return { ...makeup, isMakeup: true, isPast: false, makeupActive: true }
  }

  // 回傳最近一期（已過期）
  const regular = periods.filter(p => p.name !== '補交期')
  if (regular.length > 0) return { ...regular[regular.length - 1], isMakeup: false, isPast: true, makeupActive: false }
  return { name: '', isMakeup: false, isPast: true, rootFolderId: '', makeupActive: false }
}

// ── 路由 ─────────────────────────────────────────────────────
function doGet(e) {
  // 一次性 bootstrap：設定 secrets（完成後刪除此段）
  if (e.parameter.action === '_bootstrap' && e.parameter.token === 'kkmonth-bootstrap-2026') {
    const props = PropertiesService.getScriptProperties()
    props.setProperty('DISCORD_CLIENT_SECRET', 'j0XeUHrF1Xhxb_HWj-gskrQZShNIf0fC')
    props.setProperty('NOTION_TOKEN', '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')
    props.setProperty('API_SECRET', '月月繪2026secret_KK')
    return jsonResponse({ ok: true, msg: 'secrets set' })
  }

  if (e.parameter.secret !== API_SECRET) {
    return jsonResponse({ error: 'Unauthorized' })
  }

  const action = e.parameter.action

  // 每月配額保護（resetMonthlyQuota 本身不受限，避免鎖死後管理員也解不開）
  if (action !== 'resetMonthlyQuota') {
    const quota = getMonthlyQuotaStatus(action)
    if (quota === 'blocked') {
      return jsonResponse({ error: '本月服務已暫停以避免超額費用，下月自動恢復' })
    }
    if (quota === 'throttled' && WRITE_ACTIONS.has(action)) {
      return jsonResponse({ error: '目前流量過高，寫入操作暫時限制中，請稍後再試' })
    }
  }

  if (action === 'getDiscordUser') {
    return jsonResponse(getDiscordUser(e.parameter.code, e.parameter.redirect_uri))

  } else if (action === 'initDashboard') {
    const user = getDiscordUser(e.parameter.code, e.parameter.redirect_uri)
    if (user.error) return jsonResponse({ error: user.error })
    const recordsResult = getUserRecords(user.id, user.username)
    const active = getActivePeriodInfo()
    const allPeriods = getPeriodsConfig()
    return jsonResponse({
      success: true,
      user: user,
      records: recordsResult.records || [],
      currentPeriod: active.name || '',
      isMakeup: !!active.isMakeup,
      makeupActive: !!active.makeupActive,
      startDate: active.isMakeup ? '' : (active.startDate || ''),
      endDate: active.isMakeup ? '' : (active.endDate || ''),
      extendDate: active.isMakeup ? '' : (active.extendDate || ''),
      coverImageUrl: getCoverImageUrl(),
      isAdmin: isAdminUser(user.id),
      makeupRootFolder: PropertiesService.getScriptProperties().getProperty('makeupRootFolder') || '',
      periods: allPeriods,
      profileEmail: getProfileEmail(user.id),
      userInfo: getUserInfo(user.id)
    })

  } else if (action === 'getUserRecords') {
    const result = getUserRecords(e.parameter.discordId, e.parameter.discordUsername)
    const active = getActivePeriodInfo()
    const allPeriods = getPeriodsConfig()
    return jsonResponse({
      ...result,
      currentPeriod: active.name || '',
      isMakeup: !!active.isMakeup,
      makeupActive: !!active.makeupActive,
      startDate: active.isMakeup ? '' : (active.startDate || ''),
      endDate: active.isMakeup ? '' : (active.endDate || ''),
      extendDate: active.isMakeup ? '' : (active.extendDate || ''),
      coverImageUrl: getCoverImageUrl(),
      isAdmin: isAdminUser(e.parameter.discordId),
      makeupRootFolder: PropertiesService.getScriptProperties().getProperty('makeupRootFolder') || '',
      periods: allPeriods,
      profileEmail: getProfileEmail(e.parameter.discordId),
      userInfo: getUserInfo(e.parameter.discordId)
    })

  } else if (action === 'createFolder') {
    return jsonResponse(createFolder({
      type: e.parameter.type,
      teamName: e.parameter.teamName,
      discordId: e.parameter.discordId,
      discordName: e.parameter.discordName,
      serverNickname: e.parameter.serverNickname,
      googleAccounts: e.parameter.googleAccounts.split(',').map(s => s.trim()).filter(Boolean),
      discordUsername: e.parameter.discordUsername || '',
      targetPeriod: e.parameter.targetPeriod || ''
    }))

  } else if (action === 'updateGoogleAccounts') {
    return jsonResponse(updateGoogleAccounts(
      e.parameter.discordId,
      e.parameter.period,
      e.parameter.googleAccounts.split(',').map(s => s.trim()).filter(Boolean),
      e.parameter.serverNickname,
      e.parameter.teamName
    ))

  } else if (action === 'adminUpdateRecord') {
    const accounts = e.parameter.googleAccounts.split(',').map(s => s.trim()).filter(Boolean)
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        filter: {
          and: [
            { property: 'Discord_ID', title: { equals: e.parameter.discordId } },
            { property: '期數', rich_text: { equals: e.parameter.period } }
          ]
        }
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) {
      return jsonResponse({ success: false, error: '找不到對應紀錄' })
    }
    const pageId = data.results[0].id
    const folderUrl = data.results[0].properties['資料夾連結'].url || ''
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        properties: {
          '伺服器暱稱': { rich_text: [{ text: { content: e.parameter.serverNickname || '' } }] },
          '隊伍名稱':   { rich_text: [{ text: { content: e.parameter.teamName || '' } }] },
          'google帳號': { rich_text: [{ text: { content: accounts.join(', ') } }] }
        }
      })
    })
    if (folderUrl) {
      const folderId = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
      if (folderId) {
        accounts.forEach(email => {
          try { setFolderOrganizer(folderId, email) } catch (err) { Logger.log('setFolderOrganizer failed: ' + email + ' - ' + err) }
        })
      }
    }
    return jsonResponse({ success: true })

  } else if (action === 'getPeriodsConfig') {
    let periods = getPeriodsConfig()
    // 若尚未設定新格式，從舊屬性建立初始資料
    if (periods.length === 0) {
      const name = getCurrentPeriod()
      const dates = getActivityDates()
      if (name) {
        periods = [{ name, startDate: dates.startDate, endDate: dates.endDate, extendDate: dates.extendDate, rootFolderId: '' }]
      }
    }
    return jsonResponse({
      periods,
      coverImageUrl: getCoverImageUrl(),
      makeupRootFolder: PropertiesService.getScriptProperties().getProperty('makeupRootFolder') || ''
    })

  } else if (action === 'setPeriodsConfig') {
    if (!isAdminUser(e.parameter.discordId)) return jsonResponse({ error: 'Unauthorized' })
    const periods = JSON.parse(e.parameter.periodsJson || '[]')
    savePeriodsConfig(periods)
    if (e.parameter.coverImageUrl !== undefined) {
      PropertiesService.getScriptProperties().setProperty('coverImageUrl', e.parameter.coverImageUrl || '')
    }
    return jsonResponse({ success: true })

  } else if (action === 'getPeriod') {
    const active = getActivePeriodInfo()
    const allPeriods = getPeriodsConfig()
    return jsonResponse({
      currentPeriod: active.name || '',
      isMakeup: !!active.isMakeup,
      makeupActive: !!active.makeupActive,
      startDate: active.isMakeup ? '' : (active.startDate || ''),
      endDate: active.isMakeup ? '' : (active.endDate || ''),
      extendDate: active.isMakeup ? '' : (active.extendDate || ''),
      coverImageUrl: getCoverImageUrl(),
      makeupRootFolder: PropertiesService.getScriptProperties().getProperty('makeupRootFolder') || '',
      periods: allPeriods
    })

  } else if (action === 'setPeriod') {
    if (!isAdminUser(e.parameter.discordId)) return jsonResponse({ error: 'Unauthorized' })
    const props = PropertiesService.getScriptProperties()
    props.setProperty('currentPeriod', e.parameter.period)
    props.setProperty('startDate',     e.parameter.startDate  || '')
    props.setProperty('endDate',       e.parameter.endDate    || '')
    props.setProperty('extendDate',    e.parameter.extendDate || '')
    props.setProperty('coverImageUrl', e.parameter.coverImageUrl || '')
    props.setProperty('makeupRootFolder', e.parameter.makeupRootFolder || '')
    return jsonResponse({ success: true })

  } else if (action === 'getAdminIds') {
    const raw = (PropertiesService.getScriptProperties().getProperty('adminIds') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const adminList = raw.map(entry => {
      const [id, name] = entry.split('|')
      return { id: id.trim(), name: (name || '').trim() }
    })
    return jsonResponse({ adminList })

  } else if (action === 'addAdminId') {
    const props = PropertiesService.getScriptProperties()
    const raw = (props.getProperty('adminIds') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const ids = raw.map(entry => entry.split('|')[0].trim())
    if (!ids.includes(e.parameter.discordId)) {
      const entry = e.parameter.adminName
        ? `${e.parameter.discordId}|${e.parameter.adminName}`
        : e.parameter.discordId
      raw.push(entry)
      props.setProperty('adminIds', raw.join(','))
    }
    return jsonResponse({ success: true })

  } else if (action === 'removeAdminId') {
    const props = PropertiesService.getScriptProperties()
    const raw = (props.getProperty('adminIds') || '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .filter(entry => entry.split('|')[0].trim() !== e.parameter.discordId)
    props.setProperty('adminIds', raw.join(','))
    return jsonResponse({ success: true })

  } else if (action === 'getAllRecords') {
    return jsonResponse(getAllRecords())

  } else if (action === 'scanSubmissions') {
    return jsonResponse(scanSubmissions(e.parameter.period))

  } else if (action === 'updateReportStatus') {
    return jsonResponse(updateReportStatus(e.parameter.discordId, e.parameter.period))

  } else if (action === 'cancelReportStatus') {
    return jsonResponse(cancelReportStatus(e.parameter.discordId, e.parameter.period))

  } else if (action === 'exportToSheet') {
    const preScanned = e.parameter.submissionData ? JSON.parse(e.parameter.submissionData) : null
    return jsonResponse(exportToSheet(e.parameter.period, false, preScanned))

  } else if (action === 'updateAttendanceStatus') {
    return jsonResponse(updateAttendanceStatus(e.parameter.discordId, e.parameter.period, e.parameter.status))

  } else if (action === 'updateSocialLink') {
    return jsonResponse(updateSocialLink(e.parameter.discordId, e.parameter.period, e.parameter.url || ''))

  } else if (action === 'addLegacyRecord') {
    return jsonResponse(addLegacyRecord(e.parameter))

  } else if (action === 'getTeamsForClaim') {
    return jsonResponse(getTeamsForClaim(e.parameter.period || ''))

  } else if (action === 'claimTeamRecord') {
    return jsonResponse(claimTeamRecord(e.parameter.discordId, e.parameter.username, e.parameter.teamName, e.parameter.period))

  } else if (action === 'findTeamsByEmail') {
    const emails = (e.parameter.emails || '').split(',').map(s => s.trim()).filter(Boolean)
    return jsonResponse(findTeamsByEmail(emails, e.parameter.excludePeriod || ''))

  } else if (action === 'claimRecordByEmail') {
    return jsonResponse(claimRecordByEmail(
      e.parameter.username,
      e.parameter.period,
      e.parameter.teamName,
      e.parameter.attendanceStatus || '全勤'
    ))

  } else if (action === 'backfillLegacyUsernames') {
    return jsonResponse(backfillLegacyUsernames())

  } else if (action === 'batchAddFirstPeriodRecords') {
    return jsonResponse(batchAddFirstPeriodRecords())

  } else if (action === 'getSquadPosts') {
    return jsonResponse(getSquadPosts())

  } else if (action === 'createSquadPost') {
    return jsonResponse(createSquadPost({
      nickname: e.parameter.nickname,
      message:  e.parameter.message,
      type:     e.parameter.type,
      slots:    e.parameter.slots
    }))

  } else if (action === 'getProfile') {
    return jsonResponse({ success: true, profileEmail: getProfileEmail(e.parameter.discordId) })

  } else if (action === 'saveProfile') {
    return jsonResponse(saveProfile(e.parameter.discordId, e.parameter.email))

  } else if (action === 'getUserInfo') {
    return jsonResponse({ success: true, userInfo: getUserInfo(e.parameter.discordId) })

  } else if (action === 'saveUserInfo') {
    return jsonResponse(saveUserInfo(e.parameter.discordId, e.parameter.nickname, e.parameter.type, e.parameter.teamName))

  } else if (action === 'acceptTeamInvite') {
    return jsonResponse(acceptTeamInvite(
      e.parameter.discordId, e.parameter.discordName, e.parameter.discordUsername,
      e.parameter.period, e.parameter.teamPageId
    ))

  } else if (action === 'declineTeamInvite') {
    return jsonResponse(declineTeamInvite(e.parameter.discordId, e.parameter.teamPageId))

  } else if (action === 'adminPanel') {
    return HtmlService.createHtmlOutput(getAdminPanelHtml(e.parameter.secret))
      .setTitle('月月繪管理面板')

  } else if (action === 'backfillUserProfiles') {
    return jsonResponse(backfillUserProfiles())

  } else if (action === 'clearTestAccount') {
    return jsonResponse(clearTestAccount())

  } else if (action === 'migrateRootFolder') {
    return jsonResponse(migrateRootFolder(e.parameter.newRootFolderId))

  } else if (action === 'resetMonthlyQuota') {
    return jsonResponse(resetMonthlyQuota())

  } else {
    return jsonResponse({ error: 'Unknown action' })
  }
}

// ── Discord OAuth ─────────────────────────────────────────────
function getDiscordUser(code, redirectUri) {
  try {
    const tokenResponse = UrlFetchApp.fetch('https://discord.com/api/oauth2/token', {
      method: 'post',
      payload: {
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
      }
    })
    const tokenData = JSON.parse(tokenResponse.getContentText())
    const accessToken = tokenData.access_token
    const userResponse = UrlFetchApp.fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const user = JSON.parse(userResponse.getContentText())
    return { id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar }
  } catch (err) {
    return { error: err.toString() }
  }
}

// ── 建立資料夾 ────────────────────────────────────────────────
function createFolder(data) {
  try {
    // 驗證 discordId 為合法的 Discord Snowflake（17-20 位數字），防止假 ID 灌水
    if (!/^\d{17,20}$/.test(data.discordId || '')) {
      return { success: false, error: '無效的 Discord ID' }
    }
    // 全域速率限制：每小時最多 30 次建檔請求，防止自動化腳本刷 Drive 資料夾
    if (!checkGlobalRateLimit('createFolder', 30)) {
      return { success: false, error: '目前建檔請求過多，請稍後再試' }
    }
    const allPeriods = getPeriodsConfig()
    if (!data.targetPeriod) return { success: false, error: '請指定期數' }
    const targetConfig = allPeriods.find(p => p.name === data.targetPeriod)
    if (!targetConfig || !targetConfig.open) return { success: false, error: '指定期數未開放建檔' }
    const period = data.targetPeriod
    const rootFolderId = targetConfig.rootFolderId || ROOT_FOLDER_ID

    const existing = getUserRecords(data.discordId)
    if (existing.records && existing.records.some(r => r.period === period)) {
      return { success: false, error: 'already_registered' }
    }
    const rootFolder = DriveApp.getFolderById(rootFolderId)
    const folderName = data.type === 'team'
      ? `月月繪${period}-${data.teamName}`
      : `月月繪${period}-${data.discordName}`
    const mainFolder = rootFolder.createFolder(folderName)
    mainFolder.createFolder('基礎')
    mainFolder.createFolder('進階')
    const doc = DocumentApp.create(`${folderName}-心得`)
    DriveApp.getFileById(doc.getId()).moveTo(mainFolder)
    data.googleAccounts.forEach(email => {
      if (email) try { setFolderOrganizer(mainFolder.getId(), email) } catch (err) { Logger.log('setFolderOrganizer failed: ' + email + ' - ' + err) }
    })
    addToNotion({
      discordId: data.discordId,
      discordName: data.discordName,
      discordUsername: data.discordUsername,
      serverNickname: data.serverNickname,
      type: data.type,
      teamName: data.teamName,
      googleAccounts: data.googleAccounts,
      folderUrl: mainFolder.getUrl(),
      period: period
    })
    return { success: true, folderUrl: mainFolder.getUrl(), folderName: folderName, currentPeriod: period }
  } catch (err) {
    return { error: err.toString() }
  }
}

// ── 寫入 Notion ───────────────────────────────────────────────
function addToNotion(data) {
  try {
    const payload = {
      parent: { database_id: NOTION_DATABASE_ID },
      properties: {
        'Discord_ID':       { title: [{ text: { content: data.discordId } }] },
        'Discord_名稱':     { rich_text: [{ text: { content: data.discordName } }] },
        'Discord_Username': { rich_text: [{ text: { content: data.discordUsername || '' } }] },
        '伺服器暱稱':       { rich_text: [{ text: { content: data.serverNickname } }] },
        '期數':             { rich_text: [{ text: { content: data.period } }] },
        '類型':         { rich_text: [{ text: { content: data.type === 'team' ? '團體' : '個人' } }] },
        '隊伍名稱':     { rich_text: [{ text: { content: data.teamName || '' } }] },
        'google帳號':   { rich_text: [{ text: { content: data.googleAccounts.join(', ') } }] },
        '資料夾連結':   { url: data.folderUrl }
      }
    }
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify(payload)
    })
    return true
  } catch (err) {
    Logger.log('Notion error: ' + err.toString())
    return false
  }
}

// ── 查詢個人紀錄 ──────────────────────────────────────────────
function getUserRecords(discordId, discordUsername) {
  try {
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    }

    const notionUrl = `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`

    // 第一、二步平行：同時查 discordId + legacy username
    const batch1 = [
      {
        url: notionUrl, method: 'post', headers: headers,
        payload: JSON.stringify({ filter: { property: 'Discord_ID', title: { equals: discordId } } }),
        muteHttpExceptions: true
      }
    ]
    if (discordUsername) {
      batch1.push({
        url: notionUrl, method: 'post', headers: headers,
        payload: JSON.stringify({
          filter: { and: [
            { property: 'Discord_ID', title: { starts_with: 'legacy_' } },
            { property: 'Discord_Username', rich_text: { equals: discordUsername } }
          ]}
        }),
        muteHttpExceptions: true
      })
    }
    const batch1Res = UrlFetchApp.fetchAll(batch1)
    let allPages = JSON.parse(batch1Res[0].getContentText()).results || []
    if (discordUsername && batch1Res[1]) {
      allPages = [...allPages, ...(JSON.parse(batch1Res[1].getContentText()).results || [])]
    }

    // 第三步：批次查改名舊 username（平行送出所有請求）
    const seenUsernames = new Set(discordUsername ? [discordUsername] : [])
    const usernamesToFetch = []
    for (const page of allPages) {
      const did = page.properties['Discord_ID'].title[0]?.text.content || ''
      if (!did.startsWith('legacy_')) {
        const storedUsername = page.properties['Discord_Username']?.rich_text[0]?.text.content || ''
        if (storedUsername && !seenUsernames.has(storedUsername)) {
          seenUsernames.add(storedUsername)
          usernamesToFetch.push(storedUsername)
        }
      }
    }
    if (usernamesToFetch.length > 0) {
      const batch3 = usernamesToFetch.map(u => ({
        url: notionUrl, method: 'post', headers: headers,
        payload: JSON.stringify({
          filter: { and: [
            { property: 'Discord_ID', title: { starts_with: 'legacy_' } },
            { property: 'Discord_Username', rich_text: { equals: u } }
          ]}
        }),
        muteHttpExceptions: true
      }))
      const batch3Res = UrlFetchApp.fetchAll(batch3)
      for (const r of batch3Res) {
        allPages = [...allPages, ...(JSON.parse(r.getContentText()).results || [])]
      }
    }

    // 第四步：profile email 查詢（與第三步已平行，這步獨立一輪）
    if (discordId) {
      const profileEmail = getProfileEmail(discordId)
      if (profileEmail) {
        const seenIds = new Set(allPages.map(p => p.id))
        const declinedRaw = PropertiesService.getScriptProperties().getProperty('declined_invites_' + discordId) || '[]'
        const declinedSet = new Set(JSON.parse(declinedRaw))
        const res4 = UrlFetchApp.fetch(notionUrl, {
          method: 'post', headers: headers,
          muteHttpExceptions: true,
          payload: JSON.stringify({
            filter: { and: [
              { property: 'google帳號', rich_text: { contains: profileEmail } },
              { property: 'Discord_ID', title: { does_not_equal: discordId } }
            ]}
          })
        })
        const emailPages = JSON.parse(res4.getContentText()).results || []
        for (const page of emailPages) {
          if (!seenIds.has(page.id) && !declinedSet.has(page.id)) {
            page._linkedViaEmail = true
            allPages.push(page)
            seenIds.add(page.id)
          }
        }
      }
    }

    // 過濾掉 profile 特殊紀錄（期數="profile"）
    allPages = allPages.filter(page => (page.properties['期數']?.rich_text[0]?.text.content || '') !== 'profile')

    const records = allPages.map(page => {
      const did = page.properties['Discord_ID'].title[0]?.text.content || ''
      const rawReport = page.properties['回報狀態']?.rich_text[0]?.text.content || ''
      const rawAttendance = page.properties['全勤']?.rich_text[0]?.text.content || ''
      return {
        discordId:        did,
        isLegacy:         did.startsWith('legacy_'),
        period:           page.properties['期數'].rich_text[0]?.text.content || '',
        type:             page.properties['類型'].rich_text[0]?.text.content || '',
        teamName:         page.properties['隊伍名稱'].rich_text[0]?.text.content || '',
        serverNickname:   page.properties['伺服器暱稱'].rich_text[0]?.text.content || '',
        folderUrl:        page.properties['資料夾連結'].url || '',
        googleAccounts:   (page.properties['google帳號'].rich_text[0]?.text.content || '').split(',').map(s => s.trim()).filter(Boolean),
        username:         page.properties['Discord_Username']?.rich_text[0]?.text.content || '',
        createdTime:      page.properties['建立時間']?.created_time || '',
        reportStatus:     rawReport === '已完成' ? '已完成' : '',
        attendanceStatus: rawAttendance || (['全勤','未全勤'].includes(rawReport) ? rawReport : ''),
        reportTime:       page.properties['回報時間']?.rich_text[0]?.text.content || '',
        socialLink:       page.properties['社群連結']?.url || '',
        linkedViaEmail:   !!page._linkedViaEmail,
        notionPageId:     page.id
      }
    })

    return { success: true, records: records }
  } catch (err) {
    return { error: err.toString() }
  }
}

// ── 更新 Google 帳號 ──────────────────────────────────────────
function updateGoogleAccounts(discordId, period, newAccounts, serverNickname, teamName) {
  try {
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        filter: {
          and: [
            { property: 'Discord_ID', title: { equals: discordId } },
            { property: '期數', rich_text: { equals: period } }
          ]
        }
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) {
      return { success: false, error: '找不到對應紀錄' }
    }
    const pageId = data.results[0].id
    const folderUrl = data.results[0].properties['資料夾連結'].url || ''
    const props = { 'google帳號': { rich_text: [{ text: { content: newAccounts.join(', ') } }] } }
    if (serverNickname !== undefined) {
      props['伺服器暱稱'] = { rich_text: [{ text: { content: serverNickname } }] }
    }
    if (teamName !== undefined) {
      props['隊伍名稱'] = { rich_text: [{ text: { content: teamName } }] }
    }
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({ properties: props })
    })
    if (folderUrl) {
      const folderId = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
      if (folderId) {
        newAccounts.forEach(email => {
          try { setFolderOrganizer(folderId, email) } catch (err) { Logger.log('setFolderOrganizer failed: ' + email + ' - ' + err) }
        })
      }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 更新回報狀態 ──────────────────────────────────────────────
function updateReportStatus(discordId, period) {
  try {
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        filter: {
          and: [
            { property: 'Discord_ID', title: { equals: discordId } },
            { property: '期數', rich_text: { equals: period } }
          ]
        }
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) {
      return { success: false, error: '找不到對應紀錄' }
    }
    const pageId = data.results[0].id
    const reportTime = new Date().toISOString()
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        properties: {
          '回報狀態': { rich_text: [{ text: { content: '已完成' } }] },
          '回報時間': { rich_text: [{ text: { content: reportTime } }] }
        }
      })
    })
    return { success: true, reportTime: reportTime }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 取消回報狀態 ──────────────────────────────────────────────
function cancelReportStatus(discordId, period) {
  try {
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        filter: {
          and: [
            { property: 'Discord_ID', title: { equals: discordId } },
            { property: '期數', rich_text: { equals: period } }
          ]
        }
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) {
      return { success: false, error: '找不到對應紀錄' }
    }
    const pageId = data.results[0].id
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'patch',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      payload: JSON.stringify({
        properties: {
          '回報狀態': { rich_text: [{ text: { content: '' } }] },
          '回報時間': { rich_text: [{ text: { content: '' } }] }
        }
      })
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 掃描單筆繳交狀態 ─────────────────────────────────────────
function scanSingleRecord(rec) {
  if (!rec.folderUrl) return { basic: null, advanced: null, reflection: null }
  const folderId = rec.folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
  if (!folderId) return { basic: null, advanced: null, reflection: null }
  try {
    const folder = DriveApp.getFolderById(folderId)
    const checkSubfolder = (name) => {
      const it = folder.getFoldersByName(name)
      if (!it.hasNext()) return false
      const sub = it.next()
      return sub.getFiles().hasNext() || sub.getFolders().hasNext()
    }
    let reflection = false
    const files = folder.getFiles()
    while (files.hasNext()) {
      const f = files.next()
      if (f.getName().includes('心得') && f.getMimeType() === MimeType.GOOGLE_DOCS) {
        reflection = DocumentApp.openById(f.getId()).getBody().getText().trim().length > 0
        break
      }
    }
    return { basic: checkSubfolder('基礎'), advanced: checkSubfolder('進階'), reflection }
  } catch (err) {
    return { basic: null, advanced: null, reflection: null, note: err.message }
  }
}

// ── 掃描繳交狀態（整期）────────────────────────────────────────
function scanSubmissions(period) {
  if (!period) return { success: false, error: '缺少 period 參數' }
  const allResult = getAllRecords()
  if (!allResult.success) return { success: false, error: '取得紀錄失敗' }
  const records = allResult.records.filter(r => r.period === period)
  const results = records.map(rec => {
    const base = { discordId: rec.discordId, name: rec.serverNickname || rec.discordName }
    if (!rec.folderUrl) return { ...base, basic: null, advanced: null, reflection: null, note: '無資料夾連結' }
    const folderId = rec.folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
    if (!folderId) return { ...base, basic: null, advanced: null, reflection: null, note: '無法解析資料夾 ID' }
    const sub = scanSingleRecord(rec)
    return { ...base, ...sub }
  })
  return { success: true, results }
}

// ── 匯出到 Google 試算表 ──────────────────────────────────────
// skipScan=true 時略過 Drive/Docs 掃描（供自動觸發使用，避免逾時）
// preScanned: 前端已掃好的 { 'discordId_period': { basic, advanced, reflection } }，有則直接用
function exportToSheet(period, skipScan, preScanned) {
  try {
    const allResult = getAllRecords()
    if (!allResult.success) return { success: false, error: '取得紀錄失敗：' + (allResult.error || JSON.stringify(allResult)) }

    const records = period
      ? allResult.records.filter(r => r.period === period)
      : allResult.records

    const submissionMap = {}
    if (preScanned) {
      Object.assign(submissionMap, preScanned)
    } else if (!skipScan) {
      records.forEach(rec => {
        submissionMap[rec.discordId + '_' + rec.period] = scanSingleRecord(rec)
      })
    }

    const sheetName = period ? `月月繪名單_${period}` : '月月繪名單_全部'
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID)

    let ss = null
    const files = rootFolder.getFilesByName(sheetName)
    if (files.hasNext()) {
      ss = SpreadsheetApp.openById(files.next().getId())
    } else {
      ss = SpreadsheetApp.create(sheetName)
      DriveApp.getFileById(ss.getId()).moveTo(rootFolder)
    }

    const sheet = ss.getActiveSheet()
    sheet.setName('參加者名單')
    sheet.clearContents()

    const headers = [
      'Discord名稱', '伺服器暱稱', '類型', '隊伍名稱',
      'Google帳號', '資料夾連結', '回報狀態', '全勤', '回報時間', '建立時間', '期數',
      '基礎', '進階', '心得', '社群連結'
    ]
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#5865F2')
      .setFontColor('white')

    if (records.length > 0) {
      const rows = records.map(r => {
        const sub = submissionMap[r.discordId + '_' + r.period] || {}
        return [
          r.discordName || '',
          r.serverNickname || '',
          r.type || '',
          r.teamName || '',
          Array.isArray(r.googleAccounts) ? r.googleAccounts.join(', ') : (r.googleAccounts || ''),
          r.folderUrl || '',
          r.reportStatus === '已完成' ? '已回報' : '未回報',
          r.attendanceStatus || '',
          r.reportTime ? r.reportTime.split('T')[0] : '',
          r.createdTime ? r.createdTime.split('T')[0] : '',
          r.period || '',
          sub.basic === true ? '✓' : sub.basic === false ? '✗' : '-',
          sub.advanced === true ? '✓' : sub.advanced === false ? '✗' : '-',
          sub.reflection === true ? '✓' : sub.reflection === false ? '✗' : '-',
          r.socialLink || ''
        ]
      })
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows)
    }

    sheet.autoResizeColumns(1, headers.length)
    return { success: true, sheetUrl: ss.getUrl() }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 查詢所有紀錄（管理員用）──────────────────────────────────
function getAllRecords() {
  try {
    const allResults = []
    let cursor = undefined
    do {
      const body = { page_size: 100 }
      if (cursor) body.start_cursor = cursor
      const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
        method: 'post',
        headers: {
          'Authorization': `Bearer ${NOTION_TOKEN}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        payload: JSON.stringify(body)
      })
      const data = JSON.parse(response.getContentText())
      allResults.push(...data.results)
      cursor = data.has_more ? data.next_cursor : undefined
    } while (cursor)

    const records = allResults
    .filter(page => (page.properties['期數']?.rich_text[0]?.text.content || '') !== 'profile')
    .map(page => {
      const rawReport = page.properties['回報狀態']?.rich_text[0]?.text.content || ''
      const rawAttendance = page.properties['全勤']?.rich_text[0]?.text.content || ''
      return {
        discordId:        page.properties['Discord_ID'].title[0]?.text.content || '',
        discordName:      page.properties['Discord_名稱'].rich_text[0]?.text.content || '',
        username:         page.properties['Discord_Username']?.rich_text[0]?.text.content || '',
        serverNickname:   page.properties['伺服器暱稱'].rich_text[0]?.text.content || '',
        period:           page.properties['期數'].rich_text[0]?.text.content || '',
        type:             page.properties['類型'].rich_text[0]?.text.content || '',
        teamName:         page.properties['隊伍名稱'].rich_text[0]?.text.content || '',
        googleAccounts:   (page.properties['google帳號'].rich_text[0]?.text.content || '').split(',').map(s => s.trim()).filter(Boolean),
        folderUrl:        page.properties['資料夾連結'].url || '',
        createdTime:      page.properties['建立時間']?.created_time || '',
        reportStatus:     rawReport === '已完成' ? '已完成' : '',
        attendanceStatus: rawAttendance || (['全勤','未全勤'].includes(rawReport) ? rawReport : ''),
        reportTime:       page.properties['回報時間']?.rich_text[0]?.text.content || '',
        socialLink:       page.properties['社群連結']?.url || ''
      }
    })
    return { success: true, records: records }
  } catch (err) {
    return { error: err.toString() }
  }
}

// ── 更新社群打卡連結 ──────────────────────────────────────────
function updateSocialLink(discordId, period, url) {
  try {
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: 'Discord_ID', title: { equals: discordId } },
          { property: '期數', rich_text: { equals: period } }
        ]}
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) return { success: false, error: '找不到對應紀錄' }
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${data.results[0].id}`, {
      method: 'patch', headers,
      payload: JSON.stringify({
        properties: { '社群連結': url ? { url } : { url: null } }
      })
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 更新全勤狀態（管理員用，團體自動連動隊員）───────────────
function updateAttendanceStatus(discordId, period, status) {
  try {
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    const response = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: 'Discord_ID', title: { equals: discordId } },
          { property: '期數', rich_text: { equals: period } }
        ]}
      })
    })
    const data = JSON.parse(response.getContentText())
    if (!data.results || data.results.length === 0) return { success: false, error: '找不到紀錄' }
    const page = data.results[0]
    const pageId = page.id
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'patch', headers,
      payload: JSON.stringify({ properties: { '全勤': { rich_text: [{ text: { content: status } }] } } })
    })

    // 若為團體，連動所有信箱對應的成員紀錄
    const type = page.properties['類型']?.rich_text[0]?.text.content || ''
    if (type === '團體') {
      const emailsRaw = page.properties['google帳號']?.rich_text[0]?.text.content || ''
      const emails = emailsRaw.split(',').map(s => s.trim()).filter(Boolean)
      for (const email of emails) {
        try {
          const mRes = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
            method: 'post', headers,
            payload: JSON.stringify({
              filter: { and: [
                { property: 'google帳號', rich_text: { contains: email } },
                { property: '期數', rich_text: { equals: period } },
                { property: 'Discord_ID', title: { does_not_equal: discordId } }
              ]}
            })
          })
          const mPages = JSON.parse(mRes.getContentText()).results || []
          for (const mp of mPages) {
            UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${mp.id}`, {
              method: 'patch', headers,
              payload: JSON.stringify({ properties: { '全勤': { rich_text: [{ text: { content: status } }] } } })
            })
          }
        } catch (e) { Logger.log('propagate attendance error: ' + e) }
      }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 新增歷史參加者（管理員用）────────────────────────────────
function addLegacyRecord(params) {
  try {
    const username = params.username || ''
    const providedId = (params.discordId || '').trim()
    const discordId = params.type === '團體'
      ? `legacy_team_${params.teamName || username}`
      : (providedId ? providedId : `legacy_${username}`)
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    const dupCheck = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: 'Discord_ID', title: { equals: discordId } },
          { property: '期數', rich_text: { equals: params.period } }
        ]}
      })
    })
    if ((JSON.parse(dupCheck.getContentText()).results || []).length > 0) {
      return { success: false, error: `此紀錄已存在（${discordId} ／ ${params.period}）` }
    }
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post',
      headers,
      payload: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          'Discord_ID':       { title: [{ text: { content: discordId } }] },
          'Discord_名稱':     { rich_text: [{ text: { content: params.discordName || username } }] },
          'Discord_Username': { rich_text: [{ text: { content: username } }] },
          '伺服器暱稱':       { rich_text: [{ text: { content: params.serverNickname || params.discordName || username } }] },
          '期數':             { rich_text: [{ text: { content: params.period } }] },
          '類型':             { rich_text: [{ text: { content: params.type === '團體' ? '團體' : '個人' } }] },
          '隊伍名稱':         { rich_text: [{ text: { content: params.teamName || '' } }] },
          'google帳號':       { rich_text: [{ text: { content: '' } }] },
          '資料夾連結':       { url: null },
          '回報狀態':         { rich_text: [{ text: { content: '' } }] },
          '全勤':             { rich_text: [{ text: { content: params.fullAttendance === 'true' ? '全勤' : '未全勤' } }] }
        }
      })
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 取得歷史期數與隊伍列表（供認領下拉選單）─────────────────
function getTeamsForClaim(period) {
  try {
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    }
    if (!period) {
      const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
        method: 'post', headers,
        payload: JSON.stringify({
          filter: { property: 'Discord_ID', title: { starts_with: 'legacy_team_' } }
        })
      })
      const pages = JSON.parse(res.getContentText()).results || []
      const periods = [...new Set(pages.map(p => p.properties['期數'].rich_text[0]?.text.content || '').filter(Boolean))]
      return { success: true, periods }
    } else {
      const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
        method: 'post', headers,
        payload: JSON.stringify({
          filter: { and: [
            { property: 'Discord_ID', title: { starts_with: 'legacy_team_' } },
            { property: '期數', rich_text: { equals: period } }
          ]}
        })
      })
      const pages = JSON.parse(res.getContentText()).results || []
      const teams = pages.map(p => p.properties['隊伍名稱'].rich_text[0]?.text.content || '').filter(Boolean)
      return { success: true, teams }
    }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 認領團體紀錄（參加者自助）────────────────────────────────
function claimTeamRecord(discordId, username, teamName, period) {
  try {
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    }
    const checkRes = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: 'Discord_ID', title: { equals: `legacy_${username}` } },
          { property: '期數', rich_text: { equals: period } }
        ]}
      })
    })
    if ((JSON.parse(checkRes.getContentText()).results || []).length > 0) {
      return { success: false, error: '你已經認領過這期的紀錄了' }
    }
    const teamRes = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: '期數', rich_text: { equals: period } },
          { property: '隊伍名稱', rich_text: { equals: teamName } },
          { property: 'Discord_ID', title: { starts_with: 'legacy_team_' } }
        ]}
      })
    })
    const teamResults = JSON.parse(teamRes.getContentText()).results || []
    if (teamResults.length === 0) return { success: false, error: '找不到對應的隊伍紀錄，請確認期數和隊伍名稱' }
    const teamPage = teamResults[0]
    const rawTeamReport = teamPage.properties['回報狀態']?.rich_text[0]?.text.content || ''
    const rawTeamAttendance = teamPage.properties['全勤']?.rich_text[0]?.text.content || ''
    const attendanceStatus = rawTeamAttendance || (['全勤','未全勤'].includes(rawTeamReport) ? rawTeamReport : '全勤')
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', headers,
      payload: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          'Discord_ID':       { title: [{ text: { content: `legacy_${username}` } }] },
          'Discord_名稱':     { rich_text: [{ text: { content: username } }] },
          'Discord_Username': { rich_text: [{ text: { content: username } }] },
          '伺服器暱稱':       { rich_text: [{ text: { content: username } }] },
          '期數':             { rich_text: [{ text: { content: period } }] },
          '類型':             { rich_text: [{ text: { content: '團體' } }] },
          '隊伍名稱':         { rich_text: [{ text: { content: teamName } }] },
          'google帳號':       { rich_text: [{ text: { content: '' } }] },
          '資料夾連結':       { url: null },
          '回報狀態':         { rich_text: [{ text: { content: '' } }] },
          '全勤':             { rich_text: [{ text: { content: attendanceStatus } }] }
        }
      })
    })
    return {
      success: true,
      record: {
        discordId: `legacy_${username}`,
        isLegacy: true,
        period, type: '團體', teamName,
        serverNickname: username,
        folderUrl: '', googleAccounts: [], username,
        createdTime: '', reportStatus: '', attendanceStatus, reportTime: ''
      }
    }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 批次回填舊用戶個人資料（一次性執行）────────────────────────
function backfillUserProfiles() {
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  }

  // 分頁撈全部紀錄（排除 period="profile" 特殊紀錄）
  let allPages = []
  let cursor
  do {
    const payload = { page_size: 100 }
    if (cursor) payload.start_cursor = cursor
    const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers, payload: JSON.stringify(payload)
    })
    const data = JSON.parse(res.getContentText())
    allPages = [...allPages, ...(data.results || [])]
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)

  // 過濾掉 profile 紀錄，每個真實 Discord ID 取最新紀錄
  const byId = {}
  for (const page of allPages) {
    const did = page.properties['Discord_ID']?.title[0]?.text.content || ''
    if (!did || !/^\d{17,20}$/.test(did)) continue
    const period = page.properties['期數']?.rich_text[0]?.text.content || ''
    if (period === 'profile') continue
    const t = page.properties['建立時間']?.created_time || ''
    if (!byId[did] || t > (byId[did].t || '')) byId[did] = { page, t }
  }

  let backfilled = 0
  let skipped = 0
  for (const [did, { page }] of Object.entries(byId)) {
    // 若已有 Notion profile 紀錄則跳過
    if (_getProfilePage(did)) { skipped++; continue }

    const nickname = page.properties['伺服器暱稱']?.rich_text[0]?.text.content || ''
    if (!nickname) continue

    const typeRaw = page.properties['類型']?.rich_text[0]?.text.content || ''
    const type = typeRaw === '團體' ? 'team' : 'personal'
    const teamName = page.properties['隊伍名稱']?.rich_text[0]?.text.content || ''

    // 個人且只有一個信箱 → 一起存入 profile
    let email = ''
    if (type === 'personal') {
      const raw = page.properties['google帳號']?.rich_text[0]?.text.content || ''
      const emails = raw.split(',').map(s => s.trim()).filter(Boolean)
      if (emails.length === 1 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emails[0])) {
        email = emails[0].toLowerCase()
      }
    }

    // 寫入 Notion profile 紀錄
    const username = page.properties['Discord_Username']?.rich_text[0]?.text.content || ''
    _upsertProfilePage(did, {
      '伺服器暱稱': { rich_text: [{ text: { content: nickname } }] },
      '類型':       { rich_text: [{ text: { content: type === 'team' ? 'team' : 'personal' } }] },
      '隊伍名稱':   { rich_text: [{ text: { content: teamName } }] },
      'google帳號': { rich_text: [{ text: { content: email } }] },
      'Discord_Username': { rich_text: [{ text: { content: username } }] }
    })

    // 同步寫 PropertiesService cache
    const props = PropertiesService.getScriptProperties()
    props.setProperty('user_info_' + did, JSON.stringify({ nickname, type, teamName }))
    if (email) props.setProperty('profile_email_' + did, email)

    backfilled++
    Utilities.sleep(200) // 避免 Notion API rate limit
  }
  Logger.log(`完成：共 ${Object.keys(byId).length} 位用戶，回填 ${backfilled} 筆，已有 profile ${skipped} 筆`)
  return { success: true, total: Object.keys(byId).length, backfilled, skipped }
}

// ── 測試帳號清除工具（手動執行用）──────────────────────────────
function clearTestAccount() {
  const discordId = '858395819492900875'
  const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }

  // 清 PropertiesService cache
  const p = PropertiesService.getScriptProperties()
  p.deleteProperty('user_info_' + discordId)
  p.deleteProperty('profile_email_' + discordId)
  p.deleteProperty('declined_invites_' + discordId)

  // 撈並 archive 所有 Notion 紀錄（包含 profile + 期數紀錄）
  const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'post', headers,
    payload: JSON.stringify({ filter: { property: 'Discord_ID', title: { equals: discordId } } })
  })
  const pages = JSON.parse(res.getContentText()).results || []
  for (const page of pages) {
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'patch', headers,
      payload: JSON.stringify({ archived: true })
    })
  }

  Logger.log(`清除完成：${discordId}，共 archive ${pages.length} 筆 Notion 紀錄`)
  return { success: true, discordId, archived: pages.length }
}

// ── 主資料夾遷移（把所有子資料夾移到新 root）────────────────────
function migrateRootFolder(newRootFolderId) {
  if (!newRootFolderId) return { success: false, error: '請提供 newRootFolderId' }
  try {
    const oldRoot = DriveApp.getFolderById(ROOT_FOLDER_ID)
    const newRoot = DriveApp.getFolderById(newRootFolderId)
    const it = oldRoot.getFolders()
    let moved = 0
    while (it.hasNext()) {
      const folder = it.next()
      newRoot.addFolder(folder)
      oldRoot.removeFolder(folder)
      moved++
    }
    // 更新 PropertiesService 的 ROOT_FOLDER_ID（需重新部署才生效於程式碼常數）
    PropertiesService.getScriptProperties().setProperty('rootFolderIdOverride', newRootFolderId)
    return { success: true, moved, note: '資料夾 ID 不變，Notion 連結依然有效。請手動更新 GAS 程式碼中的 ROOT_FOLDER_ID 後重新部署。' }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 管理面板 HTML ─────────────────────────────────────────────
function getAdminPanelHtml(secret) {
  const url = ScriptApp.getService().getUrl()
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>月月繪管理面板</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; max-width: 620px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
  h1 { color: #5865F2; font-size: 22px; margin-bottom: 4px; }
  .sub { color: #888; font-size: 13px; margin-bottom: 32px; }
  .card { background: white; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
  h2 { font-size: 14px; color: #555; margin: 0 0 12px; text-transform: uppercase; letter-spacing: .5px; }
  .desc { font-size: 13px; color: #888; margin-bottom: 12px; line-height: 1.5; }
  button { padding: 9px 18px; border: none; border-radius: 8px; background: #5865F2; color: white; cursor: pointer; font-size: 14px; margin-right: 8px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.danger { background: #e53e3e; }
  input { width: 100%; padding: 9px 12px; border: 1.5px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 10px; }
  #log { margin-top: 24px; background: #1e1e2e; color: #cdd6f4; border-radius: 10px; padding: 16px; font-size: 13px; font-family: monospace; white-space: pre-wrap; min-height: 60px; display: none; }
</style>
</head>
<body>
<h1>🎨 月月繪管理面板</h1>
<p class="sub">手動維護工具，所有操作皆即時執行</p>

<div class="card">
  <h2>用戶資料回填</h2>
  <p class="desc">將舊用戶（沒有 Notion profile 紀錄）的暱稱、類型、信箱回填到 Notion。已有 profile 的不會覆蓋。</p>
  <button onclick="run('backfillUserProfiles')">執行回填</button>
</div>

<div class="card">
  <h2>清除測試帳號</h2>
  <p class="desc">清除測試用小號（858395819492900875）的 PropertiesService cache 與 Notion profile 紀錄。</p>
  <button class="danger" onclick="run('clearTestAccount')">清除小號</button>
</div>

<div class="card">
  <h2>主資料夾遷移</h2>
  <p class="desc">把目前主資料夾下所有子資料夾搬移到新資料夾。Notion 中的資料夾連結不變（ID 不會改）。完成後請手動更新 GAS 程式碼中的 ROOT_FOLDER_ID。</p>
  <input id="newRoot" placeholder="新主資料夾 ID（URL 中 /folders/XXXXX 的部分）">
  <button onclick="runMigrate()">開始搬移</button>
</div>

<div id="log"></div>

<script>
const BASE = '${url}'
const SECRET = '${secret}'

function log(msg, data) {
  const el = document.getElementById('log')
  el.style.display = 'block'
  el.textContent = msg + (data ? '\\n' + JSON.stringify(data, null, 2) : '')
}

async function run(action, params) {
  log('執行中：' + action + '…')
  const qs = new URLSearchParams({ action, secret: SECRET, ...(params || {}) })
  try {
    const res = await fetch(BASE + '?' + qs)
    const data = await res.json()
    log('完成：' + action, data)
  } catch (e) {
    log('錯誤：' + e.message)
  }
}

function runMigrate() {
  const id = document.getElementById('newRoot').value.trim()
  if (!id) { alert('請填入新主資料夾 ID'); return }
  if (!confirm('確定要搬移所有資料夾到新的 root？此操作無法自動還原。')) return
  run('migrateRootFolder', { newRootFolderId: id })
}
</script>
</body>
</html>`
}

// ── 補齊第二期 Discord_Username（一次性執行）───────────────────
function backfillLegacyUsernames() {
  const pairs = [
    { discordId: '1471443401382559844', legacyUsername: 'wennercoal' },
    { discordId: '821989584464379925',  legacyUsername: 'nowordcat' },
    { discordId: '570904517391024128',  legacyUsername: 'nekomata030' },
    { discordId: '573778227907264533',  legacyUsername: 'ihatedrawing520' },
    { discordId: '481738908112125953',  legacyUsername: 'asu.0420' },
    { discordId: '384304386236481537',  legacyUsername: 'huan_huan' },
    { discordId: '1410590299792609325', legacyUsername: 'd_ipper_04920' },
    { discordId: '573392282754220052',  legacyUsername: 'tonyjunior0' },
    { discordId: '637704300981911583',  legacyUsername: 'fangzhou3546' },
    { discordId: '766127195000668211',  legacyUsername: 'mi0099' },
    { discordId: '478549614098645023',  legacyUsername: 'migo0512' },
    { discordId: '409275077616599043',  legacyUsername: 'yingya' },
    { discordId: '976085219276902421',  legacyUsername: 'ersa6208' },
    { discordId: '342673754180157442',  legacyUsername: 'kachu27' },
    { discordId: '790132430140211222',  legacyUsername: 'jane_sami' },
    { discordId: '1306989266798247956', legacyUsername: 'wuyan010' },
    { discordId: '1286565632007208960', legacyUsername: 'yikemianhua' },
    { discordId: '967276205504094279',  legacyUsername: 'Mila91.93' },
    { discordId: '1441327209615855716', legacyUsername: 'teapal_arto' },
    { discordId: '700253001105014794',  legacyUsername: 'AndrewTsang' },
    { discordId: '883662013857955850',  legacyUsername: 'haruka_116' },
    { discordId: '951063882351390720',  legacyUsername: 'akira_ben_jin' },
    { discordId: '462421404424339456',  legacyUsername: 'andychenx11' },
    { discordId: '969501493545795594',  legacyUsername: 'alishatsai8512' },
    { discordId: '847087980526436383',  legacyUsername: 'white_cloud952557' },
    { discordId: '292920528384294923',  legacyUsername: 'saki_0614' },
  ]
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  }
  const results = []
  for (const pair of pairs) {
    const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: {
          and: [
            { property: 'Discord_ID', title: { equals: pair.discordId } },
            { property: '期數', rich_text: { equals: '第二期' } }
          ]
        }
      })
    })
    const pages = JSON.parse(res.getContentText()).results || []
    if (pages.length === 0) {
      results.push({ discordId: pair.discordId, status: '找不到紀錄' })
      continue
    }
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${pages[0].id}`, {
      method: 'patch', headers,
      payload: JSON.stringify({
        properties: {
          'Discord_Username': { rich_text: [{ text: { content: pair.legacyUsername } }] }
        }
      })
    })
    results.push({ discordId: pair.discordId, legacyUsername: pair.legacyUsername, status: 'ok' })
  }
  return { success: true, results }
}

// ── 批次新增第一期漏匯入紀錄（一次性執行）──────────────────────
function batchAddFirstPeriodRecords() {
  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  }

  const individuals = [
    { username: 'bwboao',             name: 'bwboao' },
    { username: 'htting.ht',          name: '朾繪' },
    { username: 'eaton1119',          name: 'eaton1119' },
    { username: '落Glowww',           name: 'glowww66' },
    { username: 'prime_axolotl_26393',name: 'Kanan' },
    { username: 'cwy1824',            name: '夜夜' },
    { username: 'quanwolidelingchen', name: '犬窝里的凌晨' },
    { username: 'youbingchiyao',      name: '淵' },
    { username: '.purplewing',        name: '【LuLu教我畫畫】路人乙' },
    { username: 'maohaibao',          name: 'USAEBIBI' },
    { username: 'gangtza_0809',       name: '甘蔗' },
    { username: 'cc_xinf',            name: 'CC成' },
    { username: 'mao.lu',             name: '貓壹貳參肆伍柒捌玖 不見陸' },
    { username: 'reibi.',             name: '王耑' },
    { username: 'miku5239',           name: '伊織兩隻' },
    { username: 'opalmuse',           name: '歐帕' },
    { username: 'ashley8964',         name: 'Ashley' },
    { username: 'solarafox',          name: 'Solara索蕾拉' },
  ]

  const teams = [
    { teamName: '三個社畜一隻鬼',       members: '艾絲、洛兒、流浪兔子、糖' },
    { teamName: 'Ctrl+Z 無效化委員會',  members: '柒二、log呆呆、污瑕' },
    { teamName: 'Ctrl+Z 無效化委員會2', members: 'Mochi、吐司、酷妮、クルミ' },
  ]

  const results = []

  for (const p of individuals) {
    const discordId = `legacy_${p.username}`
    const dup = JSON.parse(UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({ filter: { and: [
        { property: 'Discord_ID', title: { equals: discordId } },
        { property: '期數', rich_text: { equals: '第一期' } }
      ]}})
    }).getContentText()).results || []
    if (dup.length > 0) { results.push({ id: discordId, status: '已存在' }); continue }
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', headers,
      payload: JSON.stringify({ parent: { database_id: NOTION_DATABASE_ID }, properties: {
        'Discord_ID':       { title: [{ text: { content: discordId } }] },
        'Discord_名稱':     { rich_text: [{ text: { content: p.name } }] },
        'Discord_Username': { rich_text: [{ text: { content: p.username } }] },
        '伺服器暱稱':       { rich_text: [{ text: { content: p.name } }] },
        '期數':             { rich_text: [{ text: { content: '第一期' } }] },
        '類型':             { rich_text: [{ text: { content: '個人' } }] },
        '隊伍名稱':         { rich_text: [{ text: { content: '' } }] },
        'google帳號':       { rich_text: [{ text: { content: '' } }] },
        '資料夾連結':       { url: null },
        '回報狀態':         { rich_text: [{ text: { content: '全勤' } }] }
      }})
    })
    results.push({ id: discordId, status: 'ok' })
  }

  for (const t of teams) {
    const discordId = `legacy_team_${t.teamName}`
    const dup = JSON.parse(UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({ filter: { and: [
        { property: 'Discord_ID', title: { equals: discordId } },
        { property: '期數', rich_text: { equals: '第一期' } }
      ]}})
    }).getContentText()).results || []
    if (dup.length > 0) { results.push({ id: discordId, status: '已存在' }); continue }
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', headers,
      payload: JSON.stringify({ parent: { database_id: NOTION_DATABASE_ID }, properties: {
        'Discord_ID':       { title: [{ text: { content: discordId } }] },
        'Discord_名稱':     { rich_text: [{ text: { content: t.teamName } }] },
        'Discord_Username': { rich_text: [{ text: { content: '' } }] },
        '伺服器暱稱':       { rich_text: [{ text: { content: t.members } }] },
        '期數':             { rich_text: [{ text: { content: '第一期' } }] },
        '類型':             { rich_text: [{ text: { content: '團體' } }] },
        '隊伍名稱':         { rich_text: [{ text: { content: t.teamName } }] },
        'google帳號':       { rich_text: [{ text: { content: '' } }] },
        '資料夾連結':       { url: null },
        '回報狀態':         { rich_text: [{ text: { content: '全勤' } }] }
      }})
    })
    results.push({ id: discordId, status: 'ok' })
  }

  return { success: true, results }
}

// ── 一次性：將所有現有資料夾的協作者升級為管理者 ─────────────
function upgradeAllFoldersToOrganizer() {
  const allResult = getAllRecords()
  if (!allResult.success) { Logger.log('取得紀錄失敗'); return }
  let ok = 0, skip = 0, fail = 0
  allResult.records.forEach(rec => {
    if (!rec.folderUrl || rec.googleAccounts.length === 0) { skip++; return }
    const folderId = rec.folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1]
    if (!folderId) { skip++; return }
    try {
      rec.googleAccounts.forEach(email => {
        try { setFolderOrganizer(folderId, email) } catch (e) { Logger.log('failed: ' + email + ' - ' + e) }
      })
      ok++
    } catch (e) {
      Logger.log('資料夾失敗 ' + folderId + ': ' + e)
      fail++
    }
  })
  Logger.log(`完成：${ok} 成功, ${skip} 跳過, ${fail} 失敗`)
}

function testSpreadsheetAuth() {
  const ss = SpreadsheetApp.create('授權測試')
  DriveApp.getFileById(ss.getId()).setTrashed(true)
  Logger.log('授權成功')
}

function autoSyncSheet() {
  const active = getActivePeriodInfo()
  const period = (!active.isMakeup && active.name) ? active.name : getCurrentPeriod()
  if (period && period !== '補交期') exportToSheet(period, true)
}

// ── 用 email 比對找隊伍紀錄 ───────────────────────────────────
function findTeamsByEmail(emails, excludePeriod) {
  try {
    if (!emails || emails.length === 0) return { success: true, matches: [] }
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    const emailFilters = emails.map(email => ({ property: 'google帳號', rich_text: { contains: email } }))
    const filter = {
      and: [
        { property: '類型', rich_text: { equals: '團體' } },
        { or: emailFilters }
      ]
    }
    if (excludePeriod) {
      filter.and.push({ property: '期數', rich_text: { does_not_equal: excludePeriod } })
    }
    const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({ filter })
    })
    const matches = (JSON.parse(res.getContentText()).results || []).map(page => ({
      period:     page.properties['期數'].rich_text[0]?.text.content || '',
      teamName:   page.properties['隊伍名稱'].rich_text[0]?.text.content || '',
      reportStatus: page.properties['回報狀態']?.rich_text[0]?.text.content || ''
    })).filter(m => m.period && m.teamName)
    return { success: true, matches }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 用 email 比對結果認領（建個人 legacy 紀錄）──────────────────
function claimRecordByEmail(username, period, teamName, attendanceStatus) {
  try {
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    const legacyId = `legacy_${username}`
    const dup = JSON.parse(UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({ filter: { and: [
        { property: 'Discord_ID', title: { equals: legacyId } },
        { property: '期數', rich_text: { equals: period } }
      ]}})
    }).getContentText()).results || []
    if (dup.length > 0) return { success: false, error: `${period} 已有認領紀錄` }
    UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', headers,
      payload: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          'Discord_ID':       { title: [{ text: { content: legacyId } }] },
          'Discord_名稱':     { rich_text: [{ text: { content: username } }] },
          'Discord_Username': { rich_text: [{ text: { content: username } }] },
          '伺服器暱稱':       { rich_text: [{ text: { content: username } }] },
          '期數':             { rich_text: [{ text: { content: period } }] },
          '類型':             { rich_text: [{ text: { content: '團體' } }] },
          '隊伍名稱':         { rich_text: [{ text: { content: teamName } }] },
          'google帳號':       { rich_text: [{ text: { content: '' } }] },
          '資料夾連結':       { url: null },
          '回報狀態':         { rich_text: [{ text: { content: '' } }] },
          '全勤':             { rich_text: [{ text: { content: attendanceStatus || '全勤' } }] }
        }
      })
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}


// ── 隊伍邀請 ─────────────────────────────────────────────────
function acceptTeamInvite(discordId, discordName, discordUsername, period, teamPageId) {
  try {
    const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
    // 取得隊伍紀錄
    const teamRes = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${teamPageId}`, { headers })
    const teamPage = JSON.parse(teamRes.getContentText())
    const teamName = teamPage.properties['隊伍名稱']?.rich_text[0]?.text.content || ''
    const folderUrl = teamPage.properties['資料夾連結']?.url || ''
    const serverNickname = getUserInfo(discordId)?.nickname || discordName || ''
    const profileEmail = getProfileEmail(discordId)

    // 查看是否已有本期個人紀錄
    const checkRes = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'post', headers,
      payload: JSON.stringify({
        filter: { and: [
          { property: 'Discord_ID', title: { equals: discordId } },
          { property: '期數', rich_text: { equals: period } }
        ]}
      })
    })
    const existing = JSON.parse(checkRes.getContentText()).results || []
    const props = {
      '類型':         { rich_text: [{ text: { content: '團體' } }] },
      '隊伍名稱':     { rich_text: [{ text: { content: teamName } }] },
      '資料夾連結':   folderUrl ? { url: folderUrl } : { url: null },
      '伺服器暱稱':   { rich_text: [{ text: { content: serverNickname } }] },
      'google帳號':   { rich_text: [{ text: { content: profileEmail } }] }
    }
    if (existing.length > 0) {
      UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${existing[0].id}`, {
        method: 'patch', headers, payload: JSON.stringify({ properties: props })
      })
    } else {
      UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
        method: 'post', headers,
        payload: JSON.stringify({
          parent: { database_id: NOTION_DATABASE_ID },
          properties: {
            'Discord_ID':       { title: [{ text: { content: discordId } }] },
            'Discord_名稱':     { rich_text: [{ text: { content: discordName || '' } }] },
            'Discord_Username': { rich_text: [{ text: { content: discordUsername || '' } }] },
            '期數':             { rich_text: [{ text: { content: period } }] },
            ...props
          }
        })
      })
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

function declineTeamInvite(discordId, teamPageId) {
  try {
    const key = 'declined_invites_' + discordId
    const existing = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]')
    if (!existing.includes(teamPageId)) existing.push(teamPageId)
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(existing))
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 隊伍徵求版 ───────────────────────────────────────────────
const SQUAD_SHEET_NAME = '月月繪_隊伍徵求版'

function _getSquadSheet() {
  const props = PropertiesService.getScriptProperties()
  const cachedId = props.getProperty('squadSheetId')
  let ss
  if (cachedId) {
    try { ss = SpreadsheetApp.openById(cachedId) } catch (e) { ss = null }
  }
  if (!ss) {
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID)
    const files = rootFolder.getFilesByName(SQUAD_SHEET_NAME)
    if (files.hasNext()) {
      ss = SpreadsheetApp.openById(files.next().getId())
    } else {
      ss = SpreadsheetApp.create(SQUAD_SHEET_NAME)
      DriveApp.getFileById(ss.getId()).moveTo(rootFolder)
      const sheet = ss.getActiveSheet()
      sheet.setName('貼文')
      sheet.getRange(1, 1, 1, 5).setValues([['暱稱', '類型', '訊息', '時間', '徵求人數']])
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#5865F2').setFontColor('white')
    }
    props.setProperty('squadSheetId', ss.getId())
  }
  return ss.getSheetByName('貼文') || ss.getActiveSheet()
}

function getSquadPosts() {
  try {
    const sheet = _getSquadSheet()
    const lastRow = sheet.getLastRow()
    if (lastRow <= 1) return { success: true, posts: [] }
    const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues()
    const posts = rows
      .filter(r => r[0])
      .map((r, i) => ({
        id: i + 2,
        nickname: r[0],
        type: r[1],
        message: r[2],
        time: r[3] ? new Date(r[3]).toISOString() : '',
        slots: r[4] ? Number(r[4]) : 1
      }))
      .reverse()
    return { success: true, posts }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── Profile 系統（Notion 為主，PropertiesService 為 cache）──────
const _profilePageCache = {}  // 同一次 GAS 執行內快取，減少 Notion API 呼叫

function _getProfilePage(discordId) {
  if (!discordId) return null
  if (_profilePageCache[discordId] !== undefined) return _profilePageCache[discordId]
  const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
  const res = UrlFetchApp.fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'post', headers,
    payload: JSON.stringify({
      filter: { and: [
        { property: 'Discord_ID', title: { equals: discordId } },
        { property: '期數', rich_text: { equals: 'profile' } }
      ]}
    })
  })
  const page = JSON.parse(res.getContentText()).results?.[0] || null
  _profilePageCache[discordId] = page
  return page
}

function _upsertProfilePage(discordId, props) {
  const headers = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' }
  const existing = _getProfilePage(discordId)
  if (existing) {
    UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
      method: 'patch', headers, payload: JSON.stringify({ properties: props })
    })
    // 更新快取中的 properties
    Object.assign(existing.properties, props)
  } else {
    const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post', headers,
      payload: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          'Discord_ID': { title: [{ text: { content: discordId } }] },
          '期數':       { rich_text: [{ text: { content: 'profile' } }] },
          ...props
        }
      })
    })
    _profilePageCache[discordId] = JSON.parse(res.getContentText())
  }
}

function getUserInfo(discordId) {
  if (!discordId) return null
  // 先查 PropertiesService cache
  const raw = PropertiesService.getScriptProperties().getProperty('user_info_' + discordId)
  if (raw) { try { return JSON.parse(raw) } catch {} }
  // 查 Notion
  const page = _getProfilePage(discordId)
  if (!page) return null
  const nickname  = page.properties['伺服器暱稱']?.rich_text[0]?.text.content || ''
  const typeRaw   = page.properties['類型']?.rich_text[0]?.text.content || ''
  const type      = typeRaw === '團體' ? 'team' : 'personal'
  const teamName  = page.properties['隊伍名稱']?.rich_text[0]?.text.content || ''
  const info = { nickname, type, teamName }
  PropertiesService.getScriptProperties().setProperty('user_info_' + discordId, JSON.stringify(info))
  return info
}

function getProfileEmail(discordId) {
  if (!discordId) return ''
  // 先查 PropertiesService cache
  const cached = PropertiesService.getScriptProperties().getProperty('profile_email_' + discordId)
  if (cached !== null) return cached || ''
  // 查 Notion
  const page = _getProfilePage(discordId)
  const email = page?.properties['google帳號']?.rich_text[0]?.text.content || ''
  PropertiesService.getScriptProperties().setProperty('profile_email_' + discordId, email)
  return email
}

function saveUserInfo(discordId, nickname, type, teamName) {
  try {
    if (!discordId || !/^\d{17,20}$/.test(discordId)) return { success: false, error: '無效的 Discord ID' }
    nickname = (nickname || '').trim()
    if (!nickname) return { success: false, error: '請填入暱稱' }
    const existing = getUserInfo(discordId) || {}
    const newType     = (type && ['personal', 'team'].includes(type)) ? type : (existing.type || 'personal')
    const newTeamName = (type ? (teamName || '') : (existing.teamName || '')).trim()
    const props = {
      '伺服器暱稱': { rich_text: [{ text: { content: nickname } }] },
      '類型':       { rich_text: [{ text: { content: newType === 'team' ? '團體' : '個人' } }] },
      '隊伍名稱':   { rich_text: [{ text: { content: newTeamName } }] }
    }
    _upsertProfilePage(discordId, props)
    PropertiesService.getScriptProperties().setProperty('user_info_' + discordId, JSON.stringify({ nickname, type: newType, teamName: newTeamName }))
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

function saveProfile(discordId, email) {
  try {
    if (!discordId || !/^\d{17,20}$/.test(discordId)) return { success: false, error: '無效的 Discord ID' }
    email = (email || '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: '信箱格式不正確' }
    _upsertProfilePage(discordId, { 'google帳號': { rich_text: [{ text: { content: email } }] } })
    const key = 'profile_email_' + discordId
    if (email) {
      PropertiesService.getScriptProperties().setProperty(key, email)
    } else {
      PropertiesService.getScriptProperties().deleteProperty(key)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

function createSquadPost({ nickname, message, type, slots }) {
  try {
    nickname = (nickname || '').trim()
    message  = (message  || '').trim()
    type     = (type     || '').trim()
    const slotsNum = Math.min(3, Math.max(1, parseInt(slots, 10) || 1))
    if (!nickname || nickname.length > 30) return { success: false, error: '暱稱格式不正確' }
    if (!message  || message.length  > 100) return { success: false, error: '訊息格式不正確' }
    if (!['individual', 'team'].includes(type)) return { success: false, error: '類型不正確' }
    if (!checkGlobalRateLimit('createSquadPost', 20)) return { success: false, error: '發文過於頻繁，請稍後再試' }
    const sheet = _getSquadSheet()
    sheet.appendRow([nickname, type, message, new Date(), slotsNum])
    return { success: true }
  } catch (err) {
    return { success: false, error: err.toString() }
  }
}

// ── 一次性 secrets 設定（執行後可刪除）────────────────────────
function setupSecrets() {
  const props = PropertiesService.getScriptProperties()
  props.setProperty('DISCORD_CLIENT_SECRET', 'j0XeUHrF1Xhxb_HWj-gskrQZShNIf0fC')
  props.setProperty('NOTION_TOKEN', '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')
  props.setProperty('API_SECRET', '月月繪2026secret_KK')
  Logger.log('Secrets set OK')
}

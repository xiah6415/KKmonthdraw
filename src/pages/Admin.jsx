import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { storage } from '../firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET = import.meta.env.VITE_API_SECRET

function Admin() {
  const [discordUser, setDiscordUser] = useState(null)
  const [currentPeriod, setCurrentPeriod] = useState('')
  const [newPeriod, setNewPeriod] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [extendDate, setExtendDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [periodMsg, setPeriodMsg] = useState(null)

  // 管理員名單
  const [adminList, setAdminList] = useState([])
  const [newAdminId, setNewAdminId] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)

  // 所有紀錄
  const [allRecords, setAllRecords] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterReport, setFilterReport] = useState('')
  const [filterBasic, setFilterBasic] = useState('')
  const [filterAdvanced, setFilterAdvanced] = useState('')
  const [filterReflection, setFilterReflection] = useState('')
  const [filterAttendance, setFilterAttendance] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('desc')
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  // 管理員編輯紀錄
  const [editingKey, setEditingKey] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState(null)

  // 封面圖
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverUploading, setCoverUploading] = useState(false)
  const [coverMsg, setCoverMsg] = useState(null)

  // 匯出
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState(null)

  // 繳交狀態掃描
  const [scanning, setScanning] = useState(false)
  const [scanResultMap, setScanResultMap] = useState({}) // { 'discordId_period': { basic, advanced, reflection } }
  const [scannedPeriod, setScannedPeriod] = useState('')
  const [scanError, setScanError] = useState(null)

  // 分頁
  const [recordPage, setRecordPage] = useState(0)
  const PAGE_SIZE = 10

  // 全勤調整
  const [attendanceUpdating, setAttendanceUpdating] = useState(null)
  // 已回報調整
  const [reportUpdating, setReportUpdating] = useState(null)

  // 新增歷史參加者
  const [legacyFormOpen, setLegacyFormOpen] = useState(false)
  const [legacyForm, setLegacyForm] = useState({ username: '', discordName: '', type: '個人', teamName: '', period: '', fullAttendance: true })
  const [legacyAdding, setLegacyAdding] = useState(false)
  const [legacyMsg, setLegacyMsg] = useState(null)

  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const user = location.state?.discordUser
    if (!user || !location.state?.isAdmin) {
      navigate('/')
      return
    }
    setDiscordUser(user)
    fetchInitData()
  }, [])

  const fetchInitData = async () => {
    try {
      const [periodRes, adminRes] = await Promise.all([
        axios.get(API_URL, { params: { action: 'getPeriod', secret: SECRET } }),
        axios.get(API_URL, { params: { action: 'getAdminIds', secret: SECRET } })
      ])
      const period = periodRes.data.currentPeriod || ''
      setCurrentPeriod(period)
      setNewPeriod(period)
      setStartDate(periodRes.data.startDate || '')
      setEndDate(periodRes.data.endDate || '')
      setExtendDate(periodRes.data.extendDate || '')
      setCoverImageUrl(periodRes.data.coverImageUrl || '')
      setScannedPeriod(period)
      setAdminList(adminRes.data.adminList || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── 期數 ──────────────────────────────────────────────
  const handleSavePeriod = async () => {
    if (!newPeriod.trim()) {
      setPeriodMsg({ type: 'error', text: '期數不能為空' })
      return
    }
    setSaving(true)
    setPeriodMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: {
          action: 'setPeriod',
          period: newPeriod.trim(),
          startDate,
          endDate,
          extendDate,
          coverImageUrl,
          secret: SECRET
        }
      })
      if (res.data.success) {
        setCurrentPeriod(newPeriod.trim())
        setPeriodMsg({ type: 'success', text: `已更新為「${newPeriod.trim()}」` })
      } else {
        setPeriodMsg({ type: 'error', text: '更新失敗：' + (res.data.error || '未知錯誤') })
      }
    } catch {
      setPeriodMsg({ type: 'error', text: '更新失敗，請再試一次' })
    } finally {
      setSaving(false)
    }
  }

  // ── 封面圖上傳 ─────────────────────────────────────────
  const compressImage = (file) => new Promise((resolve) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (e) => {
      img.onload = () => {
        const MAX = 1200
        let w = img.width, h = img.height
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(resolve, 'image/jpeg', 0.82)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCoverUploading(true)
    setCoverMsg(null)
    try {
      const compressed = await compressImage(file)
      const storageRef = ref(storage, 'covers/cover')
      await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' })
      const url = await getDownloadURL(storageRef)
      setCoverImageUrl(url)
      const res = await axios.get(API_URL, {
        params: { action: 'setPeriod', period: newPeriod || currentPeriod, startDate, endDate, extendDate, coverImageUrl: url, secret: SECRET }
      })
      if (res.data.success) {
        setCoverMsg({ type: 'success', text: '封面圖已更新' })
      } else {
        setCoverMsg({ type: 'error', text: '圖片上傳成功但儲存網址失敗' })
      }
    } catch (err) {
      setCoverMsg({ type: 'error', text: '上傳失敗：' + err.message })
    } finally {
      setCoverUploading(false)
    }
  }

  // ── 管理員名單 ─────────────────────────────────────────
  const handleAddAdmin = async () => {
    const id = newAdminId.trim()
    const name = newAdminName.trim()
    if (!id) return
    if (adminList.some(a => a.id === id)) {
      setAdminMsg({ type: 'error', text: '此 ID 已在名單中' })
      return
    }
    setAdminLoading(true)
    setAdminMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'addAdminId', discordId: id, adminName: name, secret: SECRET }
      })
      if (res.data.success) {
        setAdminList([...adminList, { id, name }])
        setNewAdminId('')
        setNewAdminName('')
        setAdminMsg({ type: 'success', text: `已新增 ${name || id}` })
      } else {
        setAdminMsg({ type: 'error', text: '新增失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setAdminMsg({ type: 'error', text: '新增失敗，請再試一次' })
    } finally {
      setAdminLoading(false)
    }
  }

  const handleRemoveAdmin = async (id, name) => {
    if (!confirm(`確定要移除管理員「${name || id}」嗎？`)) return
    setAdminLoading(true)
    setAdminMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'removeAdminId', discordId: id, secret: SECRET }
      })
      if (res.data.success) {
        setAdminList(adminList.filter(a => a.id !== id))
        setAdminMsg({ type: 'success', text: `已移除 ${name || id}` })
      } else {
        setAdminMsg({ type: 'error', text: '移除失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setAdminMsg({ type: 'error', text: '移除失敗，請再試一次' })
    } finally {
      setAdminLoading(false)
    }
  }

  // ── 所有紀錄 ───────────────────────────────────────────
  const fetchAllRecords = async () => {
    setLoadingRecords(true)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'getAllRecords', secret: SECRET }
      })
      if (res.data.success) setAllRecords(res.data.records)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingRecords(false)
    }
  }

  const getDisplayName = (user) => user?.global_name || user?.username || user?.id || ''

  // ── 篩選邏輯 ───────────────────────────────────────────
  const periods = [...new Set(allRecords.map(r => r.period))].sort()

  const filteredRecords = allRecords
    .filter(rec => {
      if (filterPeriod && rec.period !== filterPeriod) return false
      if (filterType && rec.type !== filterType) return false
      if (filterReport === '已回報' && rec.reportStatus !== '已完成') return false
      if (filterReport === '未回報' && rec.reportStatus === '已完成') return false
      if (filterAttendance && rec.reportStatus !== filterAttendance) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const name = (rec.serverNickname || rec.discordName || '').toLowerCase()
        const team = (rec.teamName || '').toLowerCase()
        const id = (rec.discordId || '').toLowerCase()
        if (!name.includes(q) && !team.includes(q) && !id.includes(q)) return false
      }
      if (filterBasic || filterAdvanced || filterReflection) {
        const sub = scanResultMap[`${rec.discordId}_${rec.period}`]
        if (filterBasic === 'done'    && sub?.basic !== true)       return false
        if (filterBasic === 'missing' && sub?.basic !== false)      return false
        if (filterAdvanced === 'done'    && sub?.advanced !== true)    return false
        if (filterAdvanced === 'missing' && sub?.advanced !== false)   return false
        if (filterReflection === 'done'    && sub?.reflection !== true)  return false
        if (filterReflection === 'missing' && sub?.reflection !== false) return false
      }
      return true
    })
    .sort((a, b) => {
      const tA = a.createdTime || ''
      const tB = b.createdTime || ''
      return sortOrder === 'desc' ? tB.localeCompare(tA) : tA.localeCompare(tB)
    })

  const recordTotalPages = Math.ceil(filteredRecords.length / PAGE_SIZE)
  const pagedRecords = filteredRecords.slice(recordPage * PAGE_SIZE, (recordPage + 1) * PAGE_SIZE)

  const setFilterPeriodAndReset     = (v) => { setFilterPeriod(v);     setRecordPage(0) }
  const setFilterTypeAndReset       = (v) => { setFilterType(v);       setRecordPage(0) }
  const setFilterReportAndReset     = (v) => { setFilterReport(v); if (v) setFilterAttendance(''); setRecordPage(0) }
  const setFilterBasicAndReset      = (v) => { setFilterBasic(v);      setRecordPage(0) }
  const setFilterAdvancedAndReset   = (v) => { setFilterAdvanced(v);   setRecordPage(0) }
  const setFilterReflectionAndReset  = (v) => { setFilterReflection(v);  setRecordPage(0) }
  const setFilterAttendanceAndReset  = (v) => { setFilterAttendance(v); if (v) setFilterReport(''); setRecordPage(0) }
  const setSearchQueryAndReset       = (v) => { setSearchQuery(v);       setRecordPage(0) }

  // ── 統計 ───────────────────────────────────────────────
  const getReportStats = (recs) => ({
    done: recs.filter(r => r.reportStatus === '已完成').length,
    pending: recs.filter(r => r.reportStatus !== '已完成').length,
  })

  const statsByPeriod = periods.map(p => {
    const recs = allRecords.filter(r => r.period === p)
    const { done, pending } = getReportStats(recs)
    return {
      period: p,
      total: recs.length,
      team: recs.filter(r => r.type === '團體').length,
      personal: recs.filter(r => r.type === '個人').length,
      done,
      pending,
    }
  })

  // ── 編輯紀錄 ───────────────────────────────────────────
  const startEditRecord = (rec) => {
    const key = `${rec.discordId}_${rec.period}`
    setEditingKey(key)
    setEditMsg(null)
    setEditDraft({
      serverNickname: rec.serverNickname || '',
      teamName: rec.teamName || '',
      googleAccounts: rec.googleAccounts?.length > 0 ? [...rec.googleAccounts] : [''],
      type: rec.type || '個人'
    })
  }

  const cancelEditRecord = () => {
    setEditingKey(null)
    setEditDraft({})
    setEditMsg(null)
  }

  const saveEditRecord = async (rec) => {
    const accounts = editDraft.googleAccounts.filter(a => a.trim() !== '')
    if (accounts.length === 0) {
      setEditMsg({ type: 'error', text: '至少需要一個 Google 帳號' })
      return
    }
    setEditSaving(true)
    setEditMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: {
          action: 'adminUpdateRecord',
          discordId: rec.discordId,
          period: rec.period,
          serverNickname: editDraft.serverNickname.trim(),
          teamName: editDraft.teamName.trim(),
          googleAccounts: accounts.join(','),
          secret: SECRET
        }
      })
      if (res.data.success) {
        setAllRecords(prev => prev.map(r =>
          r.discordId === rec.discordId && r.period === rec.period
            ? { ...r, serverNickname: editDraft.serverNickname.trim(), teamName: editDraft.teamName.trim(), googleAccounts: accounts }
            : r
        ))
        cancelEditRecord()
      } else {
        setEditMsg({ type: 'error', text: '儲存失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setEditMsg({ type: 'error', text: '儲存失敗，請再試一次' })
    } finally {
      setEditSaving(false)
    }
  }

  // ── 匯出 Google 試算表 ─────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    setExportMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: {
          action: 'exportToSheet',
          period: filterPeriod || currentPeriod,
          secret: SECRET
        }
      })
      if (res.data.success) {
        setExportMsg({ type: 'success', url: res.data.sheetUrl, text: '匯出成功！' })
      } else {
        setExportMsg({ type: 'error', text: '匯出失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setExportMsg({ type: 'error', text: '匯出失敗，請再試一次' })
    } finally {
      setExporting(false)
    }
  }

  // ── 繳交狀態掃描 ──────────────────────────────────────────
  const handleScan = async () => {
    if (!filterPeriod) return
    setScanning(true)
    setScanError(null)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'scanSubmissions', period: filterPeriod, secret: SECRET }
      })
      if (res.data.success) {
        const map = {}
        res.data.results.forEach(r => { map[`${r.discordId}_${filterPeriod}`] = r })
        setScanResultMap(prev => ({ ...prev, ...map }))
        setScannedPeriod(filterPeriod)
      } else {
        setScanError(res.data.error || '掃描失敗')
      }
    } catch {
      setScanError('無法連線，請再試一次')
    } finally {
      setScanning(false)
    }
  }

  const handleUpdateAttendance = async (rec, status) => {
    const key = `${rec.discordId}_${rec.period}`
    setAttendanceUpdating(key)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'updateAttendanceStatus', discordId: rec.discordId, period: rec.period, status, secret: SECRET }
      })
      if (res.data.success) {
        setAllRecords(prev => prev.map(r =>
          r.discordId === rec.discordId && r.period === rec.period ? { ...r, reportStatus: status } : r
        ))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAttendanceUpdating(null)
    }
  }

  const handleAdminToggleReport = async (rec, newStatus) => {
    const key = `${rec.discordId}_${rec.period}`
    setReportUpdating(key)
    try {
      const action = newStatus === '已完成' ? 'updateReportStatus' : 'cancelReportStatus'
      const res = await axios.get(API_URL, {
        params: { action, discordId: rec.discordId, period: rec.period, secret: SECRET }
      })
      if (res.data.success) {
        setAllRecords(prev => prev.map(r =>
          r.discordId === rec.discordId && r.period === rec.period
            ? { ...r, reportStatus: newStatus, reportTime: newStatus === '已完成' ? (res.data.reportTime || new Date().toISOString()) : '' }
            : r
        ))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setReportUpdating(null)
    }
  }

  const handleAddLegacy = async () => {
    if (!legacyForm.username.trim() || !legacyForm.period.trim()) {
      setLegacyMsg({ type: 'error', text: 'Discord username 和期數為必填' })
      return
    }
    setLegacyAdding(true)
    setLegacyMsg(null)
    try {
      const name = legacyForm.discordName.trim() || legacyForm.username.trim()
      const res = await axios.get(API_URL, {
        params: {
          action: 'addLegacyRecord',
          username: legacyForm.username.trim(),
          discordName: name,
          serverNickname: name,
          type: legacyForm.type,
          teamName: legacyForm.teamName.trim(),
          period: legacyForm.period.trim(),
          fullAttendance: legacyForm.fullAttendance.toString(),
          secret: SECRET
        }
      })
      if (res.data.success) {
        setLegacyMsg({ type: 'success', text: `已新增 ${name}` })
        setLegacyForm(f => ({ ...f, username: '', discordName: '', teamName: '' }))
        if (allRecords.length > 0) fetchAllRecords()
      } else {
        setLegacyMsg({ type: 'error', text: '新增失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setLegacyMsg({ type: 'error', text: '新增失敗，請再試一次' })
    } finally {
      setLegacyAdding(false)
    }
  }

  const handleExportCsv = () => {
    const rows = filteredRecords.map(r => {
      const sub = scanResultMap[`${r.discordId}_${r.period}`] || {}
      return [
        r.serverNickname || r.discordName || '',
        r.discordId || '',
        r.period || '',
        r.type || '',
        r.teamName || '',
        r.reportStatus === '已完成' ? '已回報' : '未回報',
        sub.basic === true ? '✓' : sub.basic === false ? '✗' : '-',
        sub.advanced === true ? '✓' : sub.advanced === false ? '✗' : '-',
        sub.reflection === true ? '✓' : sub.reflection === false ? '✗' : '-',
        r.folderUrl || ''
      ]
    })
    const header = ['暱稱', 'Discord ID', '期數', '類型', '隊伍', '回報狀態', '基礎', '進階', '心得', '資料夾']
    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `月月繪名單${filterPeriod ? '_' + filterPeriod : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const StatusBadge = ({ value }) => {
    if (value === true) return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>✓</span>
    if (value === false) return <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>✗</span>
    return <span style={{ color: '#bbb' }}>-</span>
  }

  const thStyle = { padding: '8px 10px', textAlign: 'left', fontWeight: 'bold', color: '#555', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '7px 10px', verticalAlign: 'middle' }

  // ── Loading ────────────────────────────────────────────
  if (loading) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <h1>月月繪</h1>
      <div className="spinner" />
      <p style={{ color: '#999' }}>載入中...</p>
    </div>
  )

  return (
    <div className="container">
      {/* 標題 */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>🛠️ 管理員後台</h1>
        {discordUser && (
          <p style={{ color: '#888', fontSize: 13 }}>
            登入身分：<strong style={{ color: '#e8b046' }}>{getDisplayName(discordUser)}</strong>
          </p>
        )}
      </div>

      {/* ── 期數管理 ── */}
      <div className="admin-section">
        <h2 className="admin-section-title">📅 期數管理</h2>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
          目前期數：<strong style={{ color: '#5865F2' }}>{currentPeriod || '（未設定）'}</strong>
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={newPeriod}
            onChange={(e) => setNewPeriod(e.target.value)}
            placeholder="例：第10期 或 2025-06"
            style={{ margin: 0, flex: 1 }}
          />
          <button
            onClick={handleSavePeriod}
            disabled={saving}
            style={{ whiteSpace: 'nowrap', padding: '10px 16px' }}
          >
            {saving ? '儲存中...' : '更新'}
          </button>
        </div>

        {/* 活動日期 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#888', fontWeight: 'normal', display: 'block', marginBottom: 2 }}>活動開始</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ margin: 0, fontSize: 13 }}
            />
          </div>
          <span style={{ color: '#aaa', marginTop: 18 }}>～</span>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#888', fontWeight: 'normal', display: 'block', marginBottom: 2 }}>活動截止</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ margin: 0, fontSize: 13 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, color: '#888', fontWeight: 'normal', display: 'block', marginBottom: 2 }}>延長截止（選填）</label>
            <input
              type="date"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              style={{ margin: 0, fontSize: 13 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            {extendDate && (
              <button
                onClick={() => setExtendDate('')}
                style={{ marginTop: 18, fontSize: 12, padding: '4px 10px', background: '#eee', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#888' }}
              >
                清除延長日
              </button>
            )}
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>
          截止日當天 23:59 截止。設延長截止後，前台會在活動截止後才顯示延長中提示。
        </p>

        {periodMsg && (
          <p style={{
            marginTop: 8, fontSize: 13, fontWeight: 'bold',
            color: periodMsg.type === 'success' ? '#2ecc71' : '#e74c3c'
          }}>
            {periodMsg.type === 'success' ? '✓ ' : '✕ '}{periodMsg.text}
          </p>
        )}

        {/* 封面圖 */}
        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 'bold', color: '#555', display: 'block', marginBottom: 8 }}>🖼️ 封面圖</label>
          {coverImageUrl && (
            <img src={coverImageUrl} alt="封面預覽" style={{ width: '100%', borderRadius: 8, marginBottom: 10, display: 'block' }} />
          )}
          <label style={{
            display: 'inline-block', padding: '8px 16px', borderRadius: 8,
            background: coverUploading ? '#ccc' : '#5865F2', color: 'white',
            cursor: coverUploading ? 'not-allowed' : 'pointer', fontSize: 13
          }}>
            {coverUploading ? '上傳中...' : coverImageUrl ? '換一張' : '上傳封面圖'}
            <input type="file" accept="image/*" onChange={handleCoverUpload} disabled={coverUploading} style={{ display: 'none' }} />
          </label>
          {coverMsg && (
            <p style={{ marginTop: 6, fontSize: 13, fontWeight: 'bold', color: coverMsg.type === 'success' ? '#2ecc71' : '#e74c3c' }}>
              {coverMsg.type === 'success' ? '✓ ' : '✕ '}{coverMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* ── 管理員名單 ── */}
      <div className="admin-section">
        <h2 className="admin-section-title">👑 管理員名單</h2>

        {adminList.length === 0 ? (
          <p style={{ color: '#bbb', fontSize: 13, marginBottom: 12 }}>目前沒有其他管理員</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {adminList.map(({ id, name }) => (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8f9ff', border: '1px solid #e8e9ff',
                borderRadius: 8, padding: '8px 12px'
              }}>
                <div>
                  {name && (
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold', color: '#333' }}>{name}</p>
                  )}
                  <p style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#888' }}>{id}</p>
                </div>
                <button
                  className="btn-remove"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => handleRemoveAdmin(id, name)}
                  disabled={adminLoading}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            placeholder="顯示名稱（例：小明）"
            style={{ margin: 0 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={newAdminId}
              onChange={(e) => setNewAdminId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
              placeholder="Discord ID（純數字）"
              style={{ margin: 0, flex: 1 }}
            />
            <button
              onClick={handleAddAdmin}
              disabled={adminLoading || !newAdminId.trim()}
              style={{ whiteSpace: 'nowrap', padding: '10px 16px', background: '#2ecc71' }}
            >
              {adminLoading ? '處理中...' : '新增'}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>
          Discord ID：Discord 開啟開發者模式後，對使用者右鍵 → 複製 ID
        </p>
        {adminMsg && (
          <p style={{
            marginTop: 6, fontSize: 13, fontWeight: 'bold',
            color: adminMsg.type === 'success' ? '#2ecc71' : '#e74c3c'
          }}>
            {adminMsg.type === 'success' ? '✓ ' : '✕ '}{adminMsg.text}
          </p>
        )}
      </div>

      {/* ── 所有建檔紀錄 ── */}
      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="admin-section-title" style={{ margin: 0 }}>📋 月月繪參加者資料</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {allRecords.length > 0 && (
              <>
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  style={{ fontSize: 12, padding: '6px 12px', background: '#27ae60' }}
                >
                  {exporting ? '匯出中...' : '📊 匯出試算表'}
                </button>
                <button
                  onClick={handleScan}
                  disabled={scanning || !filterPeriod}
                  title={!filterPeriod ? '請先選擇期數再掃描' : `掃描「${filterPeriod}」繳交狀態`}
                  style={{ fontSize: 12, padding: '6px 12px', background: !filterPeriod ? '#f0f0f0' : '#e8b046', color: !filterPeriod ? '#aaa' : 'white' }}
                >
                  {scanning ? '掃描中...' : '🔍 掃描繳交'}
                </button>
              </>
            )}
            <button
              onClick={() => { setLegacyFormOpen(v => !v); setLegacyMsg(null) }}
              style={{ fontSize: 12, padding: '6px 12px', background: legacyFormOpen ? '#5865F2' : '#f0f0f0', color: legacyFormOpen ? 'white' : '#555' }}
            >+ 新增</button>
            <button
              onClick={fetchAllRecords}
              disabled={loadingRecords}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              {loadingRecords ? '載入中...' : allRecords.length > 0 ? '重新載入' : '載入紀錄'}
            </button>
          </div>
        </div>

        {/* 新增參加者表單 */}
        {legacyFormOpen && (
          <div style={{ background: '#f8f9ff', border: '1px solid #e8e9ff', borderRadius: 8, padding: '12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 2 }}>期數 *</label>
                <input type="text" value={legacyForm.period} onChange={e => setLegacyForm(f => ({ ...f, period: e.target.value }))} placeholder="例：第一期" style={{ margin: 0 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 2 }}>類型</label>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {['個人', '團體'].map(t => (
                    <button key={t} onClick={() => setLegacyForm(f => ({ ...f, type: t }))}
                      style={{ flex: 1, fontSize: 12, padding: '8px', background: legacyForm.type === t ? '#5865F2' : '#fff', color: legacyForm.type === t ? 'white' : '#555', border: '1px solid #dde' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 2 }}>Discord Username *</label>
                <input type="text" value={legacyForm.username} onChange={e => setLegacyForm(f => ({ ...f, username: e.target.value }))} placeholder="username123" style={{ margin: 0 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 2 }}>暱稱</label>
                <input type="text" value={legacyForm.discordName} onChange={e => setLegacyForm(f => ({ ...f, discordName: e.target.value }))} placeholder="留空則用 username" style={{ margin: 0 }} />
              </div>
            </div>
            {legacyForm.type === '團體' && (
              <div>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 2 }}>隊伍名稱</label>
                <input type="text" value={legacyForm.teamName} onChange={e => setLegacyForm(f => ({ ...f, teamName: e.target.value }))} placeholder="隊伍名稱" style={{ margin: 0 }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>全勤</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[true, false].map(v => (
                    <button key={String(v)} onClick={() => setLegacyForm(f => ({ ...f, fullAttendance: v }))}
                      style={{ flex: 1, fontSize: 12, padding: '8px',
                        background: legacyForm.fullAttendance === v ? (v ? '#2ecc71' : '#e8b046') : '#fff',
                        color: legacyForm.fullAttendance === v ? 'white' : '#555', border: '1px solid #dde' }}>
                      {v ? '全勤' : '未全勤'}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleAddLegacy} disabled={legacyAdding} style={{ background: '#5865F2', padding: '8px 20px', whiteSpace: 'nowrap' }}>
                {legacyAdding ? '新增中...' : '新增'}
              </button>
            </div>
            {legacyMsg && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold', color: legacyMsg.type === 'success' ? '#2ecc71' : '#e74c3c' }}>
                {legacyMsg.type === 'success' ? '✓ ' : '✕ '}{legacyMsg.text}
              </p>
            )}
          </div>
        )}

        {/* 掃描狀態 */}
        {scanError && (
          <p style={{ color: '#e74c3c', fontSize: 12, margin: '0 0 8px' }}>✕ {scanError}</p>
        )}
        {scannedPeriod && !scanError && (
          <p style={{ color: '#888', fontSize: 12, margin: '0 0 8px' }}>
            已掃描「{scannedPeriod}」繳交狀態
          </p>
        )}

        {/* 匯出訊息 */}
        {exportMsg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: exportMsg.type === 'success' ? '#e8f9f0' : '#fff0f0',
            border: `1px solid ${exportMsg.type === 'success' ? '#b2ecd0' : '#ffcccc'}`,
            color: exportMsg.type === 'success' ? '#27ae60' : '#c0392b'
          }}>
            {exportMsg.text}
            {exportMsg.url && (
              <a href={exportMsg.url} target="_blank" rel="noreferrer"
                style={{ marginLeft: 8, color: '#5865F2', fontWeight: 'bold' }}>
                開啟試算表 →
              </a>
            )}
          </div>
        )}

        {allRecords.length === 0 ? (
          <p style={{ color: '#bbb', fontSize: 13, textAlign: 'center' }}>
            點擊「載入紀錄」查看所有建檔資料
          </p>
        ) : (
          <>
            {/* 每期統計 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {statsByPeriod.map(s => (
                <div key={s.period} style={{
                  background: '#f8f9ff', border: '1px solid #e8e9ff',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#5865F2' }}>{s.period}</span>
                    <span style={{ color: '#666' }}>
                      共 <strong>{s.total}</strong> 筆
                      　個人 <strong>{s.personal}</strong>
                      　團體 <strong>{s.team}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12 }}>
                    <span style={{ color: '#27ae60' }}>✅ 已回報 <strong>{s.done}</strong></span>
                    <span style={{ color: '#aaa' }}>⏳ 未回報 <strong>{s.pending}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* 期數篩選 tabs — 常駐 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <button
                onClick={() => setFilterPeriodAndReset('')}
                style={{
                  fontSize: 12, padding: '5px 12px',
                  background: filterPeriod === '' ? '#5865F2' : '#f0f0f0',
                  color: filterPeriod === '' ? 'white' : '#555'
                }}
              >全部</button>
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPeriodAndReset(p)}
                  style={{
                    fontSize: 12, padding: '5px 12px',
                    background: filterPeriod === p ? '#5865F2' : '#f0f0f0',
                    color: filterPeriod === p ? 'white' : '#555'
                  }}
                >{p}</button>
              ))}
            </div>

            {/* 搜尋欄 + 展開收合 — 常駐 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQueryAndReset(e.target.value)}
                placeholder="搜尋暱稱、隊伍、Discord ID"
                style={{ margin: 0, flex: 1, minWidth: 160, fontSize: 13 }}
              />
              <button
                onClick={() => setFiltersExpanded(v => !v)}
                style={{
                  fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap',
                  background: filtersExpanded ? '#5865F2' : '#f0f0f0',
                  color: filtersExpanded ? 'white' : '#555'
                }}
              >{filtersExpanded ? '▲ 收起' : '▼ 更多篩選'}</button>
            </div>

            {/* 可收合篩選區 */}
            {filtersExpanded && (
              <div style={{
                background: '#f8f9ff', border: '1px solid #e8e9ff',
                borderRadius: 8, padding: '10px 12px', marginBottom: 10,
                display: 'flex', flexDirection: 'column', gap: 8
              }}>
                {/* 類型篩選 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888', width: 40 }}>類型</span>
                  {['', '個人', '團體'].map(t => (
                    <button
                      key={t}
                      onClick={() => setFilterTypeAndReset(t)}
                      style={{
                        fontSize: 12, padding: '5px 10px',
                        background: filterType === t
                          ? (t === '團體' ? '#2ecc71' : t === '個人' ? '#5865F2' : '#555')
                          : '#fff',
                        color: filterType === t ? 'white' : '#555',
                        border: '1px solid #dde'
                      }}
                    >{t === '' ? '全部' : t}</button>
                  ))}
                </div>

                {/* 回報狀態篩選 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888', width: 40 }}>回報</span>
                  {[['', '全部'], ['已回報', '✅ 已回報'], ['未回報', '⏳ 未回報']].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setFilterReportAndReset(val)}
                      style={{
                        fontSize: 12, padding: '5px 10px',
                        background: filterReport === val
                          ? (val === '已回報' ? '#27ae60' : val === '未回報' ? '#e8b046' : '#555')
                          : '#fff',
                        color: filterReport === val ? 'white' : '#555',
                        border: '1px solid #dde'
                      }}
                    >{label}</button>
                  ))}
                </div>

                {/* 全勤篩選 */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#888', width: 40 }}>全勤</span>
                  {[['', '全部'], ['全勤', '✅ 全勤'], ['未全勤', '⚠️ 未全勤']].map(([val, label]) => (
                    <button key={val} onClick={() => setFilterAttendanceAndReset(val)}
                      style={{ fontSize: 12, padding: '5px 10px',
                        background: filterAttendance === val ? (val === '全勤' ? '#2ecc71' : val === '未全勤' ? '#e8b046' : '#555') : '#fff',
                        color: filterAttendance === val ? 'white' : '#555', border: '1px solid #dde' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* 繳交項目篩選 */}
                {[
                  ['基礎', filterBasic, setFilterBasicAndReset],
                  ['進階', filterAdvanced, setFilterAdvancedAndReset],
                  ['心得', filterReflection, setFilterReflectionAndReset],
                ].map(([label, val, setter]) => (
                  <div key={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#888', width: 40 }}>{label}</span>
                    {[['', '全部'], ['done', '✓ 已繳'], ['missing', '✗ 未繳']].map(([opt, optLabel]) => (
                      <button
                        key={opt}
                        onClick={() => setter(opt)}
                        style={{
                          fontSize: 12, padding: '5px 10px',
                          background: val === opt
                            ? (opt === 'done' ? '#2ecc71' : opt === 'missing' ? '#e74c3c' : '#555')
                            : '#fff',
                          color: val === opt ? 'white' : '#555',
                          border: '1px solid #dde'
                        }}
                      >{optLabel}</button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* 結果數 + 排序 + 分頁資訊 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ color: '#888', fontSize: 12, margin: 0 }}>
                  顯示 {filteredRecords.length} / {allRecords.length} 筆
                </p>
                <button
                  onClick={() => { setSortOrder(v => v === 'desc' ? 'asc' : 'desc'); setRecordPage(0) }}
                  style={{
                    fontSize: 11, padding: '3px 8px',
                    background: '#f0f0f0', color: '#555', border: '1px solid #ddd'
                  }}
                  title="切換排序"
                >
                  {sortOrder === 'desc' ? '↓ 最新' : '↑ 最舊'}
                </button>
              </div>
              {recordTotalPages > 1 && (
                <span style={{ fontSize: 12, color: '#888' }}>
                  第 {recordPage + 1} / {recordTotalPages} 頁
                </span>
              )}
            </div>

            {/* 紀錄列表 */}
            {filteredRecords.length === 0 ? (
              <p style={{ color: '#bbb', fontSize: 13, textAlign: 'center' }}>沒有符合條件的紀錄</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pagedRecords.map((rec, i) => {
                  const key = `${rec.discordId}_${rec.period}`
                  const isEditing = editingKey === key
                  return (
                    <div key={i} className="record-card" style={{ gap: 6 }}>
                      {/* 標頭列 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 'bold', color: '#5865F2', fontSize: 14 }}>{rec.period}</span>
                          <span className={`type-badge type-badge--${rec.type === '團體' ? 'team' : 'personal'}`}>
                            {rec.type}
                          </span>
                          {rec.reportStatus === '已完成'
                            ? <span className="report-badge--done">✅ 已回報</span>
                            : <span className="report-badge--pending">⏳ 未回報</span>
                          }
                        </div>
                        {!isEditing && (
                          <button className="btn-edit" onClick={() => startEditRecord(rec)}>編輯</button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="edit-section">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div>
                              <label className="form-label" style={{ fontSize: 12 }}>伺服器暱稱</label>
                              <input
                                type="text"
                                value={editDraft.serverNickname}
                                onChange={e => setEditDraft(d => ({ ...d, serverNickname: e.target.value }))}
                                style={{ marginTop: 4 }}
                              />
                            </div>
                            {rec.type === '團體' && (
                              <div>
                                <label className="form-label" style={{ fontSize: 12 }}>隊伍名稱</label>
                                <input
                                  type="text"
                                  value={editDraft.teamName}
                                  onChange={e => setEditDraft(d => ({ ...d, teamName: e.target.value }))}
                                  style={{ marginTop: 4 }}
                                />
                              </div>
                            )}
                            <div>
                              <label className="form-label" style={{ fontSize: 12 }}>Google 帳號</label>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                {editDraft.googleAccounts.map((acc, ai) => (
                                  <div key={ai} className="account-row">
                                    <input
                                      type="email"
                                      value={acc}
                                      onChange={e => {
                                        const next = [...editDraft.googleAccounts]
                                        next[ai] = e.target.value
                                        setEditDraft(d => ({ ...d, googleAccounts: next }))
                                      }}
                                      style={{ margin: 0 }}
                                      placeholder="example@gmail.com"
                                    />
                                    {editDraft.googleAccounts.length > 1 && (
                                      <button
                                        className="btn-remove"
                                        onClick={() => setEditDraft(d => ({
                                          ...d,
                                          googleAccounts: d.googleAccounts.filter((_, j) => j !== ai)
                                        }))}
                                      >✕</button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  className="btn-add"
                                  onClick={() => setEditDraft(d => ({ ...d, googleAccounts: [...d.googleAccounts, ''] }))}
                                >+ 新增帳號</button>
                              </div>
                            </div>
                          </div>

                          {editMsg && (
                            <p style={{ fontSize: 12, color: editMsg.type === 'error' ? '#e74c3c' : '#2ecc71', margin: '4px 0 0' }}>
                              {editMsg.text}
                            </p>
                          )}

                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button
                              style={{ flex: 1, background: '#2ecc71', fontSize: 13, padding: '8px' }}
                              onClick={() => saveEditRecord(rec)}
                              disabled={editSaving}
                            >
                              {editSaving ? '儲存中...' : '儲存'}
                            </button>
                            <button
                              style={{ flex: 1, background: '#aaa', fontSize: 13, padding: '8px' }}
                              onClick={cancelEditRecord}
                            >取消</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p style={{ margin: 0, fontSize: 13, color: '#444' }}>
                            {rec.serverNickname || rec.discordName}
                            {rec.teamName && <span style={{ color: '#888' }}> ／ {rec.teamName}</span>}
                          </p>
                          <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>
                            {rec.username ? `@${rec.username}` : rec.discordId} ・ {rec.createdTime ? rec.createdTime.split('T')[0] : ''}
                          </p>
                          {rec.googleAccounts && rec.googleAccounts.length > 0 && (
                            <p style={{ margin: 0, fontSize: 11, color: '#999' }}>
                              📧 {rec.googleAccounts.join(', ')}
                            </p>
                          )}
                          {rec.reportTime && (
                            <p style={{ margin: 0, fontSize: 11, color: '#7dbb9a' }}>
                              ✅ 回報時間：{rec.reportTime.split('T')[0]}
                            </p>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#888' }}>已回報：</span>
                            {[['已完成', '已回報'], ['', '未回報']].map(([status, label]) => (
                              <button key={status || 'none'}
                                onClick={() => handleAdminToggleReport(rec, status)}
                                disabled={reportUpdating === key}
                                style={{ fontSize: 11, padding: '3px 10px',
                                  background: rec.reportStatus === status ? (status === '已完成' ? '#27ae60' : '#aaa') : '#f0f0f0',
                                  color: rec.reportStatus === status ? 'white' : '#666',
                                  border: `1px solid ${rec.reportStatus === status ? (status === '已完成' ? '#27ae60' : '#aaa') : '#ddd'}` }}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#888' }}>全勤：</span>
                            {['全勤', '未全勤'].map(status => (
                              <button key={status} onClick={() => handleUpdateAttendance(rec, status)}
                                disabled={attendanceUpdating === key}
                                style={{ fontSize: 11, padding: '3px 10px',
                                  background: rec.reportStatus === status ? (status === '全勤' ? '#2ecc71' : '#e8b046') : '#f0f0f0',
                                  color: rec.reportStatus === status ? 'white' : '#666',
                                  border: `1px solid ${rec.reportStatus === status ? (status === '全勤' ? '#2ecc71' : '#e8b046') : '#ddd'}` }}>
                                {status}
                              </button>
                            ))}
                          </div>
                          {(() => {
                            const sub = scanResultMap[`${rec.discordId}_${rec.period}`]
                            if (!sub) return null
                            return (
                              <div style={{ display: 'flex', gap: 10, fontSize: 12, marginTop: 2 }}>
                                <span>基礎 <StatusBadge value={sub.basic} /></span>
                                <span>進階 <StatusBadge value={sub.advanced} /></span>
                                <span>心得 <StatusBadge value={sub.reflection} /></span>
                              </div>
                            )
                          })()}
                          {rec.socialLink && (
                            <a href={rec.socialLink} target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, color: '#e1306c' }}>🔗 社群打卡連結</a>
                          )}
                          {rec.folderUrl && (
                            <a href={rec.folderUrl} target="_blank" rel="noreferrer"
                              style={{ fontSize: 11, color: '#5865F2' }}>📂 開啟資料夾</a>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 參加者資料分頁控制 */}
            {recordTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setRecordPage(p => Math.max(0, p - 1))}
                  disabled={recordPage === 0}
                  style={{ fontSize: 12, padding: '6px 14px', background: recordPage === 0 ? '#f0f0f0' : '#5865F2', color: recordPage === 0 ? '#aaa' : 'white' }}
                >← 上一頁</button>
                <span style={{ fontSize: 12, color: '#888' }}>{recordPage + 1} / {recordTotalPages}</span>
                <button
                  onClick={() => setRecordPage(p => Math.min(recordTotalPages - 1, p + 1))}
                  disabled={recordPage === recordTotalPages - 1}
                  style={{ fontSize: 12, padding: '6px 14px', background: recordPage === recordTotalPages - 1 ? '#f0f0f0' : '#5865F2', color: recordPage === recordTotalPages - 1 ? '#aaa' : 'white' }}
                >下一頁 →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 導航 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={() => navigate('/dashboard', { state: { discordUser } })}
          style={{ background: 'transparent', color: '#5865F2', border: '1px solid #5865F2', fontSize: 13 }}
        >
          切換為參加者模式
        </button>
        <button
          onClick={() => navigate('/help')}
          style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', fontSize: 13 }}
        >
          ? 使用說明
        </button>
        <button
          onClick={() => { localStorage.removeItem('discordUser'); navigate('/') }}
          style={{ background: 'transparent', color: '#aaa', border: '1px solid #ddd', fontSize: 13 }}
        >
          登出
        </button>
      </div>
    </div>
  )
}

export default Admin

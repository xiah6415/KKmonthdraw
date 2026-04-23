import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET = import.meta.env.VITE_API_SECRET

function Admin() {
  const [discordUser, setDiscordUser] = useState(null)
  const [currentPeriod, setCurrentPeriod] = useState('')
  const [newPeriod, setNewPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [periodMsg, setPeriodMsg] = useState(null) // { type, text }

  // 管理員名單
  const [adminIds, setAdminIds] = useState([])
  const [newAdminId, setNewAdminId] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMsg, setAdminMsg] = useState(null)

  // 所有紀錄
  const [allRecords, setAllRecords] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterType, setFilterType] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const user = location.state?.discordUser
    // 只允許從 Dashboard 帶著 isAdmin:true 進來
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
      setAdminIds(adminRes.data.adminIds || [])
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
        params: { action: 'setPeriod', period: newPeriod.trim(), secret: SECRET }
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

  // ── 管理員名單 ─────────────────────────────────────────
  const handleAddAdmin = async () => {
    const id = newAdminId.trim()
    if (!id) return
    if (adminIds.includes(id)) {
      setAdminMsg({ type: 'error', text: '此 ID 已在名單中' })
      return
    }
    setAdminLoading(true)
    setAdminMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'addAdminId', discordId: id, secret: SECRET }
      })
      if (res.data.success) {
        setAdminIds([...adminIds, id])
        setNewAdminId('')
        setAdminMsg({ type: 'success', text: `已新增 ${id}` })
      } else {
        setAdminMsg({ type: 'error', text: '新增失敗：' + (res.data.error || '未知') })
      }
    } catch {
      setAdminMsg({ type: 'error', text: '新增失敗，請再試一次' })
    } finally {
      setAdminLoading(false)
    }
  }

  const handleRemoveAdmin = async (id) => {
    if (!confirm(`確定要移除管理員 ${id} 嗎？`)) return
    setAdminLoading(true)
    setAdminMsg(null)
    try {
      const res = await axios.get(API_URL, {
        params: { action: 'removeAdminId', discordId: id, secret: SECRET }
      })
      if (res.data.success) {
        setAdminIds(adminIds.filter(a => a !== id))
        setAdminMsg({ type: 'success', text: `已移除 ${id}` })
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

  const filteredRecords = allRecords.filter(rec => {
    if (filterPeriod && rec.period !== filterPeriod) return false
    if (filterType && rec.type !== filterType) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const name = (rec.serverNickname || rec.discordName || '').toLowerCase()
      const team = (rec.teamName || '').toLowerCase()
      const id = (rec.discordId || '').toLowerCase()
      if (!name.includes(q) && !team.includes(q) && !id.includes(q)) return false
    }
    return true
  })

  const statsByPeriod = periods.map(p => ({
    period: p,
    total: allRecords.filter(r => r.period === p).length,
    team: allRecords.filter(r => r.period === p && r.type === '團體').length,
    personal: allRecords.filter(r => r.period === p && r.type === '個人').length,
  }))

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
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newPeriod}
            onChange={(e) => setNewPeriod(e.target.value)}
            placeholder="例：第10期 或 2025-06"
            style={{ margin: 0, flex: 1 }}
          />
          <button
            onClick={handleSavePeriod}
            disabled={saving || newPeriod.trim() === currentPeriod}
            style={{ whiteSpace: 'nowrap', padding: '10px 16px' }}
          >
            {saving ? '儲存中...' : '更新'}
          </button>
        </div>
        {periodMsg && (
          <p style={{
            marginTop: 8, fontSize: 13, fontWeight: 'bold',
            color: periodMsg.type === 'success' ? '#2ecc71' : '#e74c3c'
          }}>
            {periodMsg.type === 'success' ? '✓ ' : '✕ '}{periodMsg.text}
          </p>
        )}
      </div>

      {/* ── 管理員名單 ── */}
      <div className="admin-section">
        <h2 className="admin-section-title">👑 管理員名單</h2>

        {/* 現有管理員 */}
        {adminIds.length === 0 ? (
          <p style={{ color: '#bbb', fontSize: 13 }}>目前沒有其他管理員</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {adminIds.map((id) => (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#f8f8f8', border: '1px solid #eee',
                borderRadius: 8, padding: '8px 12px'
              }}>
                <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#444' }}>{id}</span>
                <button
                  className="btn-remove"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => handleRemoveAdmin(id)}
                  disabled={adminLoading}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 新增管理員 */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newAdminId}
            onChange={(e) => setNewAdminId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddAdmin()}
            placeholder="貼上 Discord ID（純數字）"
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
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>
          Discord ID 可在 Discord 開啟開發者模式後，對使用者右鍵點選「複製 ID」取得
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
          <h2 className="admin-section-title" style={{ margin: 0 }}>📋 所有建檔紀錄</h2>
          <button
            onClick={fetchAllRecords}
            disabled={loadingRecords}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {loadingRecords ? '載入中...' : allRecords.length > 0 ? '重新載入' : '載入紀錄'}
          </button>
        </div>

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
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#f8f9ff', border: '1px solid #e8e9ff',
                  borderRadius: 8, padding: '7px 12px', fontSize: 13
                }}>
                  <span style={{ fontWeight: 'bold', color: '#5865F2' }}>{s.period}</span>
                  <span style={{ color: '#666' }}>
                    共 <strong>{s.total}</strong> 筆
                    　個人 <strong>{s.personal}</strong>
                    　團體 <strong>{s.team}</strong>
                  </span>
                </div>
              ))}
            </div>

            {/* 期數篩選 tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <button
                onClick={() => setFilterPeriod('')}
                style={{
                  fontSize: 12, padding: '5px 12px',
                  background: filterPeriod === '' ? '#5865F2' : '#f0f0f0',
                  color: filterPeriod === '' ? 'white' : '#555'
                }}
              >全部</button>
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => setFilterPeriod(p)}
                  style={{
                    fontSize: 12, padding: '5px 12px',
                    background: filterPeriod === p ? '#5865F2' : '#f0f0f0',
                    color: filterPeriod === p ? 'white' : '#555'
                  }}
                >{p}</button>
              ))}
            </div>

            {/* 類型篩選 + 搜尋 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['', '個人', '團體'].map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    style={{
                      fontSize: 12, padding: '6px 12px',
                      background: filterType === t
                        ? (t === '團體' ? '#2ecc71' : t === '個人' ? '#5865F2' : '#555')
                        : '#f0f0f0',
                      color: filterType === t ? 'white' : '#555'
                    }}
                  >{t === '' ? '全類型' : t}</button>
                ))}
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜尋暱稱、隊伍、Discord ID"
                style={{ margin: 0, flex: 1, minWidth: 160, fontSize: 13 }}
              />
            </div>

            {/* 結果數 */}
            <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
              顯示 {filteredRecords.length} / {allRecords.length} 筆
            </p>

            {/* 紀錄列表 */}
            {filteredRecords.length === 0 ? (
              <p style={{ color: '#bbb', fontSize: 13, textAlign: 'center' }}>沒有符合條件的紀錄</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredRecords.map((rec, i) => (
                  <div key={i} className="record-card" style={{ gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 'bold', color: '#5865F2', fontSize: 14 }}>{rec.period}</span>
                      <span className={`type-badge type-badge--${rec.type === '團體' ? 'team' : 'personal'}`}>
                        {rec.type}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#444' }}>
                      {rec.serverNickname || rec.discordName}
                      {rec.teamName && <span style={{ color: '#888' }}> ／ {rec.teamName}</span>}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>
                      Discord: {rec.discordId} ・ {rec.createdTime ? rec.createdTime.split('T')[0] : ''}
                    </p>
                    {rec.googleAccounts && rec.googleAccounts.length > 0 && (
                      <p style={{ margin: 0, fontSize: 11, color: '#999' }}>
                        📧 {Array.isArray(rec.googleAccounts) ? rec.googleAccounts.join(', ') : rec.googleAccounts}
                      </p>
                    )}
                    {rec.folderUrl && (
                      <a href={rec.folderUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#5865F2' }}>📂 開啟資料夾</a>
                    )}
                  </div>
                ))}
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

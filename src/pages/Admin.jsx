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
            {loadingRecords ? '載入中...' : '載入紀錄'}
          </button>
        </div>

        {allRecords.length === 0 ? (
          <p style={{ color: '#bbb', fontSize: 13, textAlign: 'center' }}>
            點擊「載入紀錄」查看所有建檔資料
          </p>
        ) : (
          <>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>共 {allRecords.length} 筆</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allRecords.map((rec, i) => (
                <div key={i} className="record-card" style={{ gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 'bold', color: '#5865F2', fontSize: 14 }}>{rec.period}</span>
                    <span className={`type-badge type-badge--${rec.type === '團體' ? 'team' : 'personal'}`}>
                      {rec.type}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#444' }}>
                    {rec.serverNickname || rec.discordName}
                    {rec.teamName && ` ／ ${rec.teamName}`}
                  </p>
                  <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>
                    Discord: {rec.discordId} ・ {rec.createdTime ? rec.createdTime.split('T')[0] : ''}
                  </p>
                  {rec.googleAccounts && (
                    <p style={{ margin: 0, fontSize: 11, color: '#999' }}>
                      📧 {Array.isArray(rec.googleAccounts) ? rec.googleAccounts.join(', ') : rec.googleAccounts}
                    </p>
                  )}
                </div>
              ))}
            </div>
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

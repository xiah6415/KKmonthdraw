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

  // 管理員名單（每筆為 { id, name }）
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
  const [searchQuery, setSearchQuery] = useState('')

  // 管理員編輯紀錄
  const [editingKey, setEditingKey] = useState(null) // 'discordId_period'
  const [editDraft, setEditDraft] = useState({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState(null)

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

        {/* 新增管理員 */}
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
                {filteredRecords.map((rec, i) => {
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
                        </div>
                        {!isEditing && (
                          <button className="btn-edit" onClick={() => startEditRecord(rec)}>編輯</button>
                        )}
                      </div>

                      {isEditing ? (
                        /* ── 編輯模式 ── */
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
                        /* ── 檢視模式 ── */
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

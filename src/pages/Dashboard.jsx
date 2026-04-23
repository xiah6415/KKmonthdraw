import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET = import.meta.env.VITE_API_SECRET

function Dashboard() {
  const [records, setRecords] = useState([])
  const [discordUser, setDiscordUser] = useState(null)
  const [currentPeriod, setCurrentPeriod] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roleSelection, setRoleSelection] = useState(false)
  // 編輯 Google 帳號用
  const [editingIndex, setEditingIndex] = useState(null)
  const [editAccounts, setEditAccounts] = useState([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  const getDisplayName = (user) => user?.global_name || user?.username || user?.id || ''

  const saveUserToStorage = (user) => {
    localStorage.setItem('discordUser', JSON.stringify({
      user,
      expiry: Date.now() + 24 * 60 * 60 * 1000
    }))
  }

  const getUserFromStorage = () => {
    try {
      const data = JSON.parse(localStorage.getItem('discordUser'))
      if (!data || Date.now() > data.expiry) {
        localStorage.removeItem('discordUser')
        return null
      }
      return data.user
    } catch {
      return null
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = getUserFromStorage()

        if (storedUser) {
          // ── 已有 cache：單次請求取 records + currentPeriod ──
          setDiscordUser(storedUser)
          const res = await axios.get(API_URL, {
            params: {
              action: 'getUserRecords',
              discordId: storedUser.id,
              secret: SECRET
            }
          })
          if (!res.data.success) {
            setError('查詢紀錄失敗：' + JSON.stringify(res.data))
            return
          }
          const period = res.data.currentPeriod || ''
          setCurrentPeriod(period)
          if (res.data.records.length === 0) {
            navigate('/register', {
              state: { discordUser: storedUser, currentPeriod: period, records: [] }
            })
          } else {
            setRecords(res.data.records)
            if (res.data.isAdmin) { setIsAdmin(true); setRoleSelection(true) }
          }
          return
        }

        // ── 全新登入：合併兩個請求為一個 initDashboard ──
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (!code) {
          navigate('/')
          return
        }

        const res = await axios.get(API_URL, {
          params: { action: 'initDashboard', code, secret: SECRET }
        })

        if (res.data.error) {
          setError('Discord 登入失敗：' + res.data.error)
          return
        }

        const user = res.data.user
        const period = res.data.currentPeriod || ''
        const recs = res.data.records || []

        setDiscordUser(user)
        setCurrentPeriod(period)
        saveUserToStorage(user)

        if (recs.length === 0) {
          navigate('/register', {
            state: { discordUser: user, currentPeriod: period, records: [] }
          })
        } else {
          setRecords(recs)
          if (res.data.isAdmin) { setIsAdmin(true); setRoleSelection(true) }
        }

      } catch (err) {
        console.error('Dashboard error:', err.message)
        setError('發生錯誤：' + err.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const isRegisteredForCurrentPeriod = () =>
    currentPeriod && records.some(r => r.period === currentPeriod)

  // ── 編輯 Google 帳號 ──────────────────────────────────
  const startEdit = (index) => {
    const rec = records[index]
    const accounts = rec.googleAccounts
      ? (Array.isArray(rec.googleAccounts) ? rec.googleAccounts : rec.googleAccounts.split(','))
      : ['']
    setEditAccounts(accounts.map(a => a.trim()))
    setEditingIndex(index)
    setEditError(null)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditAccounts([])
    setEditError(null)
  }

  const saveEdit = async (record) => {
    const filtered = editAccounts.filter(a => a.trim() !== '')
    if (filtered.length === 0) {
      setEditError('至少需要一個 Google 帳號')
      return
    }
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await axios.get(API_URL, {
        params: {
          action: 'updateGoogleAccounts',
          discordId: discordUser.id,
          period: record.period,
          googleAccounts: filtered.join(','),
          secret: SECRET
        }
      })
      if (res.data.success) {
        setRecords(prev => prev.map((r, i) =>
          i === editingIndex ? { ...r, googleAccounts: filtered } : r
        ))
        cancelEdit()
      } else {
        setEditError('儲存失敗：' + (res.data.error || '未知錯誤'))
      }
    } catch (err) {
      setEditError('儲存失敗，請再試一次')
    } finally {
      setEditSaving(false)
    }
  }

  // ── Loading ───────────────────────────────────────────
  if (loading) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <h1>月月繪</h1>
      <div className="spinner" />
      <p style={{ color: '#999' }}>正在載入你的紀錄...</p>
    </div>
  )

  if (error) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <p style={{ color: 'red' }}>{error}</p>
    </div>
  )

  // ── 管理員 / 參加者 角色選擇 ───────────────────────────
  if (roleSelection) return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>月月繪</h1>
        {discordUser && (
          <p style={{ color: '#666', fontSize: 14 }}>
            👋 <strong style={{ color: '#5865F2' }}>{getDisplayName(discordUser)}</strong>，你有管理員權限
          </p>
        )}
      </div>
      <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>請選擇本次要以哪個身分進入</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          style={{ flex: 1, padding: '16px', fontSize: 16, background: '#e8b046' }}
          onClick={() => navigate('/admin', { state: { discordUser, isAdmin: true } })}
        >
          🛠️ 管理員
        </button>
        <button
          style={{ flex: 1, padding: '16px', fontSize: 16 }}
          onClick={() => setRoleSelection(false)}
        >
          🎨 參加者
        </button>
      </div>
      <button
        onClick={() => navigate('/help')}
        style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
      >
        ? 使用說明
      </button>
    </div>
  )

  // ── 主 Dashboard ─────────────────────────────────────
  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>月月繪</h1>
        {discordUser && (
          <p style={{ color: '#666', fontSize: 14 }}>
            👋 你好，<strong style={{ color: '#5865F2' }}>{getDisplayName(discordUser)}</strong>！
          </p>
        )}
      </div>

      {/* 本期尚未建檔提示 */}
      {currentPeriod && !isRegisteredForCurrentPeriod() && (
        <div className="cta-banner">
          <div>
            <p className="cta-title">📋 {currentPeriod} 尚未建檔</p>
            <p className="cta-sub">快來參加本期月月繪！</p>
          </div>
          <button
            className="cta-btn"
            onClick={() => navigate('/register', {
              state: { discordUser, currentPeriod, records }
            })}
          >
            立即建檔
          </button>
        </div>
      )}

      {/* 紀錄標題列 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, color: '#333', margin: 0 }}>我的月月繪紀錄</h2>
        <span style={{
          background: '#f0f0f0', borderRadius: 20, padding: '2px 10px',
          fontSize: 12, color: '#666'
        }}>{records.length} 筆</span>
      </div>

      {/* 紀錄列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {records.map((record, index) => (
          <div key={index} className="record-card">
            {/* 標頭 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: '#5865F2', fontSize: 16 }}>
                {record.period}
                {record.period === currentPeriod && (
                  <span className="current-badge">本期</span>
                )}
              </span>
              <span className={`type-badge type-badge--${record.type === '團體' ? 'team' : 'personal'}`}>
                {record.type}
              </span>
            </div>

            {record.teamName && (
              <p style={{ margin: 0, color: '#555', fontSize: 14 }}>🏷️ 隊伍：{record.teamName}</p>
            )}

            <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>
              🕐 建立時間：{record.createdTime ? record.createdTime.split('T')[0] : '未知'}
            </p>

            {/* 編輯 Google 帳號（展開區域） */}
            {editingIndex === index ? (
              <div className="edit-section">
                <p className="edit-title">📧 修改 Google 帳號</p>
                {editAccounts.map((acc, i) => (
                  <div key={i} className="account-row">
                    <input
                      type="email"
                      value={acc}
                      onChange={(e) => {
                        const next = [...editAccounts]
                        next[i] = e.target.value
                        setEditAccounts(next)
                      }}
                      placeholder="example@gmail.com"
                    />
                    {editAccounts.length > 1 && (
                      <button
                        className="btn-remove"
                        onClick={() => setEditAccounts(editAccounts.filter((_, j) => j !== i))}
                      >✕</button>
                    )}
                  </div>
                ))}
                {record.type === '團體' && (
                  <button
                    className="btn-add"
                    onClick={() => setEditAccounts([...editAccounts, ''])}
                  >+ 新增帳號</button>
                )}
                {editError && <p className="edit-error">{editError}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    style={{ flex: 1, background: '#2ecc71', fontSize: 13, padding: '8px' }}
                    onClick={() => saveEdit(record)}
                    disabled={editSaving}
                  >
                    {editSaving ? '儲存中...' : '儲存'}
                  </button>
                  <button
                    style={{ flex: 1, background: '#aaa', fontSize: 13, padding: '8px' }}
                    onClick={cancelEdit}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              /* 顯示現有帳號 + 編輯按鈕 */
              record.googleAccounts && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    📧 {Array.isArray(record.googleAccounts)
                      ? record.googleAccounts.join(', ')
                      : record.googleAccounts}
                  </div>
                  <button
                    className="btn-edit"
                    onClick={() => startEdit(index)}
                  >
                    編輯
                  </button>
                </div>
              )
            )}

            <a href={record.folderUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <button style={{ width: '100%', marginTop: 4, padding: 10, fontSize: 14 }}>
                📂 開啟資料夾
              </button>
            </a>
          </div>
        ))}
      </div>

      {/* 管理員入口 */}
      {isAdmin && (
        <button
          onClick={() => navigate('/admin', { state: { discordUser, isAdmin: true } })}
          style={{
            background: 'transparent', color: '#e8b046',
            border: '1px solid #e8b046', width: '100%', fontSize: 13
          }}
        >
          🛠️ 進入管理員後台
        </button>
      )}

      {/* 使用說明 */}
      <button
        onClick={() => navigate('/help')}
        style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
      >
        ? 使用說明
      </button>

      {/* 登出 */}
      <button
        onClick={() => { localStorage.removeItem('discordUser'); navigate('/') }}
        style={{
          background: 'transparent', color: '#aaa',
          border: '1px solid #ddd', width: '100%', fontSize: 13
        }}
      >
        登出
      </button>
    </div>
  )
}

export default Dashboard

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Dashboard() {
  const [records, setRecords] = useState([])
  const [discordUser, setDiscordUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const getDisplayName = (user) => {
    if (!user) return ''
    return user.global_name || user.username || user.id || ''
  }

  const saveUserToStorage = (user) => {
    const data = {
      user: user,
      expiry: Date.now() + 24 * 60 * 60 * 1000
    }
    localStorage.setItem('discordUser', JSON.stringify(data))
  }

  const getUserFromStorage = () => {
    try {
      const data = JSON.parse(localStorage.getItem('discordUser'))
      if (!data) return null
      if (Date.now() > data.expiry) {
        localStorage.removeItem('discordUser')
        return null
      }
      return data.user
    } catch {
      return null
    }
  }

  const fetchRecords = async (user) => {
    const recordsRes = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
      params: {
        action: 'getUserRecords',
        discordId: user.id,
        secret: import.meta.env.VITE_API_SECRET
      }
    })

    if (recordsRes.data.success) {
      if (recordsRes.data.records.length === 0) {
        navigate('/register', { state: { discordUser: user } })
      } else {
        setRecords(recordsRes.data.records)
      }
    } else {
      setError('查詢紀錄失敗：' + JSON.stringify(recordsRes.data))
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = getUserFromStorage()
        if (storedUser) {
          setDiscordUser(storedUser)
          await fetchRecords(storedUser)
          setLoading(false)
          return
        }

        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        if (!code) {
          navigate('/')
          return
        }

        const userRes = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
          params: {
            action: 'getDiscordUser',
            code: code,
            secret: import.meta.env.VITE_API_SECRET
          }
        })

        const user = userRes.data

        if (user.error) {
          setError('Discord 登入失敗：' + user.error)
          setLoading(false)
          return
        }

        setDiscordUser(user)
        saveUserToStorage(user)
        await fetchRecords(user)

      } catch (err) {
        console.error('Dashboard error:', err.message)
        setError('發生錯誤：' + err.message)
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  if (loading) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <h1>月月繪</h1>
      <div className="spinner"></div>
      <p style={{ color: '#999' }}>正在載入你的紀錄...</p>
    </div>
  )

  if (error) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <p style={{ color: 'red' }}>{error}</p>
    </div>
  )

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>月月繪</h1>
        {discordUser && (
          <p style={{ color: '#666', fontSize: '14px' }}>
            👋 你好，<strong style={{ color: '#5865F2' }}>{getDisplayName(discordUser)}</strong>！
          </p>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <h2 style={{ fontSize: '16px', color: '#333', margin: 0 }}>我的月月繪紀錄</h2>
        <span style={{
          background: '#f0f0f0',
          borderRadius: '20px',
          padding: '2px 10px',
          fontSize: '12px',
          color: '#666'
        }}>{records.length} 筆</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {records.map((record, index) => (
          <div key={index} style={{
            border: '1px solid #eee',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: '#5865F2', fontSize: '16px' }}>{record.period}</span>
              <span style={{
                background: record.type === '團體' ? '#2ecc71' : '#5865F2',
                color: 'white',
                padding: '3px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>{record.type}</span>
            </div>

            {record.teamName && (
              <p style={{ margin: 0, color: '#555', fontSize: '14px' }}>
                🏷️ 隊伍：{record.teamName}
              </p>
            )}

            <p style={{ margin: 0, color: '#aaa', fontSize: '12px' }}>
              🕐 建立時間：{record.createdTime ? record.createdTime.split('T')[0] : '未知'}
            </p>

            <a href={record.folderUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <button style={{ width: '100%', marginTop: '4px', padding: '10px', fontSize: '14px' }}>
                📂 開啟資料夾
              </button>
            </a>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          localStorage.removeItem('discordUser')
          navigate('/')
        }}
        style={{
          background: 'transparent',
          color: '#aaa',
          border: '1px solid #ddd',
          marginTop: '16px',
          width: '100%',
          fontSize: '13px'
        }}
      >
        登出
      </button>
    </div>
  )
}

export default Dashboard
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Dashboard() {
  const [records, setRecords] = useState([])
  const [discordUser, setDiscordUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (!code) {
      navigate('/')
      return
    }

    const init = async () => {
      try {
        const userRes = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
          params: {
            action: 'getDiscordUser',
            code: code,
            secret: import.meta.env.VITE_API_SECRET
          }
        })

        const user = userRes.data
        console.log('user:', JSON.stringify(user))

        if (user.error) {
          setError('Discord 登入失敗：' + user.error)
          return
        }

        setDiscordUser(user)

        const recordsRes = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
          params: {
            action: 'getUserRecords',
            discordId: user.id,
            secret: import.meta.env.VITE_API_SECRET
          }
        })

        console.log('records:', JSON.stringify(recordsRes.data))

        if (recordsRes.data.success) {
          if (recordsRes.data.records.length === 0) {
         navigate('/register', { state: { discordUser: user } })
          } else {
            setRecords(recordsRes.data.records)
          }
        } else {
          setError('查詢紀錄失敗：' + JSON.stringify(recordsRes.data))
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

  const getDisplayName = (user) => {
    if (!user) return ''
    return user.global_name || user.username || user.id || ''
  }

  if (loading) return <div className="container"><p>載入中...</p></div>

  if (error) return <div className="container"><p style={{ color: 'red' }}>{error}</p></div>

  return (
    <div className="container">
      <h1>月月繪</h1>

      {discordUser && (
        <p>👋 你好，<strong>{getDisplayName(discordUser)}</strong>！</p>
      )}

      <h2 style={{ fontSize: '18px', color: '#333' }}>我的月月繪紀錄</h2>

      {records.map((record, index) => (
        <div key={index} style={{
          border: '1px solid #eee',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: '#5865F2' }}>{record.period}</span>
            <span style={{
              background: record.type === '團體' ? '#2ecc71' : '#5865F2',
              color: 'white',
              padding: '2px 10px',
              borderRadius: '20px',
              fontSize: '12px'
            }}>{record.type}</span>
          </div>

          {record.teamName && (
            <p style={{ margin: 0, color: '#666' }}>隊伍：{record.teamName}</p>
          )}

          <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
          建立時間：{record.createdTime ? record.createdTime.split('T')[0] : '未知'}
          </p>

          <a href={record.folderUrl} target="_blank" rel="noreferrer">
            <button style={{ width: '100%' }}>開啟資料夾</button>
          </a>
        </div>
      ))}
    </div>
  )
}

export default Dashboard
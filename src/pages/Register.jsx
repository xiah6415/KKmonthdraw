import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Register() {
  const [discordUser, setDiscordUser] = useState(null)
  const [type, setType] = useState('personal')
  const [teamName, setTeamName] = useState('')
  const [serverNickname, setServerNickname] = useState('')
  const [googleAccounts, setGoogleAccounts] = useState([''])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (!code) {
      navigate('/')
      return
    }

    const fetchDiscordUser = async () => {
      try {
        const res = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
          params: {
            action: 'getDiscordUser',
            code: code,
            secret: import.meta.env.VITE_API_SECRET
          }
        })
        setDiscordUser(res.data)
      } catch (err) {
        console.error(err)
        navigate('/')
      } finally {
        setLoading(false)
      }
    }

    fetchDiscordUser()
  }, [])

  const getDisplayName = (user) => {
    if (!user) return ''
    return user.global_name || user.username || user.id || ''
  }

  const addGoogleAccount = () => setGoogleAccounts([...googleAccounts, ''])

  const updateGoogleAccount = (index, value) => {
    const updated = [...googleAccounts]
    updated[index] = value
    setGoogleAccounts(updated)
  }

  const removeGoogleAccount = (index) => {
    setGoogleAccounts(googleAccounts.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!serverNickname) {
      alert('請填入伺服器暱稱')
      return
    }
    if (googleAccounts.filter(a => a !== '').length === 0) {
      alert('請至少填入一個 Google 帳號')
      return
    }
    if (type === 'team' && !teamName) {
      alert('請填入隊伍名稱')
      return
    }

    setSubmitting(true)
    try {
      const res = await axios.get(import.meta.env.VITE_APPS_SCRIPT_URL, {
        params: {
          action: 'createFolder',
          type: type,
          teamName: teamName,
          discordId: discordUser.id,
          discordName: getDisplayName(discordUser),
          serverNickname: serverNickname,
          googleAccounts: googleAccounts.filter(a => a !== '').join(','),
          secret: import.meta.env.VITE_API_SECRET
        }
      })
      if (res.data.success) {
        alert(`建檔成功！\n資料夾名稱：${res.data.folderName}\n連結：${res.data.folderUrl}`)
      } else {
        alert('建檔失敗：' + res.data.error)
      }
    } catch (err) {
      console.error(err)
      alert('建檔失敗，請再試一次')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="container"><p>載入中...</p></div>

  return (
    <div className="container">
      <h1>月月繪 建檔系統</h1>

      {discordUser && (
        <p>👋 你好，<strong>{getDisplayName(discordUser)}</strong>！</p>
      )}

      <div>
        <label>伺服器暱稱：</label>
        <input
          type="text"
          value={serverNickname}
          onChange={(e) => setServerNickname(e.target.value)}
          placeholder="請輸入你在伺服器裡的暱稱"
        />
      </div>

      <div>
        <label>參加類型：</label>
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <button onClick={() => setType('personal')} className={type === 'personal' ? 'active' : ''}>個人</button>
          <button onClick={() => setType('team')} className={type === 'team' ? 'active' : ''}>團體</button>
        </div>
      </div>

      {type === 'team' && (
        <div>
          <label>隊伍名稱：</label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="請輸入隊伍名稱"
          />
        </div>
      )}

      <div>
        <label>Google 帳號：</label>
        {googleAccounts.map((account, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="email"
              value={account}
              onChange={(e) => updateGoogleAccount(index, e.target.value)}
              placeholder="請輸入 Google 帳號"
            />
            {googleAccounts.length > 1 && (
              <button onClick={() => removeGoogleAccount(index)} style={{ background: '#e74c3c', padding: '10px' }}>✕</button>
            )}
          </div>
        ))}
        {type === 'team' && (
          <button onClick={addGoogleAccount} style={{ marginTop: '8px', background: '#2ecc71' }}>+ 新增帳號</button>
        )}
      </div>

      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? '建檔中...' : '送出建檔'}
      </button>
    </div>
  )
}

export default Register
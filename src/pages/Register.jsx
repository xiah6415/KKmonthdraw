import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET = import.meta.env.VITE_API_SECRET
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI

function Register() {
  const [discordUser, setDiscordUser] = useState(null)
  const [type, setType] = useState('personal')
  const [teamName, setTeamName] = useState('')
  const [serverNickname, setServerNickname] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const init = async () => {
      try {
        if (location.state?.discordUser) {
          setDiscordUser(location.state.discordUser)
          setLoading(false)
          return
        }

        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (!code) { navigate('/'); return }

        const res = await axios.get(API_URL, {
          params: { action: 'getDiscordUser', code, secret: SECRET, redirect_uri: REDIRECT_URI }
        })
        if (res.data.error) { navigate('/'); return }
        setDiscordUser(res.data)
      } catch {
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const getDisplayName = (user) => user?.global_name || user?.username || user?.id || ''

  const getAvatarUrl = (user) => {
    if (!user) return ''
    if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || '0') % 5}.png`
  }

  const handleSubmit = async () => {
    setErrorMsg(null)
    if (!serverNickname.trim()) { setErrorMsg('請填入伺服器暱稱'); return }
    if (!email.trim()) { setErrorMsg('請填入你的 Google 信箱'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErrorMsg('信箱格式不正確'); return }
    if (type === 'team' && !teamName.trim()) { setErrorMsg('請填入隊伍名稱'); return }

    setSubmitting(true)
    try {
      await Promise.all([
        axios.get(API_URL, {
          params: {
            action: 'saveUserInfo',
            discordId: discordUser.id,
            nickname: serverNickname.trim(),
            type,
            teamName: teamName.trim(),
            secret: SECRET
          }
        }),
        axios.get(API_URL, {
          params: {
            action: 'saveProfile',
            discordId: discordUser.id,
            email: email.trim().toLowerCase(),
            secret: SECRET
          }
        })
      ])
      navigate('/dashboard')
    } catch {
      setErrorMsg('登記失敗，請再試一次')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="container" style={{ textAlign: 'center' }}>
      <h1>月月繪</h1>
      <div className="spinner" />
      <p style={{ color: '#999', marginTop: 8 }}>載入中...</p>
    </div>
  )

  return (
    <div className="container">
      <div className="register-header">
        <h1>月月繪</h1>
        <span className="period-badge">帳號設定</span>
      </div>

      {discordUser && (
        <div className="user-greeting">
          <img src={getAvatarUrl(discordUser)} alt="avatar" className="avatar" />
          <div>
            <p className="greeting-name">{getDisplayName(discordUser)}</p>
            <p className="greeting-sub">先登記你的基本資料，本期建檔在 Dashboard 完成</p>
          </div>
        </div>
      )}

      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      <div className="form-section">
        <label className="form-label">
          <span className="label-icon">💬</span> 伺服器暱稱
        </label>
        <input
          type="text"
          value={serverNickname}
          onChange={e => setServerNickname(e.target.value)}
          placeholder="你在伺服器裡的暱稱"
        />
      </div>

      <div className="form-section">
        <label className="form-label">
          <span className="label-icon">🎨</span> 參加類型
        </label>
        <div className="type-toggle">
          <button
            className={type === 'personal' ? 'toggle-btn active' : 'toggle-btn'}
            onClick={() => setType('personal')}
          >
            個人
          </button>
          <button
            className={type === 'team' ? 'toggle-btn active' : 'toggle-btn'}
            onClick={() => setType('team')}
          >
            團體
          </button>
        </div>
      </div>

      {type === 'team' && (
        <div className="form-section">
          <label className="form-label">
            <span className="label-icon">🏷️</span> 隊伍名稱
          </label>
          <input
            type="text"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="請輸入隊伍名稱"
          />
        </div>
      )}

      <div className="form-section">
        <label className="form-label">
          <span className="label-icon">📧</span> Google 信箱
        </label>
        <p className="form-hint">填入你自己的 Gmail，讓隊長建檔時可以把你關聯到隊伍紀錄</p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="example@gmail.com"
        />
      </div>

      <button onClick={handleSubmit} disabled={submitting} className="btn-submit">
        {submitting ? <><span className="btn-spinner" /> 登記中...</> : '完成登記'}
      </button>

      <button
        onClick={() => navigate('/help')}
        style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
      >
        ? 使用說明
      </button>
    </div>
  )
}

export default Register

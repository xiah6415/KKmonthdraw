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
  const [googleAccounts, setGoogleAccounts] = useState([''])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [targetPeriod, setTargetPeriod] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [claimMatches, setClaimMatches] = useState([])
  const [claimChecked, setClaimChecked] = useState({})
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [pendingSubmitEmails, setPendingSubmitEmails] = useState([])
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const init = async () => {
      try {
        if (location.state?.discordUser) {
          const user = location.state.discordUser
          const period = location.state.targetPeriod || ''
          const records = location.state.records || []
          setDiscordUser(user)
          setTargetPeriod(period)
          if (period && records.some(r => r.period === period)) {
            setAlreadyRegistered(true)
          }
          setLoading(false)
          return
        }

        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (!code) {
          navigate('/')
          return
        }

        const res = await axios.get(API_URL, {
          params: { action: 'getDiscordUser', code, secret: SECRET, redirect_uri: REDIRECT_URI }
        })
        if (res.data.error) {
          navigate('/')
          return
        }
        setDiscordUser(res.data)
      } catch (err) {
        console.error(err)
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
    setErrorMsg(null)
    if (!serverNickname.trim()) { setErrorMsg('請填入伺服器暱稱'); return }
    if (googleAccounts.filter(a => a.trim() !== '').length === 0) { setErrorMsg('請至少填入一個 Google 帳號'); return }
    if (type === 'team' && !teamName.trim()) { setErrorMsg('請填入隊伍名稱'); return }

    const emails = googleAccounts.filter(a => a.trim() !== '')

    setSubmitting(true)
    try {
      const checkRes = await axios.get(API_URL, {
        params: { action: 'findTeamsByEmail', emails: emails.join(','), excludePeriod: targetPeriod, secret: SECRET }
      })
      const matches = checkRes.data.matches || []
      if (matches.length > 0) {
        setClaimMatches(matches)
        setClaimChecked(Object.fromEntries(matches.map((_, i) => [i, true])))
        setPendingSubmitEmails(emails)
        setShowClaimModal(true)
        setSubmitting(false)
        return
      }
    } catch (err) {
      console.error('email check error', err)
    }

    await doSubmit([])
  }

  const doSubmit = async (confirmedMatches) => {
    setShowClaimModal(false)
    setSubmitting(true)
    try {
      const res = await axios.get(API_URL, {
        params: {
          action: 'createFolder',
          type,
          teamName: teamName.trim(),
          discordId: discordUser.id,
          discordName: getDisplayName(discordUser),
          discordUsername: discordUser.username || '',
          serverNickname: serverNickname.trim(),
          googleAccounts: googleAccounts.filter(a => a.trim() !== '').join(','),
          targetPeriod,
          secret: SECRET
        }
      })
      if (res.data.success) {
        for (const match of confirmedMatches) {
          try {
            await axios.get(API_URL, {
              params: {
                action: 'claimRecordByEmail',
                username: discordUser.username || discordUser.id,
                period: match.period,
                teamName: match.teamName,
                attendanceStatus: match.reportStatus,
                secret: SECRET
              }
            })
          } catch (err) {
            console.error('claim error', err)
          }
        }
        setSuccess({ folderName: res.data.folderName, folderUrl: res.data.folderUrl, period: res.data.currentPeriod })
      } else if (res.data.error === 'already_registered') {
        setAlreadyRegistered(true)
      } else {
        setErrorMsg('建檔失敗：' + (res.data.error || '未知錯誤'))
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('建檔失敗，請再試一次')
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

  if (alreadyRegistered) return (
    <div className="container">
      <div className="result-card result-card--already">
        <div className="result-icon">✓</div>
        <h2>你已建檔本期</h2>
        {targetPeriod && <p className="result-sub">{targetPeriod} 已有建檔紀錄</p>}
        <button onClick={() => navigate('/dashboard', { state: { discordUser } })}>
          返回 Dashboard
        </button>
        <button
          onClick={() => navigate('/help')}
          style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
        >
          ? 使用說明
        </button>
      </div>
    </div>
  )

  if (success) return (
    <div className="container">
      <div className="result-card result-card--success">
        <div className="result-icon result-icon--success">✓</div>
        <h2>建檔成功！</h2>
        {success.period && <p className="result-period">{success.period}</p>}
        <p className="result-folder-name">{success.folderName}</p>
        <a
          href={success.folderUrl}
          target="_blank"
          rel="noreferrer"
          className="folder-link-btn"
        >
          📂 開啟我的資料夾
        </a>
        <button
          className="btn-ghost"
          onClick={() => navigate('/dashboard', { state: { discordUser } })}
        >
          返回 Dashboard
        </button>
        <button
          onClick={() => navigate('/help')}
          style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
        >
          ? 使用說明
        </button>
      </div>
    </div>
  )

  return (
    <div className="container">
      <div className="register-header">
        <h1>月月繪</h1>
        {targetPeriod && <span className="period-badge">{targetPeriod}</span>}
      </div>

      {discordUser && (
        <div className="user-greeting">
          <img src={getAvatarUrl(discordUser)} alt="avatar" className="avatar" />
          <div>
            <p className="greeting-name">{getDisplayName(discordUser)}</p>
            <p className="greeting-sub">請填寫以下資料完成建檔</p>
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
          onChange={(e) => setServerNickname(e.target.value)}
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
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="請輸入隊伍名稱"
          />
        </div>
      )}

      <div className="form-section">
        <label className="form-label">
          <span className="label-icon">📧</span> Google 帳號
        </label>
        <p className="form-hint">用於資料夾共用，請填入正確的 Gmail</p>
        <div className="google-accounts">
          {googleAccounts.map((account, index) => (
            <div key={index} className="account-row">
              <input
                type="email"
                value={account}
                onChange={(e) => updateGoogleAccount(index, e.target.value)}
                placeholder="example@gmail.com"
              />
              {googleAccounts.length > 1 && (
                <button className="btn-remove" onClick={() => removeGoogleAccount(index)}>✕</button>
              )}
            </div>
          ))}
          {type === 'team' && (
            <button className="btn-add" onClick={addGoogleAccount}>
              + 新增隊員帳號
            </button>
          )}
        </div>
      </div>

      <button onClick={handleSubmit} disabled={submitting} className="btn-submit">
        {submitting ? <><span className="btn-spinner" /> 建檔中...</> : '送出建檔'}
      </button>

      <button
        onClick={() => navigate('/help')}
        style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', width: '100%', fontSize: 13 }}
      >
        ? 使用說明
      </button>

      {showClaimModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20
        }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>找到舊期紀錄</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#555' }}>
              你的 Google 帳號在以下期數有參加記錄，是否一併認領至你的帳號？
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {claimMatches.map((match, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={claimChecked[i] ?? true}
                    onChange={e => setClaimChecked(prev => ({ ...prev, [i]: e.target.checked }))}
                    style={{ width: 16, height: 16 }}
                  />
                  <span>{match.period}「<strong>{match.teamName}</strong>」</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ flex: 1, background: '#5865F2', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer' }}
                onClick={() => doSubmit(claimMatches.filter((_, i) => claimChecked[i]))}
              >
                確認
              </button>
              <button
                style={{ flex: 1, background: '#eee', color: '#555', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer' }}
                onClick={() => doSubmit([])}
              >
                略過
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Register

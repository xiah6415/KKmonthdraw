import { useState, useEffect } from 'react'

const GAS_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET  = import.meta.env.VITE_API_SECRET

const TYPE_LABEL = {
  individual: '個人找隊',
  team: '隊伍缺人',
}

const TYPE_COLOR = {
  individual: '#5865F2',
  team: '#57ab5a',
}

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return '剛剛'
  if (m < 60) return `${m} 分鐘前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小時前`
  return `${Math.floor(h / 24)} 天前`
}

export default function Squad() {
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [nickname, setNickname] = useState('')
  const [message, setMessage]   = useState('')
  const [type, setType]         = useState('individual')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  useEffect(() => { fetchPosts() }, [])

  async function fetchPosts() {
    setLoading(true)
    try {
      const res = await fetch(`${GAS_URL}?secret=${encodeURIComponent(SECRET)}&action=getSquadPosts`)
      const data = await res.json()
      if (data.success) setPosts(data.posts)
    } catch {
      // silent fail, show empty
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nickname.trim() || !message.trim()) return
    setSubmitting(true)
    try {
      const params = new URLSearchParams({ secret: SECRET, action: 'createSquadPost', nickname: nickname.trim(), message: message.trim(), type })
      const res = await fetch(`${GAS_URL}?${params}`)
      let data = null
      try { data = await res.json() } catch { data = null }
      if (data?.success) {
        setSuccess(true)
        setNickname('')
        setMessage('')
        setShowForm(false)
        fetchPosts()
        setTimeout(() => setSuccess(false), 4000)
      } else if (data?.error) {
        setError(data.error)
      } else {
        setError('發文失敗，請稍後再試')
      }
    } catch (err) {
      setError('錯誤：' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = filter === 'all' ? posts : posts.filter(p => p.type === filter)

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>🎨 隊伍徵求版</h1>
          <p style={styles.subtitle}>找隊友或招募隊員，找到後請回伺服器討論串聯絡對方</p>
        </div>

        <div style={styles.toolbar}>
          <div style={styles.tabs}>
            {[['all', '全部'], ['individual', '個人找隊'], ['team', '隊伍缺人']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{ ...styles.tab, ...(filter === key ? styles.tabActive : {}) }}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowForm(f => !f); setError('') }} style={styles.postBtn}>
            {showForm ? '✕ 取消' : '＋ 張貼'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.typeRow}>
              {[['individual', '個人找隊'], ['team', '隊伍缺人']].map(([v, label]) => (
                <label key={v} style={styles.typeLabel}>
                  <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} />
                  {' '}{label}
                </label>
              ))}
            </div>
            <input
              placeholder="伺服器暱稱（最多 30 字）"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={30}
              required
              style={styles.input}
            />
            <textarea
              placeholder="徵求訊息（最多 100 字）"
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={100}
              required
              rows={3}
              style={styles.textarea}
            />
            <div style={styles.formFooter}>
              <span style={styles.charCount}>{message.length}/100</span>
              {error && <span style={styles.errorText}>{error}</span>}
              <button type="submit" disabled={submitting || !nickname.trim() || !message.trim()} style={styles.submitBtn}>
                {submitting ? '張貼中…' : '張貼'}
              </button>
            </div>
          </form>
        )}

        {success && <div style={styles.successBanner}>✅ 張貼成功！</div>}

        {loading ? (
          <div style={styles.empty}>載入中…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>目前沒有徵求貼文</div>
        ) : (
          <div style={styles.list}>
            {filtered.map(post => (
              <div key={post.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={{ ...styles.badge, background: TYPE_COLOR[post.type] }}>
                    {TYPE_LABEL[post.type] || post.type}
                  </span>
                  <span style={styles.cardName}>{post.nickname}</span>
                  <span style={styles.cardTime}>{post.time ? timeAgo(post.time) : ''}</span>
                </div>
                <p style={styles.cardMessage}>{post.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    padding: '40px 16px',
  },
  container: {
    maxWidth: 640,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: {
    background: 'white',
    borderRadius: 12,
    padding: '28px 28px 20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: 24,
    color: '#5865F2',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 1.5,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  tabs: {
    display: 'flex',
    gap: 8,
  },
  tab: {
    padding: '7px 14px',
    borderRadius: 20,
    border: '1.5px solid #ddd',
    background: 'white',
    color: '#555',
    fontSize: 13,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: '#5865F2',
    borderColor: '#5865F2',
    color: 'white',
  },
  postBtn: {
    padding: '8px 18px',
    borderRadius: 20,
    border: 'none',
    background: '#5865F2',
    color: 'white',
    fontSize: 13,
    cursor: 'pointer',
  },
  form: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  typeRow: {
    display: 'flex',
    gap: 20,
    fontSize: 14,
  },
  typeLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    fontWeight: 'normal',
    whiteSpace: 'nowrap',
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box',
  },
  formFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  charCount: {
    fontSize: 12,
    color: '#aaa',
    marginRight: 'auto',
  },
  errorText: {
    fontSize: 13,
    color: '#e53e3e',
  },
  submitBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#5865F2',
    color: 'white',
    fontSize: 14,
    cursor: 'pointer',
  },
  successBanner: {
    background: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: 8,
    padding: '12px 16px',
    color: '#276749',
    fontSize: 14,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    background: 'white',
    borderRadius: 12,
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  badge: {
    fontSize: 11,
    color: 'white',
    padding: '3px 9px',
    borderRadius: 20,
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  cardName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  cardTime: {
    fontSize: 12,
    color: '#aaa',
    whiteSpace: 'nowrap',
  },
  cardMessage: {
    fontSize: 14,
    color: '#444',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 14,
    padding: '40px 0',
  },
}

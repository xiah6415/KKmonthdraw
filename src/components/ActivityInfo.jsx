import { useState, useEffect } from 'react'

function ActivityInfo({ startDate, endDate, extendDate }) {
  const [countdown, setCountdown] = useState('')
  const [phase, setPhase] = useState('active') // 'active' | 'extended' | 'ended'

  useEffect(() => {
    if (!endDate) return

    const calc = () => {
      const now = new Date()
      const end = new Date(endDate + 'T23:59:59')
      const ext = extendDate ? new Date(extendDate + 'T23:59:59') : null

      if (now <= end) {
        setPhase('active')
        const diff = end - now
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        setCountdown(`${days} 天 ${hours} 小時 ${minutes} 分`)
      } else if (ext && now <= ext) {
        setPhase('extended')
        setCountdown('')
      } else {
        setPhase('ended')
        setCountdown('')
      }
    }

    calc()
    const timer = setInterval(calc, 60000)
    return () => clearInterval(timer)
  }, [endDate, extendDate])

  if (!startDate && !endDate) return null

  return (
    <div className="activity-info">
      {startDate && endDate && (
        <p className="activity-period">📅 活動期間：{startDate} ～ {endDate}</p>
      )}
      {endDate && phase === 'active' && (
        <p className="activity-countdown">⏰ 距離截止還有 <strong>{countdown}</strong></p>
      )}
      {phase === 'extended' && (
        <p className="activity-countdown">🔔 活動進入延長階段，截止 <strong>{extendDate}</strong></p>
      )}
      {phase === 'ended' && (
        <p className="activity-ended">🔒 活動已結束</p>
      )}
    </div>
  )
}

export default ActivityInfo

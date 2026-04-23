import { useState, useEffect } from 'react'

function ActivityInfo({ startDate, endDate }) {
  const [countdown, setCountdown] = useState('')
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    if (!endDate) return

    const calc = () => {
      const now = new Date()
      const end = new Date(endDate + 'T23:59:59')
      const diff = end - now

      if (diff <= 0) {
        setEnded(true)
        setCountdown('')
        return
      }

      setEnded(false)
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      setCountdown(`${days} 天 ${hours} 小時 ${minutes} 分`)
    }

    calc()
    const timer = setInterval(calc, 60000)
    return () => clearInterval(timer)
  }, [endDate])

  if (!startDate && !endDate) return null

  return (
    <div className="activity-info">
      {startDate && endDate && (
        <p className="activity-period">📅 活動期間：{startDate} ～ {endDate}</p>
      )}
      {endDate && (
        ended
          ? <p className="activity-ended">🔒 活動已結束</p>
          : <p className="activity-countdown">⏰ 距離截止還有 <strong>{countdown}</strong></p>
      )}
    </div>
  )
}

export default ActivityInfo

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import ActivityInfo from '../components/ActivityInfo'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const SECRET = import.meta.env.VITE_API_SECRET

function Home() {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID
    const redirectUri = encodeURIComponent(import.meta.env.VITE_REDIRECT_URI)
    const scope = encodeURIComponent('identify')
    const navigate = useNavigate()
    const [activityInfo, setActivityInfo] = useState({ startDate: '', endDate: '' })

    useEffect(() => {
        axios.get(API_URL, { params: { action: 'getPeriod', secret: SECRET } })
            .then(res => {
                if (res.data) {
                    setActivityInfo({
                        startDate: res.data.startDate || '',
                        endDate: res.data.endDate || ''
                    })
                }
            })
            .catch(() => {})
    }, [])

    const handleDiscordLogin = () => {
        window.location.href = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`
    }

    return (
        <div className="container">
            <h1>月月繪</h1>
            <ActivityInfo startDate={activityInfo.startDate} endDate={activityInfo.endDate} />
            <p>請用 Discord 登入</p>
            <button onClick={handleDiscordLogin}>
                Discord 登入
            </button>
            <button
                onClick={() => navigate('/help')}
                style={{ background: 'transparent', color: '#888', border: '1px solid #ddd', fontSize: 13 }}
            >
                ? 使用說明
            </button>
        </div>
    )
}

export default Home

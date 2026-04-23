import { useNavigate } from 'react-router-dom'

function Home() {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID
    const redirectUri = encodeURIComponent(import.meta.env.VITE_REDIRECT_URI)
    const scope = encodeURIComponent('identify')
    const navigate = useNavigate()

    const handleDiscordLogin = () => {
        window.location.href = `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`
    }

    return (
        <div className="container">
            <h1>月月繪</h1>
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
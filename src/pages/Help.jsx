import { useNavigate } from 'react-router-dom'

const steps = [
  {
    icon: '1',
    title: 'Discord 登入',
    content: (
      <>
        <p>點擊首頁的「Discord 登入」按鈕，授權後會自動跳轉回網站。</p>
        <p className="help-tip">只需要授權讀取你的基本 Discord 資料，不會取得任何訊息權限。</p>
      </>
    )
  },
  {
    icon: '2',
    title: '填寫報名資料',
    content: (
      <>
        <div className="help-field">
          <span className="help-field-label">💬 伺服器暱稱</span>
          <span className="help-field-desc">填入你在 Discord 伺服器裡的暱稱（顯示名稱）。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">🎨 參加類型</span>
          <span className="help-field-desc">
            選擇「個人」或「團體」。<br />
            選擇團體時需額外填入隊伍名稱。
          </span>
        </div>
        <div className="help-field">
          <span className="help-field-label">📧 Google 帳號</span>
          <span className="help-field-desc">
            填入你的 Gmail，系統會將作品上傳資料夾的編輯權限分享給這個帳號。<br />
            團體參加者可新增多位隊員的帳號。
          </span>
        </div>
        <p className="help-tip">填完後點擊「送出建檔」，成功後會顯示你的 Google 資料夾連結。</p>
      </>
    )
  },
  {
    icon: '3',
    title: '上傳作品',
    content: (
      <>
        <p>建檔成功後，點擊「📂 開啟我的資料夾」進入你的 Google 雲端資料夾，將作品上傳至該資料夾即可。</p>
        <p className="help-tip">請確認用報名時填入的 Google 帳號登入，才能看到並編輯資料夾。</p>
      </>
    )
  },
  {
    icon: '4',
    title: 'Dashboard 功能',
    content: (
      <>
        <div className="help-field">
          <span className="help-field-label">📋 歷期紀錄</span>
          <span className="help-field-desc">登入後可查看你每一期的建檔紀錄與資料夾連結。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">✏️ 修改 Google 帳號</span>
          <span className="help-field-desc">每筆紀錄右上角有「編輯」按鈕，可以更新 Google 帳號。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">📋 本期尚未建檔</span>
          <span className="help-field-desc">若新的一期已開始，Dashboard 上方會出現提示，點擊「立即建檔」即可報名。</span>
        </div>
      </>
    )
  }
]

const faqs = [
  {
    q: '已經建過檔，但想再報名本期怎麼辦？',
    a: '登入後若本期尚未建檔，Dashboard 上方會出現「立即建檔」按鈕，點擊即可報名本期。'
  },
  {
    q: 'Google 帳號填錯了怎麼辦？',
    a: '到 Dashboard 找到該期紀錄，點擊右上角「編輯」按鈕即可修改 Google 帳號。'
  },
  {
    q: '資料夾看不到、無法編輯怎麼辦？',
    a: '請確認你是用報名時填寫的 Google 帳號登入 Google 雲端硬碟。如果帳號沒問題，可以請管理員確認資料夾共用是否正確。'
  },
  {
    q: '個人和團體的差別？',
    a: '個人建立一個屬於自己的資料夾。團體則以隊伍名稱建立，可以新增多位隊員的 Google 帳號，讓所有人都能存取同一個資料夾。'
  }
]

function Help() {
  const navigate = useNavigate()

  return (
    <div className="container">
      <div style={{ textAlign: 'center' }}>
        <h1>月月繪</h1>
        <p style={{ color: '#888', fontSize: 14, marginTop: 4 }}>使用說明</p>
      </div>

      {/* 步驟說明 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {steps.map((step) => (
          <div key={step.icon} className="help-step">
            <div className="help-step-header">
              <span className="help-step-num">{step.icon}</span>
              <span className="help-step-title">{step.title}</span>
            </div>
            <div className="help-step-body">
              {step.content}
            </div>
          </div>
        ))}
      </div>

      {/* 常見問題 */}
      <div>
        <h2 style={{ fontSize: 15, color: '#333', marginBottom: 12 }}>常見問題</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {faqs.map((faq, i) => (
            <div key={i} className="help-faq">
              <p className="help-faq-q">Q：{faq.q}</p>
              <p className="help-faq-a">A：{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => navigate('/')}
        style={{ background: 'transparent', color: '#5865F2', border: '1px solid #5865F2', fontSize: 13 }}
      >
        返回首頁
      </button>
    </div>
  )
}

export default Help

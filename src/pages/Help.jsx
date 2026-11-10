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
    title: '建立個人資料',
    content: (
      <>
        <p>第一次登入會進入報名頁，填寫以下資料：</p>
        <div className="help-field">
          <span className="help-field-label">💬 伺服器暱稱</span>
          <span className="help-field-desc">填入你在 Discord 伺服器裡的暱稱（顯示名稱）。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">📧 Google 帳號（Gmail）</span>
          <span className="help-field-desc">填入你的 Gmail，用於後續取得 Google 雲端資料夾的存取權限。</span>
        </div>
        <p className="help-tip">填完送出後，下次登入會直接進 Dashboard，不需要重複填寫。</p>
      </>
    )
  },
  {
    icon: '3',
    title: '建立本期資料夾',
    content: (
      <>
        <p>進入 Dashboard 後，若本期尚未建檔，上方會出現建檔提示，點擊「立即建檔」。</p>
        <div className="help-field">
          <span className="help-field-label">🎨 參加類型</span>
          <span className="help-field-desc">
            選擇「個人」或「團體」。<br />
            選擇團體時需填入隊伍名稱。
          </span>
        </div>
        <div className="help-field">
          <span className="help-field-label">👥 團體隊員邀請</span>
          <span className="help-field-desc">
            隊長在建檔時填入隊員的 Gmail，對方登入後 Dashboard 會出現邀請卡，同意後即加入隊伍紀錄。
          </span>
        </div>
        <p className="help-tip">建檔成功後系統會自動建立 Google 雲端資料夾，並將存取權限分享給你的 Gmail。</p>
      </>
    )
  },
  {
    icon: '4',
    title: '上傳作品',
    content: (
      <>
        <p>建檔成功後，點擊「📂 開啟我的資料夾」進入你的 Google 雲端資料夾，將作品上傳至該資料夾即可。</p>
        <p className="help-tip">請確認用報名時填入的 Google 帳號登入，才能看到並編輯資料夾。</p>
      </>
    )
  },
  {
    icon: '5',
    title: '回報完成上傳',
    content: (
      <>
        <p>作品上傳完畢後，在 Dashboard 的紀錄卡片上點擊「已上傳作業」按鈕，通知管理員你已完成上傳。</p>
        <div className="help-field">
          <span className="help-field-label">✅ 通知成功</span>
          <span className="help-field-desc">按下後按鈕會變成「通知成功」並顯示回報時間，代表已成功通知。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">↩️ 取消回報</span>
          <span className="help-field-desc">若不小心誤按，可點旁邊的「取消」按鈕撤銷回報狀態。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">🔗 社群打卡連結</span>
          <span className="help-field-desc">可選填社群平台的貼文連結（Twitter/X、Instagram 等），填入後管理員可在後台直接查看。</span>
        </div>
        <p className="help-tip">回報狀態會同步顯示在管理員後台，讓管理員掌握上傳進度。</p>
      </>
    )
  },
  {
    icon: '6',
    title: 'Dashboard 其他功能',
    content: (
      <>
        <div className="help-field">
          <span className="help-field-label">📅 活動資訊</span>
          <span className="help-field-desc">頁面上方會顯示本期活動期間，以及距離截止日的倒數計時（天／小時／分）。截止後會顯示「活動已結束」。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">📋 歷期紀錄</span>
          <span className="help-field-desc">登入後可查看你每一期的建檔紀錄與資料夾連結。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">✏️ 修改資料</span>
          <span className="help-field-desc">紀錄卡片上有「編輯」按鈕，可修改伺服器暱稱及 Google 帳號。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">🏅 獎章冊</span>
          <span className="help-field-desc">每期全勤的參加者可獲得對應徽章，展示在 Dashboard 獎章冊區塊，點擊可放大查看。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">👥 認領歷史隊伍紀錄</span>
          <span className="help-field-desc">
            曾以隊伍名義參加過往期數、但查不到個人紀錄時，可使用 Dashboard 底部的「曾以隊伍參加過往期數？」功能。
            選擇期數 → 搜尋隊伍名稱 → 點「認領」，即可在個人紀錄中新增該期參加紀錄。
          </span>
        </div>
      </>
    )
  },
  {
    icon: '🎨',
    title: '隊伍徵求版',
    content: (
      <>
        <p>找隊友或招募隊員可使用導覽列的「隊伍徵求版」。</p>
        <div className="help-field">
          <span className="help-field-label">👤 個人找隊</span>
          <span className="help-field-desc">個人參加者發文表示正在尋找隊伍，其他人可透過 Discord 隊伍徵求串聯絡。</span>
        </div>
        <div className="help-field">
          <span className="help-field-label">👥 隊伍缺人</span>
          <span className="help-field-desc">已組隊但人數不足的隊伍發文招募，可填寫徵求人數（1–3 人）。</span>
        </div>
        <p className="help-tip">找到隊友後請回到 Discord 隊伍徵求串與對方聯繫，完成組隊後再到系統建檔。</p>
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
    a: '到 Dashboard 找到該期紀錄，點擊「編輯」按鈕即可修改 Google 帳號。'
  },
  {
    q: '資料夾看不到、無法編輯怎麼辦？',
    a: '請確認你是用報名時填寫的 Google 帳號登入 Google 雲端硬碟。如果帳號沒問題，可以請管理員確認資料夾共用是否正確。'
  },
  {
    q: '個人和團體的差別？',
    a: '個人建立一個屬於自己的資料夾。團體以隊伍名稱建立，隊長可邀請隊員（填入對方 Gmail），對方同意後可共同存取同一個資料夾。'
  },
  {
    q: '隊員收到邀請但不想加入怎麼辦？',
    a: '在 Dashboard 的邀請卡上點擊「拒絕」即可。拒絕後該邀請不會再出現。'
  },
  {
    q: '已上傳作業後可以取消嗎？',
    a: '可以。在「通知成功」旁邊有「取消」按鈕，點擊即可撤銷回報狀態，之後可以重新回報。'
  },
  {
    q: '倒數計時消失或顯示「活動已結束」怎麼辦？',
    a: '代表本期截止日已過，若仍需上傳請聯繫管理員確認是否延期。'
  },
  {
    q: '以前是以隊伍參加，但登入後看不到舊期紀錄怎麼辦？',
    a: '使用 Dashboard 底部的「曾以隊伍參加過往期數？」功能，選擇期數和隊伍名稱後點「認領」，即可將該期隊伍紀錄加入你的個人歷史中。每個期數每個帳號只能認領一次。'
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

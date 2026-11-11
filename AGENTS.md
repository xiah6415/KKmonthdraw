# 月月繪建檔系統 — Codex 協作說明

> 與 CLAUDE.md 同步更新，兩份文件內容一致

## 專案概覽

Discord 社群「KK月月繪」的報名建檔系統。  
參加者以 Discord OAuth 登入，建立 Google Drive 作業資料夾，管理員在後台管理全勤、回報狀態。

| | |
|---|---|
| 主站（Firebase） | https://kkmonth.web.app |
| 備用（GitHub Pages） | https://xiah6415.github.io/KKmonthdraw/ |
| GitHub | https://github.com/xiah6415/KKmonthdraw |
| GAS Web App | `https://script.google.com/macros/s/AKfycbw29lZZ1uBpSLi5fsT-8tJs0dm3LebMd0BFGXGSoWzezqpnZvLaNHlnt2h7RXVcqiuy/exec` |

---

## 技術架構

- **前端**：React + Vite，`src/pages/`（Dashboard / Admin / Register / Help / Home）
- **後端**：Google Apps Script（`apps-script/程式碼.js`），唯一 API endpoint
- **資料庫**：Notion Database（ID: `34a63b0885958042ad79d27f8abe63e4`）
- **Drive 資料夾**：Google Drive，每位參加者一個資料夾
- **封面/徽章圖**：Firebase Storage（`covers/cover`、`badges/`）
- **部署**：Firebase Hosting（主站）+ GitHub Actions → GitHub Pages（備用）

---

## 開發指令

```bash
npm run dev       # 本地開發
npm run build     # 建置（Firebase 版本）
npm run build -- --mode github   # 建置（GitHub Pages 版本）
npm run deploy    # vite build + firebase deploy（主站）
git push          # 自動觸發 GitHub Pages 部署
```

> ⚠️ 每次改動都要同時 `npm run deploy`（Firebase）+ `git push`（GitHub Pages）  
> ⚠️ Firebase 目前暫停部署，僅用 GitHub Pages 測試

---

## 重要常數（.env）

```
VITE_DISCORD_CLIENT_ID=1496529238583414886
VITE_REDIRECT_URI=https://kkmonth.web.app/dashboard
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbw29lZZ1uBpSLi5fsT-8tJs0dm3LebMd0BFGXGSoWzezqpnZvLaNHlnt2h7RXVcqiuy/exec
VITE_API_SECRET=月月繪2026secret_KK
```

---

## GAS 重要設定（`apps-script/程式碼.js` 頂部常數）

| 常數 | 值 |
|---|---|
| `ROOT_FOLDER_ID` | `1GZ-ncCHasg1o0HYsFGtLYJ_JkYCGdNaE` |
| `NOTION_DATABASE_ID` | `34a63b0885958042ad79d27f8abe63e4` |
| `GAS Script ID` | `1pZjrvDDtpmIUGN8PfLCBHD4WYmZw1zamos_p46n88ZgvR7JuQtTnJotv` |

GAS 部署指令（Mac，需 xiah6415tw@gmail.com 帳號）：
```bash
cd /tmp/kkmonth-new && ~/.local/bin/clasp push --force
cd /tmp/kkmonth-new && ~/.local/bin/clasp deploy -i AKfycbw29lZZ1uBpSLi5fsT-8tJs0dm3LebMd0BFGXGSoWzezqpnZvLaNHlnt2h7RXVcqiuy
```

---

## 安全架構

- **Session Token**：登入時 GAS 簽發 HMAC token（48h TTL），前後端均驗 token
- **自助端點**：`requireSelf(e)` — 從 token 反解 discordId，不信任前端參數
- **管理端點**：`requireAdmin(e)` — 驗 token + isAdminUser
- **不可**在前端洩漏 SESSION_SECRET；API_SECRET 已知可被 bundle 取出（已接受風險）

---

## 注意事項

- `gas.txt` 在專案根目錄（`.gitignore` 排除，含 secrets）
- GAS 不能有 `initProperties` 或會覆蓋 `adminIds` 的函式
- `clasp deploy` 務必加 `-i <deploymentId>`，不帶會建新 URL 導致前端斷線
- 月配額保護：WRITE_ACTIONS 上限 3000 次，90% 時禁寫，100% 時全停
- vite.config.js：`base: mode === 'github' ? '/KKmonthdraw/' : '/'`，所有靜態資源路徑要用 `import.meta.env.BASE_URL`

---

## 當前進行中工作

- **電子集章冊 PNG 下載**（`src/pages/Dashboard.jsx`）：  
  Canvas 合成 `public/stampbook-template.png`（3200×2200），疊上各期全勤獎章與暱稱，供用戶下載。  
  目前在 GitHub Pages 測試中，Firebase 版本暫不部署此功能。  
  已知問題：Firebase Storage badge 圖片的 CORS 或 fetch 問題待確認。

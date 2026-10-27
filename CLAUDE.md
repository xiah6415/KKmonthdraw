# 月月繪建檔系統 — 協作說明（給 Claude / Codex）

> 最後更新：2026-10-27 v47

---

## 專案概覽

Discord 社群「KK月月繪」的報名建檔系統。  
參加者以 Discord OAuth 登入，建立 Google Drive 作業資料夾，管理員在後台管理全勤、回報狀態。

| | |
|---|---|
| 主站（Firebase） | https://kkmonth.web.app |
| 備用（GitHub Pages） | https://xiah6415.github.io/KKmonthdraw/ |
| GitHub | https://github.com/xiah6415/KKmonthdraw |
| GAS Web App | `https://script.google.com/macros/s/AKfycbyPxgT2-jmdSCeiFXi2CvlGqq9X0w_jdNZ7hFbWCYlfyzjGUS0IgfQUW5dnH7ws_L9g/exec` |

---

## 技術架構

- **前端**：React + Vite，`src/pages/`（Dashboard / Admin / Register / Help / Home）
- **後端**：Google Apps Script（`apps-script/程式碼.js`），唯一 API endpoint
- **資料庫**：Notion Database（ID: `34a63b0885958042ad79d27f8abe63e4`）
- **Drive 資料夾**：Google Drive（共用雲端硬碟），每位參加者一個資料夾
- **封面/徽章圖**：Firebase Storage（`covers/cover`、`badges/`）
- **部署**：Firebase Hosting（主站）+ GitHub Actions → GitHub Pages（備用）

---

## 部署指令

```bash
# Firebase 主站
npm run deploy          # = vite build && firebase deploy

# GAS（需先在 apps-script/ 目錄）
~/.local/bin/clasp push --force
~/.local/bin/clasp deploy -i AKfycbyPxgT2-jmdSCeiFXi2CvlGqq9X0w_jdNZ7hFbWCYlfyzjGUS0IgfQUW5dnH7ws_L9g

# GitHub push 自動觸發 GitHub Pages 部署
git push
```

⚠️ **每次改動都要同時部署 Firebase + push GitHub（自動觸發 Pages）**  
⚠️ `clasp deploy` 務必加 `-i <deploymentId>`，不帶會建新 URL 導致前端斷線

---

## GAS 重要設定（`apps-script/程式碼.js` 頂部常數）

| 常數 | 值 | 說明 |
|---|---|---|
| `ROOT_FOLDER_ID` | `1iLxpzXNO0UGIkwvJ9mjF53buFjkmDqXA` | 主根目錄（登入紀錄/隊伍 Sheet 存放處） |
| `API_SECRET` | `月月繪2026secret_KK` | 前端 API 呼叫用（已知可被 bundle 取出，屬接受風險） |
| `SESSION_SECRET` | （見程式碼） | 後端 HMAC 簽章，絕不可出現在前端 |
| `NOTION_DATABASE_ID` | `34a63b0885958042ad79d27f8abe63e4` | |
| `GAS Script ID` | `114lCsxm0NppFUI3N_95uW4zdDyjGHA69S2BBZMJK5D4HUV0ymjuFtXif` | |

---

## 雲端硬碟結構（2026-10-27 遷移後）

```
1iLxpzXNO0UGIkwvJ9mjF53buFjkmDqXA  ← 主根目錄（ROOT_FOLDER_ID）
├── 第四期/（ID: 1v80BEaxPv3XZtdT9m-9nkJZishHlj4sq）← 167個參加者資料夾
├── 第五期/（ID: 12HXYlYpw5GCEgewBZfEJGsDboV13Rzg8）← 104個參加者資料夾
├── 月月繪_登入紀錄（Sheet）
└── 月月繪隊伍徵求版（Sheet）

1gU29fdme-NAOb57ID6yv_Hg-nsKU5via  ← 第一期原始資料夾
1CKtRyVxDqiP7ebaw0obPW2yX9A5LObZy  ← 第二期原始資料夾（舊 ROOT_FOLDER_ID）
1pJkwxNNGGbDCE3Vg6mPtqXLN6P9ZaQws  ← 第三期原始資料夾
```

---

## 期數設定（periodsConfig，存於 GAS PropertiesService）

| 期數 | rootFolderId | open |
|---|---|---|
| 第一期 | `1gU29fdme-NAOb57ID6yv_Hg-nsKU5via` | true（補交期開放） |
| 第二期 | `1CKtRyVxDqiP7ebaw0obPW2yX9A5LObZy` | true |
| 第三期 | `1pJkwxNNGGbDCE3Vg6mPtqXLN6P9ZaQws` | true |
| 第四期 | `1v80BEaxPv3XZtdT9m-9nkJZishHlj4sq` | true |
| 第五期 | `12HXYlYpw5GCEgewBZfEJGsDboV13Rzg8` | true |
| 補交期 | （空） | false |

---

## GAS 帳號

- GAS 掛在公司帳號 `suian0701@krenzartwork.com`（KrenzArtwork Workspace）
- Firebase / GitHub 用個人帳號 `xiah6415tw@gmail.com`
- 兩者完全獨立，`firebase login` 對 GAS 沒有存取權

### clasp 設定（Mac）
```bash
cd /Users/suyan/資料儲存/04-開發專案/KKmonthdraw
~/.local/bin/clasp push --force
~/.local/bin/clasp deploy -i AKfycbyPxgT2-...L9g
```
- `clasp logs` 無法使用（GCP Project ID 未綁定）
- `clasp run` 未啟用

---

## 安全架構

- **Session Token**：登入時 GAS 簽發 HMAC token（48h TTL），自助/管理端點一律驗 token
- **API_SECRET**：已知可被前端 bundle 取出，僅用於一次性 one-shot 維護 action（如 resetMonthlyQuota）
- **自助端點**：`requireSelf(e)` — 從 token 反解 discordId，不信任前端傳入的 discordId
- **管理端點**：`requireAdmin(e)` — 驗 token + isAdminUser

---

## 月配額保護（GAS）

- 只計 `WRITE_ACTIONS`，讀取不計入
- Soft limit 90%（2700次）：禁止寫入；Hard limit 100%（3000次）：全停
- 解除：`?action=resetMonthlyQuota&secret=...`

---

## 當前版本

- **GAS**：v47 @110（2026-10-27）
- **前端**：commit `efcfdef`

---

## 注意事項

- `gas.txt` 放在專案根目錄（`.gitignore` 排除，含 secrets）
- GAS 更新流程：改 `apps-script/程式碼.js` → `clasp push --force` → `clasp deploy -i <ID>`
- 不能有 `initProperties` 或會覆蓋 `adminIds` 的函式
- 跨共用雲端硬碟搬移資料夾需用 `Drive.Files.update({}, id, null, { addParents, removeParents, supportsAllDrives: true })`，DriveApp 的 `addFolder`/`removeFolder` 不支援跨硬碟

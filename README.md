# Student Outreach

本地 Web App，自動由 Notion CRM 拉學員，用你嘅 WhatsApp Web 逐個發送個人化訊息。雙擊啟動、browser 自動彈 UI，揀 template + 撳 Start。

![demo](https://img.shields.io/badge/Node-22%2B-green) ![license](https://img.shields.io/badge/license-MIT-blue)

## 功能

- 🔄 從 Notion CRM 自動 fetch 學員
- 🎨 5 個訊息 template「紙樣」（課程 check-in / 溫馨關心 / 分享 AI / 生日 / 節日）
- 👥 Checkbox 自由揀學員
- 🌏 支援國際號碼（🇭🇰 🇸🇬 🇲🇾 🇦🇺 等）
- ⏱ Random delay 10-20 秒 between sends（避免 pattern detection）
- 📅 發送完自動 update Notion「上次關心日期」
- 🧠 SQLite 記錄歷史，避免 30 日內重覆 DM 同一人
- 📊 Real-time progress + log

## Requirements

- **Node.js 22+**（[下載](https://nodejs.org)）
- **WhatsApp 帳號**（可以 scan QR 登入 WhatsApp Web）
- **Notion account**（要有 API integration，免費版都可以）

## Setup（第一次，5 分鐘）

### 1. Clone + 裝 dependencies

```bash
git clone https://github.com/edwardaitechhk-lang/student-outreach.git
cd student-outreach
npm install
```

### 2. Notion 設定

1. 去 https://notion.so/my-integrations → **+ New integration**
2. Name 填 `Student Outreach`，submit
3. Copy 個 `Internal Integration Secret`（`ntn_...` 開頭）
4. 去你個 CRM database 嘅 Notion page → `⋯` → `Connections` → 揀啱頭先個 integration

### 3. .env 設定

```bash
cp .env.example .env
```

開 `.env` 填入：
```
NOTION_TOKEN=ntn_你個 token
NOTION_DB_ID=你個 CRM database ID（URL 尾段）
PRODUCT_FILTER=12 Agent 課程  # 或者 leave empty for all
```

### 4. Notion CRM Schema

你個 CRM database 要有呢幾個 property（名要一模一樣）：

| Property | Type | Required |
|----------|------|----------|
| `姓名` | Title | ✅ |
| `WhatsApp` | Phone | ✅ |
| `產品` | Multi-select | 如果有 PRODUCT_FILTER |
| `Status` | Status | optional |
| `學員 Tier` | Select | optional |
| `VIP / KOL` | Checkbox | optional（VIP 自動 skip）|
| `上次關心日期` | Date | auto-populated |

## 啟動

**雙擊** `start.command`

或者 terminal：
```bash
npm start
```

Browser 自動開 `http://localhost:3456`。

第一次要 scan QR 登入 WhatsApp Web（同 web.whatsapp.com 一樣），之後 session 記住。

## 點用

1. 撳「🔄 Fetch Notion」→ 學員列出
2. 揀 template（或者改 message template）
3. Checkbox 揀邊個要 send
4. 如果只係想 test，開「Test mode」+ 填你自己個號碼
5. 撳「▶ Start Campaign」

每條訊息中間隨機 delay，WhatsApp 安全模式。

## Disclaimer

呢個工具用 `whatsapp-web.js` library（unofficial），技術上係模擬 user interaction。Meta ToS 灰色地帶，**係你自己責任確保合理使用**：
- 只 send 俾已經同你有關係嘅人（學生、客戶、朋友）
- 唔好用嚟做 promo / spam
- Rate limit 唔好搞得太激進

呢個 repo 無關 WhatsApp / Meta 官方。

## License

MIT

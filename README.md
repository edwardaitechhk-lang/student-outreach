# 💛 WhatsApp 客戶保暖工具

由 Notion CRM 自動拉客戶，用你嘅 WhatsApp 逐個發送個人化關心訊息。雙擊啟動、browser 自動彈 UI，揀 template + 撳 Start。

**美容院嘅關心電話 = 你嘅 WhatsApp 自動關心訊息。**

![Node](https://img.shields.io/badge/Node-22%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## 為乜要有呢個工具

人手逐個 DM 30 個舊學生 / 60 個客戶「你近排點？」 → 費時 1-2 個鐘 + 容易漏。
呢個工具：
- 從 Notion CRM 自動 fetch 客戶
- 5 個 preset template，揀一個 + 撳 Start
- 自動 random delay + 個人化（`Hi {{name}}`）
- 自動記錄「上次關心日期」返 Notion，30 日內嘅自動 skip

**15 分鐘搞掂 30 個關心訊息，唔會打擾客戶又唔會漏。**

## 功能

- 🔄 從 Notion CRM fetch 客戶（任何 schema，只要有姓名 + WhatsApp）
- 🎨 5 個 template「紙樣」（課程 check-in / 溫馨關心 / 分享 AI / 生日 / 節日）
- 🌏 支援國際號碼（🇭🇰 🇸🇬 🇲🇾 🇦🇺 🇬🇧 🇺🇸 🇯🇵 🇰🇷 🇨🇳 🇹🇼）
- 👥 Checkbox 自由揀邊個要 send
- ⏱ Random delay 10-20 秒 between sends（安全，唔 trigger rate limit）
- 📅 發送完自動 update Notion 「上次關心日期」
- 🧠 SQLite 記錄歷史，avoid 30 日內重覆 DM
- 📊 Real-time progress + log
- 🎭 Test mode + Demo CRM（假名假號，拍教學片用）

## Requirements

- **Node.js 22+**（[下載](https://nodejs.org)）
- **WhatsApp 帳號**（可以 scan QR 登入 WhatsApp Web）
- **Notion account**（免費版都可以）

## Setup（第一次，5 分鐘）

### 1. Clone + 裝 dependencies

```bash
git clone https://github.com/edwardaitechhk-lang/student-outreach.git
cd student-outreach
npm install
```

### 2. 整 Notion Integration

1. 去 https://notion.so/my-integrations → **+ New integration**
2. Name 填任何嘢（`WhatsApp Warmup Tool`），submit
3. Copy 個 `Internal Integration Secret`（`ntn_...` 開頭）
4. 去你個 CRM database 嘅 Notion page → `⋯` → `Connections` → 揀啱頭先個 integration

### 3. .env 設定

```bash
cp .env.example .env
```

開 `.env` 填入 Notion token 同 DB ID。

### 4. Notion CRM Schema 要求

你個 database 要有呢幾個 property（名要一模一樣）：

| Property | Type | Required |
|----------|------|----------|
| `姓名` | Title | ✅ |
| `WhatsApp` | Phone | ✅ |
| `產品` | Multi-select | 只 send 特定產品用 |
| `Status` | Status | optional |
| `VIP / KOL` | Checkbox | VIP 自動 skip |
| `上次關心日期` | Date | **發送完會自動寫入**，不用手填 |

## 啟動

**雙擊** `start.command`

或者 terminal：
```bash
npm start
```

Browser 自動彈 `http://localhost:3456`。

第一次要 scan QR 登入 WhatsApp Web（同 `web.whatsapp.com` 一樣），之後 session 記住唔洗再 scan。

## 每次用流程

1. 撳「🔄 Fetch Notion」→ 客戶列出
2. 揀 template（或者改 message template）
3. Checkbox 揀邊個要 send
4. 想 test 先 → 開「Test mode」+ 填你自己個號碼
5. 撳「▶ Start Campaign」

每條訊息中間隨機 10-20 秒 delay，WhatsApp 安全模式。

## 教學：點用 Claude Code 由零重建呢個工具

👉 睇 [`POM.md`](./POM.md)

將成份 POM.md 內容 copy paste 俾 Claude Code，佢會 step-by-step 照住 spec 重建成個 app。呢個係 **12 AI Agent 課程** 嘅示範例子。

## Disclaimer

呢個工具用 `whatsapp-web.js` library（unofficial），技術上係模擬 user interaction。Meta ToS 灰色地帶，**係你自己責任確保合理使用**：
- 只 send 俾已經同你有關係嘅人（學生、客戶、朋友）
- 唔好用嚟做 promo / spam
- Rate limit 唔好搞得太激進

呢個 repo 無關 WhatsApp / Meta 官方。

## License

MIT © 2026 EdwardAI

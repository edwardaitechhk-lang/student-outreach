# 📄 POM — WhatsApp 客戶保暖工具（Build Prompt for Claude Code）

> **點用**：將呢份文件由「# 開始」到「# 結束」整份 copy paste 去你嘅 Claude Code，Claude 會 step-by-step 幫你建成個 app。需要 Node.js 22+ 已裝。

---

# 開始

你好 Claude，我想你幫我由零起建一個本地 Web App，功能係：

**💛 WhatsApp 客戶保暖工具** — 由 Notion CRM 自動拉客戶名單，用我自己嘅 WhatsApp 逐個發送個人化關心訊息（例如：「Hi Alex，呢排點呀？」）。

## 1. 為乜要建

我有 30-100 個舊客戶 / 學生 / lead 喺 Notion CRM 入面。我想**偶然（每 1-2 個月）**發一次溫馨訊息問候佢哋，但：
- 人手逐個 copy/paste 太慢（要 1-2 個鐘）
- 容易漏咗邊個、重覆 send 俾同一個
- 想個人化（自動 fill 名），但又唔想失自然感

所以我要個工具：
- 開咗 browser 就見到 UI
- 撳一下掣就 fetch 晒 Notion CRM 入面嘅客戶
- 揀一個 template → 撳 Start → 自動逐個 send，每個中間隨機 10-20 秒 delay
- 發送完自動喺 Notion 記「上次關心日期」，下次就唔會重覆 send 最近聯絡過嘅

## 2. Tech Stack

| 層 | 技術 |
|----|------|
| Frontend | Vanilla HTML + CSS + JS（唔用 framework，簡單就得） |
| Backend | **Node.js 22+** + **Express 5** + **Server-Sent Events**（real-time progress） |
| WhatsApp | **`whatsapp-web.js`** library（經 Puppeteer headless 連 web.whatsapp.com） |
| Notion | **`@notionhq/client`** official SDK |
| 本地 DB | **`better-sqlite3`**（記 send history） |
| QR Code | **`qrcode`**（render WhatsApp QR code 做圖） |
| Env | **`dotenv`** |

## 3. Folder Structure

```
project-root/
├── package.json
├── .env.example            # token placeholders
├── .gitignore              # ignore node_modules, .env, .wwebjs_auth, *.sqlite
├── README.md
├── start.command           # macOS 雙擊啟動 script（可選）
├── server.js               # Express server 入口
├── lib.js                  # Notion fetch + phone normalize + helpers
├── db.js                   # SQLite schema + helpers
├── templates.js            # message template 庫
├── public/
│   ├── index.html          # Dashboard UI
│   └── app.js              # Frontend JS（SSE + DOM manipulation）
└── scripts/
    └── create-demo-crm.js  # （可選）create Notion demo DB
```

## 4. 環境變數（`.env`）

```
NOTION_TOKEN=ntn_xxxxx           # Notion integration token
NOTION_DB_ID=xxxxxxxxxxxxxxxx    # CRM database ID
PRODUCT_FILTER=12 Agent 課程     # optional, filter by 產品 multi-select
```

## 5. Notion CRM Schema 需求

Database 要有呢啲 property（名要一模一樣，中文）：

| Property 名 | Type |
|------------|------|
| `姓名` | Title |
| `WhatsApp` | Phone number |
| `產品` | Multi-select |
| `Status` | Status |
| `學員 Tier` | Select |
| `VIP / KOL` | Checkbox |
| `上次關心日期` | Date |

## 6. 各 File 嘅功能詳細 Spec

### 6.1 `package.json`

- `"type": "module"`（用 ES modules）
- Scripts：`"start": "node server.js"`, `"app": "node server.js"`
- Dependencies：
  - `@notionhq/client` ^2.2.15
  - `better-sqlite3` ^12.x
  - `dotenv` ^16.x
  - `express` ^5.x
  - `qrcode` ^1.5.x
  - `whatsapp-web.js` ^1.26.0

### 6.2 `lib.js`

Export：`notion`, `DB_ID`, `PRODUCT_FILTER`, `fetchStudents()`, `normalizePhone()`, `detectCountry()`, `updateLastContact()`, `renderMessage()`, `randomDelay()`.

**`normalizePhone(raw)`**：
- 輸入可能係 `+852 9152 1675`、`＋852 98668811`（全形＋）、`9152 1675`（8 位本地）、`+60 17-403 5850`（馬拉）、`+65 9188 9567`（SG）
- 做法：
  1. 全形 `＋` 換成半形 `+`
  2. 刪曬空格、dash、括號
  3. 只留 digit
  4. 若長度 = 8 且頭位 2-9 → 加 `852` prefix
  5. 否則原樣返回

**`detectCountry(phone)`**：
- 根據 phone 開頭 match country code
- Return `{ code: '852', flag: '🇭🇰' }` 等
- 支援：852 (HK), 65 (SG), 60 (MY), 61 (AU), 86 (CN), 886 (TW), 44 (UK), 1 (US), 81 (JP), 82 (KR)
- 冇 match → `flag: '🌍'`

**`fetchStudents({ limit = 100 })`**：
- Query Notion database（由 `.env` 嘅 `NOTION_DB_ID`）
- Filter by `產品 contains PRODUCT_FILTER`（如果 env 有設）
- Map 每個 page 做 student object：
  ```js
  {
    id, name, firstName, phone, phoneRaw,
    country, countryFlag, status, tier, vip,
    lastContactNotion, createdTime
  }
  ```
- `firstName` = 去曬括號內容後取第一個 whitespace-split 字
- Filter out：冇 valid phone（要匹配 `/^\d{8,15}$/`）嘅、VIP/KOL 標記嘅
- 限制 `limit` 個

**`updateLastContact(pageId, dateIso?)`**：
- Call `notion.pages.update` 將 `上次關心日期` property 設成今日（或者 caller 指定）
- 失敗唔 throw，log error（唔好影響 send loop）

**`renderMessage(student)`**：
- 預設返 `` `Hi ${student.firstName}，有冇開始睇課程呀？VS Code 上面有冇咩需要幫手或者發問嘅地方？` ``
- 但 template 應該由 `templates.js` 管，呢個只係 fallback

**`randomDelay(minSec, maxSec)`**：
- Return `Math.floor((Math.random() * (max - min) + min) * 1000)` 毫秒

### 6.3 `db.js`

- 用 `better-sqlite3`，DB file `send-history.sqlite`
- Schema：
  ```sql
  CREATE TABLE IF NOT EXISTS send_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    student_name TEXT,
    phone TEXT,
    message TEXT,
    template_id TEXT,
    ack INTEGER,
    result TEXT,        -- 'sent' / 'error'
    sent_at INTEGER NOT NULL  -- Date.now()
  );
  CREATE INDEX IF NOT EXISTS idx_student_sent ON send_history(student_id, sent_at);
  ```
- Export：`recordSend(obj)`, `getAllLastSent()`（return `{ student_id: timestamp }` map）

### 6.4 `templates.js`

Export `TEMPLATES` array，每個 object：`{ id, name, description, text }`。至少 5 個：
- `checkin` — 📚 課程 check-in
- `warmcare` — 💛 溫馨關心
- `newupdate` — 🚀 分享 AI 新嘢
- `birthday` — 🎂 生日祝福
- `festival` — 🎉 節日問候

Template 個 `text` 用 `{{name}}` placeholder。

### 6.5 `server.js`

Express server 於 port `3456`，主要做：

**Static files**：`app.use(express.static('public'))`

**Routes**：
- `GET /api/events` — Server-Sent Events 串流 real-time 進度
- `GET /api/templates` — return `TEMPLATES`
- `GET /api/students` — call `fetchStudents()`，加埋 SQLite 嘅 `lastSentAt` / `lastSentDays` 入每個 student object
- `POST /api/start` — body: `{ studentIds, template, templateId, targetNumber, delayMin, delayMax }`，觸發 campaign
- `POST /api/stop` — set `state.campaign.stopRequested = true`

**WhatsApp Client Initialize**：
```js
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
    protocolTimeout: 180000,
  },
});
```

Event handlers：
- `qr` → 用 `QRCode.toDataURL(qr)` render PNG → SSE push 去 frontend
- `authenticated` → SSE push status
- `ready` → SSE push status + `client.info.wid.user`（登入帳號）
- `auth_failure` / `disconnected` → SSE push

**Campaign runner `runCampaign()`**：
```
for each student in students:
  if stopRequested, break
  message = template.replaceAll('{{name}}', student.firstName)
  chatId = targetNumber || student.phone + '@c.us'
  SSE push 'sending'
  try:
    msg = await client.sendMessage(chatId, message)
    ack = await waitForAck(msg, 1, 10000)  # 最多 10 秒
    SSE push 'sent'
    db.recordSend({...})
    if not isSelfSend and not targetNumber:
      updateLastContact(student.id).catch(log)
  except:
    SSE push 'error'
    db.recordSend({result: 'error'})
  await randomDelay(delayMin, delayMax)
SSE push 'campaign_done'
```

**ACK handling 重要**：
- `msg.ack` 係實時更新嘅 property（0 pending, 1 server, 2 device, 3 read）
- `waitForAck(msg, minAck, timeoutMs)` 每 500ms check `msg.ack >= minAck`，超時返回實際 ack 值
- **唔好**因為 ACK 未到就當失敗 — 只要 `sendMessage` 冇 throw 就 count as success（ACK 係 bonus info）
- Message Yourself chat（`targetNumber === selfPhone`）ACK 可能一直係 0，要 special case

**Open browser after listen**：
```js
app.listen(PORT, () => {
  console.log(`💛 running → http://localhost:${PORT}`);
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});
```

### 6.6 `public/index.html`

Dashboard 結構：
1. Header（title + subtitle）
2. WhatsApp 狀態 card（pill：啟動中 / QR / 認證中 / 已連接 / 錯誤）
3. QR code display（status=qr 時顯示）
4. Main panel（status=ready 先顯示）：
   - **🎨 揀紙樣** card：template grid + textarea
   - **⚙️ 發送設定** card：Test mode toggle + target number input + delay min/max
   - **👥 學生名單** card：Fetch 掣 + 「跳過 N 日內已 send」toggle + student list（checkbox + 姓名 + phone + tier + 「X 日前 send 過」badge）
   - **🚀 執行** card：Start/Stop + progress bar + log textarea

用 iOS/macOS 風格 CSS（白底、圓角 card、綠色 WhatsApp 色 `#25d366` 做 primary button）。

### 6.7 `public/app.js`

- 用 `EventSource('/api/events')` listen SSE
- `loadTemplates()` / `fetchStudents()` / `startCampaign()` / `stopCampaign()` 等 function
- 揀 template 時自動 fill textarea
- Start 時 confirm dialog（非 test mode 要 Edward confirm）
- Progress event → update individual student badge（pending / sending / sent / error）
- 完成後 auto re-fetch（新 "今日已 send" badge 即時反映）

### 6.8 `start.command`（macOS 雙擊）

```bash
#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then npm install; fi
node server.js
```

`chmod +x start.command` 後可以雙擊。

## 7. 執行順序（從冇到有）

1. `mkdir whatsapp-warmup-tool && cd whatsapp-warmup-tool`
2. `npm init -y`，update `package.json` 加 `"type": "module"` 同 scripts
3. `npm install express @notionhq/client better-sqlite3 dotenv qrcode whatsapp-web.js`
4. 建 `.env.example`、`.gitignore`
5. 寫 `lib.js`（最基礎，其他 depend on 佢）
6. 寫 `db.js`
7. 寫 `templates.js`
8. 寫 `public/index.html` + `public/app.js`
9. 寫 `server.js`（最後，因為要 call 上面所有 module）
10. 建 `start.command`，chmod +x
11. 填 `.env`，`npm start` 測試
12. First run 會彈 QR code → 用手機 WhatsApp scan → 登入後就 ready

## 8. 容易踩嘅坑

- **Puppeteer cold-start timeout**：第一次 launch 可能 30-60 秒，要加 `protocolTimeout: 180000`
- **Chromium singleton lock**：如果之前 process crash，`.wwebjs_auth/session/Singleton*` 可能 lock 住，restart 前刪曬
- **ACK false-fail**：Message Yourself ACK 可能一直 0 — 唔好因此 mark 失敗
- **Notion API rate limit**：3 req/s，`updateLastContact` 用 `.catch()` 唔好 await 阻住 send loop
- **SSE connection**：Express 5 要 `res.flushHeaders()` 立即 flush header，否則 client 等住
- **電話 normalize**：記得 handle 中文全形 `＋`（U+FF0B）—好多 CRM data 會有

## 9. 最終成品應該點樣

- 開 terminal run `npm start`（或者雙擊 `start.command`）
- Browser 自動開 `http://localhost:3456`
- 見到 WhatsApp 狀態 card
- 第一次：scan QR → 10 秒後變「已連接」
- 撳「🔄 Fetch Notion」→ 10-25 個 student 列出
- 揀 template「📚 課程 check-in」
- 撳「▶ Start Campaign」→ 彈 confirm → 確認
- Chromium headless 喺後台自動 send，每條 message 間 random delay
- Dashboard 見到 real-time：Kk ✓ → 勤易 ✓ → Ada ✓
- 完成後 Notion 個 row 自動 populate「上次關心日期」= 今日
- 再 Fetch，啱啱 send 嗰啲變灰 + uncheck（30 日內 skip）

---

# 結束

好，Claude，開始幫我建。如果有任何嘢需要我 clarify，問我。建完逐個 file run 一次確保冇 syntax error。

完成後 send 我一句「✅ 完成，試下撳 start.command」。

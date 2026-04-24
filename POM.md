# 📄 POM — 💛 WhatsApp 客戶保暖工具（Build Prompt for Claude Code）

> **點用**：將呢份文件由「# 開始」到「# 結束」整份 copy paste 去你嘅 Claude Code，佢會 step-by-step 幫你建成個 app。需要 Node.js 22+ 已裝。

---

# 開始

你好 Claude，我想你幫我由零起建一個本地 Web App，功能係：

**💛 WhatsApp 客戶保暖工具** — 由 Notion CRM 自動拉客戶名單，用我自己嘅 WhatsApp 逐個發送個人化關心訊息。

**關鍵特色**：學生 clone 呢個 repo 第一次開佢，會見到一個 **Setup Wizard** 叫佢填自己嘅 Notion token + DB URL。唔洗手動改 `.env`。

## 1. 為乜要建

我有 30-100 個舊客戶 / 學生 / lead 喺 Notion CRM 入面。我想**偶然（每 1-2 個月）**問候佢哋一次，但人手逐個太慢、容易漏、難個人化。

呢個 app 解決：Notion 拉 → 揀 template → 自動逐個 send，有 random delay 安全模式，送完自動 update Notion「上次關心日期」，下次 auto-skip recent contacted。

## 2. Tech Stack

| 層 | 技術 |
|----|------|
| Frontend | Vanilla HTML + CSS + JS（一個 `index.html` + `app.js` + inline CSS）|
| Backend | **Node.js 22+** + **Express 5** + **Server-Sent Events** |
| WhatsApp | **`whatsapp-web.js` ^1.34**（Puppeteer headless 連 web.whatsapp.com） |
| Notion | **`@notionhq/client`** |
| 本地 DB | **`better-sqlite3`**（send history） |
| QR | **`qrcode`** npm |
| Env | **`dotenv`** |

## 3. Folder Structure

```
project-root/
├── package.json
├── .env                    # runtime config（gitignored），由 setup wizard 自動建
├── .env.example            # 指引 placeholder
├── .gitignore              # ignore node_modules, .env, .wwebjs_auth, *.sqlite
├── README.md
├── start.command           # macOS 雙擊啟動
├── server.js               # Express + WA + Notion orchestration
├── lib.js                  # config / notion fetch / phone normalize
├── db.js                   # SQLite
├── templates.js            # 5 個預設 message template
├── public/
│   ├── index.html          # UI（設 wizard card + WA status + main dashboard）
│   └── app.js              # Frontend JS（SSE, DOM, setup flow）
└── scripts/
    └── create-demo-crm.js  # 可選：一鍵起 Notion demo DB
```

## 4. 環境變數

由 setup wizard 自動寫入 `.env`（學生唔需要手動改）：
```
NOTION_TOKEN=ntn_xxxxx
NOTION_DB_ID=32-char-hex
PRODUCT_FILTER=              # optional
```

## 5. Notion CRM Schema 要求

你個 CRM database 要有呢啲 property（中文名，一模一樣）：

| Property | Type | Required |
|---------|------|----------|
| `姓名` | Title | ✅ |
| `WhatsApp` | Phone number | ✅ |
| `產品` | Multi-select | only if PRODUCT_FILTER set |
| `Status` | Status | optional |
| `學員 Tier` | Select | optional |
| `VIP / KOL` | Checkbox | VIP auto-skip |
| `上次關心日期` | Date | **auto-written**，campaign 完自動填 |

## 6. 各 File 詳細 Spec

### 6.1 `package.json`

- `"type": "module"`（ES modules）
- Script：`"start": "node server.js"`
- Dependencies：
  ```
  @notionhq/client ^2.2
  better-sqlite3 ^12
  dotenv ^16
  express ^5
  qrcode ^1.5
  qrcode-terminal ^0.12
  whatsapp-web.js ^1.34
  ```

### 6.2 `lib.js` — 核心 config + Notion helpers

Export：`loadConfig`, `isConfigured`, `saveConfig`, `extractDbId`, `testConnection`, `fetchStudents`, `updateLastContact`, `normalizePhone`, `detectCountry`, `renderMessage`, `randomDelay`, `ENV_PATH`.

**關鍵 logic**：

```js
const ENV_PATH = path.join(__dirname, '.env');
let notion, DB_ID, PRODUCT_FILTER;

export function loadConfig() {
  dotenv.config({ path: ENV_PATH, override: true });
  notion = process.env.NOTION_TOKEN ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
  DB_ID = process.env.NOTION_DB_ID || null;
  PRODUCT_FILTER = process.env.PRODUCT_FILTER || '';
}
loadConfig();

export function isConfigured() {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_DB_ID);
}

export function extractDbId(input) {
  // accept full Notion URL OR 32-char hex OR UUID-hyphen
  const hex = String(input).match(/[0-9a-f]{32}/i);
  if (hex) return hex[0];
  return String(input).replace(/-/g, '');
}

export function saveConfig({ token, dbId, productFilter }) {
  const cleanDbId = extractDbId(dbId);
  fs.writeFileSync(ENV_PATH, [
    `NOTION_TOKEN=${token}`,
    `NOTION_DB_ID=${cleanDbId}`,
    `PRODUCT_FILTER=${productFilter || ''}`,
    '',
  ].join('\n'));
  loadConfig();  // 即時 reload，唔洗重啟 server
  return { cleanDbId };
}

export async function testConnection({ token, dbId }) {
  const testClient = new Client({ auth: token });
  const cleanDbId = extractDbId(dbId);
  try {
    const db = await testClient.databases.retrieve({ database_id: cleanDbId });
    return { ok: true, dbTitle: db.title?.[0]?.plain_text || '(untitled)', dbId: cleanDbId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
```

**`normalizePhone`**：handle 全形 `＋`、空格、dash、括號；8-digit + 頭位 2-9 = 加 `852` prefix；其他原樣。

**`detectCountry`**：match prefix 出國旗（🇭🇰 🇸🇬 🇲🇾 🇦🇺 🇬🇧 🇺🇸 🇯🇵 🇰🇷 🇨🇳 🇹🇼；否則 🌍）。

**`fetchStudents({ limit })`**：
- 未 configure 就 throw
- Query Notion，filter by `產品 contains PRODUCT_FILTER`（如有）
- Return student object 包：id / name / firstName / phone / phoneRaw / country / countryFlag / status / tier / vip / lastContactNotion / createdTime
- Filter out 冇 valid phone (`/^\d{8,15}$/`) 同 VIP

**`updateLastContact(pageId)`**：call `notion.pages.update` 將 `上次關心日期` 設今日。

### 6.3 `db.js` — SQLite

```sql
CREATE TABLE send_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT, student_name TEXT, phone TEXT, message TEXT,
  template_id TEXT, ack INTEGER, result TEXT, sent_at INTEGER
);
CREATE INDEX idx_student_sent ON send_history(student_id, sent_at);
```

Export `recordSend({...})`, `getAllLastSent()` → `{ student_id: timestamp }`.

### 6.4 `templates.js`

5 個 preset：`checkin` / `warmcare` / `newupdate` / `birthday` / `festival`，每個 `{ id, name, description, text }`，`text` 用 `{{name}}` placeholder。

### 6.5 `server.js` — Express + SSE

Port `3456`，serve `public/`。

**Routes**：

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/events` | GET | SSE stream（發 hello / wa_status / progress / wait / campaign_done） |
| `/api/templates` | GET | Return TEMPLATES |
| `/api/config/status` | GET | `{ notionConfigured: bool, productFilter }` |
| `/api/config/test` | POST | body `{ token, dbId }` → validate with Notion API |
| `/api/config/save` | POST | body `{ token, dbId, productFilter }` → test + saveConfig + sseSend('config_saved') |
| `/api/students` | GET | fetchStudents + merge SQLite lastSent info |
| `/api/start` | POST | body `{ studentIds, template, templateId, targetNumber, delayMin, delayMax }` |
| `/api/stop` | POST | set stopRequested flag |

**WhatsApp Client**：
```js
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
    protocolTimeout: 180000,  // whatsapp-web.js cold-start 可能慢
  },
});
```

Event handlers：`qr` → `QRCode.toDataURL` → SSE push；`authenticated` / `ready` / `auth_failure` / `disconnected` 各自 SSE push。

**`runCampaign()` loop**：
```
for each student:
  message = template.replaceAll('{{name}}', student.firstName)
  chatId = (targetNumber || student.phone) + '@c.us'
  SSE 'progress' sending
  try:
    msg = await client.sendMessage(chatId, message)
    ack = await waitForAck(msg, 1, 10000)  # up to 10s polling msg.ack
    SSE 'progress' sent
    db.recordSend({...})
    if not testMode and not isSelfSend:
      updateLastContact(student.id).catch(log)
  except:
    SSE 'progress' error
  await randomDelay(delayMin, delayMax)
SSE 'campaign_done'
```

⚠️ **重要**：`sendMessage` 成功（無 throw）就 count as success。ACK 只係 bonus info —「Message Yourself」嘅 chat ACK 可能一直係 0。

**Listen + auto-open browser**：
```js
app.listen(PORT, () => {
  console.log(`running → http://localhost:${PORT}`);
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});
client.initialize();
```

### 6.6 `public/index.html`

3 個主要 section，按 state 顯示：

**Setup Card**（`id="setupCard"`）— 當 `notionConfigured = false` 時顯示
- H2：「⚙️ 首次設定 — 連接你嘅 Notion CRM」
- Step 1：Create Notion Integration（link 到 `notion.so/my-integrations`，提示用戶 copy token）+ input `#setupToken`
- Step 2：分享 CRM 畀 Integration（指示 Connections menu）+ input `#setupDbUrl`
- Step 3：Product filter（optional）+ input `#setupProductFilter`
- Buttons：`#btnSetupTest`（🧪 Test 連線）`#btnSetupSave`（💾 Save + 啟動）
- 反饋 div `#setupMsg`

**WhatsApp Status Card**（`#waCard`）— 當 `notionConfigured = true` 時顯示
- Pill 顯示 status（啟動中/等 Scan QR/認證中/已連接/錯誤）
- QR image `#qrImg`（status = qr 時顯示）

**Main Panel**（`#mainPanel`）— `notionConfigured = true` AND `status = ready` 時顯示
- **🎨 揀紙樣 card**：template grid（5 個 card）+ textarea
- **⚙️ 發送設定 card**：Test mode checkbox + target number + delay min/max
- **👥 客戶名單 card**：Fetch 掣 + 揀咗 counter + 重設 CRM 掣 + 跳過 N 日 filter + list（checkbox + country flag + 姓名 + meta + sent badge + status pill）
- **🚀 執行 card**：Start/Stop + progress bar + log

用 WhatsApp 綠色 `#25d366` 做 primary，iOS 風格圓角卡。

### 6.7 `public/app.js`

State：`{ templates, selectedTemplateId, students, notionConfigured }`.

**關鍵 function**：
- `updatePanels()` — 根據 `state.notionConfigured` 同 `status.ready` 決定邊啲 card 顯示
- `testNotionConfig()` / `saveNotionConfig()` — POST /api/config/{test,save}
- `reconfigure()` — 清 setup inputs + 設 notionConfigured = false + updatePanels
- `renderStudents()` — render list，加 country flag、sent badge（7d/30d/>30d）、checkbox default 按 skipRecent + skipDays
- SSE listeners：`hello` / `wa_status` / `config_saved` / `progress` / `wait` / `campaign_done`

### 6.8 `start.command`（macOS 雙擊）

```bash
#!/bin/bash
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then npm install; fi
node server.js
```

`chmod +x start.command` 之後可以雙擊。

## 7. 學生嘅使用 flow

**第一次 setup**（5 分鐘）：

1. `git clone <repo>` + `npm install`
2. `npm start`（或雙擊 `start.command`）
3. Browser 自動開 → 見到 **Setup Wizard**
4. Step 1：去 `notion.so/my-integrations` 整 integration，copy token 返嚟 paste
5. Step 2：去 Notion CRM page → Connections → add integration → copy URL paste 返嚟
6. 撳 Test → 見到綠色 "連到 XXX" → 撳 Save
7. 自動跳去 WhatsApp QR stage → 用手機 scan
8. 連接成功 → Fetch Notion → 揀 template → Start

**之後每次**：
- 雙擊 `start.command` → Browser 彈出 → Session auto-login → Fetch → Start

## 8. 容易踩嘅坑

- **whatsapp-web.js version**：一定要 `^1.34` 或以上，舊版對新 WhatsApp Web schema fail
- **Puppeteer cold-start timeout**：set `protocolTimeout: 180000`
- **Chromium Singleton lock**：如果之前 crash，啟動前 `rm -f .wwebjs_auth/session/Singleton*`
- **ACK false-fail**：`sendMessage` 成功就係成功，ACK 未到 ≠ 失敗
- **Notion rate limit**：3 req/s，`updateLastContact` 用 `.catch()` 唔好 block
- **電話全形 `＋`**：U+FF0B，normalize 時要換半形
- **SSE Express 5**：要 `res.flushHeaders()` 立即 flush
- **Setup wizard reload**：`saveConfig` 後 call `loadConfig()` 即時 reload Notion client，唔需要重啟 server

## 9. 最終成品應該點

- `npm start` → Browser 自動彈
- 第一次：見到 Setup Wizard → 填 Notion integration → Test → Save
- 自動切換：WhatsApp QR → Scan → Ready
- Fetch Notion → 25 個客戶（帶國旗 🇭🇰🇸🇬🇲🇾 等）
- 揀「📚 課程 check-in」template
- 撳 Start Campaign → 彈 confirm → 確認
- 後台 Puppeteer 自動逐個 send，每條 random 10-20 秒 delay
- 見實時進度：Kk ✓ → 勤易 ✓ → Ada ✓
- 完成後 Notion 自動填「上次關心日期」= 今日
- 再 Fetch → 啱啱 send 嗰啲變灰 + 標「今日已 send」

---

# 結束

好，Claude，跟住步驟 1-9 由零起建。完成後每個 file 跑一次確保冇 syntax error，然後：

- 建 `.env.example`（placeholder 格式）但**唔好**建 `.env`（俾 setup wizard 自己造）
- Run `npm start` 確認 server 啟動
- 如果 WhatsApp 卡「啟動中」→ 升級 `npm install whatsapp-web.js@latest` 再試

完成後跟我講「✅ 完成，跑 `npm start` 試下」。

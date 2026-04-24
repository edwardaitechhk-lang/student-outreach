import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_PATH = path.join(__dirname, '.env');

let notion;
let DB_ID;
let PRODUCT_FILTER;

export function loadConfig() {
  dotenv.config({ path: ENV_PATH, override: true });
  notion = process.env.NOTION_TOKEN ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
  DB_ID = process.env.NOTION_DB_ID || null;
  PRODUCT_FILTER = process.env.PRODUCT_FILTER || '';
}

export function isConfigured() {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_DB_ID);
}

export function saveConfig({ token, dbId, productFilter }) {
  const cleanDbId = extractDbId(dbId);
  const lines = [
    `NOTION_TOKEN=${token}`,
    `NOTION_DB_ID=${cleanDbId}`,
    `PRODUCT_FILTER=${productFilter || ''}`,
    '',
  ];
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf8');
  loadConfig();
  return { cleanDbId };
}

export function extractDbId(input) {
  if (!input) return '';
  const str = String(input).trim();
  const hex = str.match(/[0-9a-f]{32}/i);
  if (hex) return hex[0];
  return str.replace(/-/g, '');
}

loadConfig();

const COUNTRY_FLAGS = {
  '852': '🇭🇰', '65': '🇸🇬', '60': '🇲🇾', '61': '🇦🇺', '86': '🇨🇳',
  '886': '🇹🇼', '44': '🇬🇧', '1': '🇺🇸', '81': '🇯🇵', '82': '🇰🇷',
};

export function normalizePhone(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/＋/g, '+').replace(/[\s\-()]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 8 && /^[2-9]/.test(digits)) return `852${digits}`;
  return digits;
}

export function detectCountry(phone) {
  if (!phone) return { code: null, flag: '' };
  for (const code of Object.keys(COUNTRY_FLAGS).sort((a, b) => b.length - a.length)) {
    if (phone.startsWith(code)) return { code, flag: COUNTRY_FLAGS[code] };
  }
  return { code: null, flag: '🌍' };
}

function getTitle(props) {
  const key = Object.keys(props).find(k => props[k].type === 'title');
  if (!key) return '';
  return props[key].title.map(t => t.plain_text).join('').trim();
}

function firstName(fullName) {
  const cleaned = fullName.replace(/\([^)]*\)/g, '').replace(/（[^）]*）/g, '').trim();
  return cleaned.split(/\s+/)[0];
}

export async function fetchStudents({ limit = 100 } = {}) {
  if (!notion || !DB_ID) throw new Error('Notion 未設定 — 先喺 Settings 填 token + DB URL');

  const queryArgs = { database_id: DB_ID, page_size: 100 };
  if (PRODUCT_FILTER) {
    queryArgs.filter = { property: '產品', multi_select: { contains: PRODUCT_FILTER } };
  }
  const res = await notion.databases.query(queryArgs);

  return res.results
    .map(page => {
      const p = page.properties;
      const rawPhone = p.WhatsApp?.phone_number;
      const phone = normalizePhone(rawPhone);
      const country = detectCountry(phone);
      const lastContact = p['上次關心日期']?.date?.start || null;
      return {
        id: page.id,
        name: getTitle(p),
        firstName: firstName(getTitle(p)),
        phone,
        phoneRaw: rawPhone,
        country: country.code,
        countryFlag: country.flag,
        status: p.Status?.status?.name ?? null,
        tier: p['學員 Tier']?.select?.name ?? null,
        vip: p['VIP / KOL']?.checkbox ?? false,
        lastContactNotion: lastContact,
        createdTime: page.created_time,
      };
    })
    .filter(s => s.phone && /^\d{8,15}$/.test(s.phone))
    .filter(s => !s.vip)
    .slice(0, limit);
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

export async function updateLastContact(pageId, dateIso = new Date().toISOString().slice(0, 10)) {
  if (!notion) return;
  return notion.pages.update({
    page_id: pageId,
    properties: { '上次關心日期': { date: { start: dateIso } } },
  });
}

export function renderMessage(student) {
  return `Hi ${student.firstName}，有冇開始睇課程呀？VS Code 上面有冇咩需要幫手或者發問嘅地方？`;
}

export function randomDelay(minSec = 60, maxSec = 120) {
  return Math.floor((Math.random() * (maxSec - minSec) + minSec) * 1000);
}

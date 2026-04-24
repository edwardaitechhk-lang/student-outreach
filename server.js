import express from 'express';
import QRCode from 'qrcode';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchStudents, randomDelay, updateLastContact } from './lib.js';
import { TEMPLATES } from './templates.js';
import { recordSend, getAllLastSent } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3456;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let state = {
  waStatus: 'initializing',
  qrDataUrl: null,
  selfPhone: null,
  campaign: null,
};

const sseClients = new Set();
function sseSend(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

function daysAgo(timestamp) {
  return Math.floor((Date.now() - timestamp) / (24 * 3600 * 1000));
}

async function fetchStudentsWithHistory(limit = 100) {
  const students = await fetchStudents({ limit });
  const history = getAllLastSent();
  return students.map(s => ({
    ...s,
    lastSentAt: history[s.id] || null,
    lastSentDays: history[s.id] ? daysAgo(history[s.id]) : null,
  }));
}

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify(state)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/templates', (req, res) => res.json(TEMPLATES));
app.get('/api/status', (req, res) => res.json(state));

app.get('/api/students', async (req, res) => {
  try {
    const students = await fetchStudentsWithHistory(parseInt(req.query.limit) || 100);
    res.json({ ok: true, students });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
  puppeteer: { headless: true, args: ['--no-sandbox'] },
});

client.on('qr', async qr => {
  state.waStatus = 'qr';
  state.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
  sseSend('wa_status', { status: 'qr', qrDataUrl: state.qrDataUrl });
  console.log('📱 QR code ready — open http://localhost:' + PORT);
});

client.on('authenticated', () => {
  state.waStatus = 'authenticated';
  sseSend('wa_status', { status: 'authenticated' });
  console.log('✅ authenticated');
});

client.on('ready', () => {
  state.waStatus = 'ready';
  state.selfPhone = client.info?.wid?.user || null;
  sseSend('wa_status', { status: 'ready', selfPhone: state.selfPhone });
  console.log(`✅ ready (logged in as +${state.selfPhone})`);
});

client.on('auth_failure', () => {
  state.waStatus = 'auth_failure';
  sseSend('wa_status', { status: 'auth_failure' });
});

client.on('disconnected', () => {
  state.waStatus = 'disconnected';
  sseSend('wa_status', { status: 'disconnected' });
});

async function waitForAck(msg, minAck = 1, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (msg.ack >= minAck) return msg.ack;
    await new Promise(r => setTimeout(r, 500));
  }
  return msg.ack ?? 0;
}

async function runCampaign({ students, template, templateId, targetNumber, delayMin, delayMax }) {
  const campaign = {
    running: true,
    total: students.length,
    current: 0,
    success: 0,
    failed: 0,
    stopRequested: false,
  };
  state.campaign = campaign;

  const isSelfSend = targetNumber && targetNumber === state.selfPhone;

  for (let i = 0; i < students.length; i++) {
    if (campaign.stopRequested) break;
    const s = students[i];
    campaign.current = i;
    const message = template.replaceAll('{{name}}', s.firstName);
    const finalTarget = targetNumber || s.phone;
    const chatId = `${finalTarget}@c.us`;

    sseSend('progress', { index: i, name: s.name, status: 'sending', detail: '發送中...' });

    try {
      const msg = await client.sendMessage(chatId, message);
      const ack = await waitForAck(msg, 1, 10000);

      campaign.success++;
      let detail;
      if (ack >= 2) detail = `✅ 已送達 (ACK=${ack})`;
      else if (ack === 1) detail = `✅ 已發出到 server (ACK=1)`;
      else if (isSelfSend) detail = '✅ 已 send 到 Message Yourself';
      else detail = '✅ 已發送（ACK 未回）';

      sseSend('progress', { index: i, name: s.name, status: 'sent', detail });

      recordSend({
        studentId: s.id, studentName: s.name, phone: finalTarget,
        message, templateId, ack, result: 'sent',
      });

      if (!isSelfSend && !targetNumber) {
        updateLastContact(s.id).catch(err =>
          console.error(`Notion update failed for ${s.name}:`, err.message)
        );
      }
    } catch (err) {
      campaign.failed++;
      sseSend('progress', { index: i, name: s.name, status: 'error', detail: `❌ ${err.message}` });
      recordSend({
        studentId: s.id, studentName: s.name, phone: finalTarget,
        message, templateId, ack: null, result: 'error',
      });
    }

    if (i < students.length - 1 && !campaign.stopRequested) {
      const wait = randomDelay(delayMin, delayMax);
      sseSend('wait', { nextIn: Math.round(wait / 1000) });
      await new Promise(r => setTimeout(r, wait));
    }
  }

  campaign.running = false;
  sseSend('campaign_done', { success: campaign.success, failed: campaign.failed, total: students.length });
  state.campaign = campaign;
}

app.post('/api/start', async (req, res) => {
  if (state.waStatus !== 'ready') return res.status(400).json({ ok: false, error: 'WhatsApp 未就緒' });
  if (state.campaign?.running) return res.status(400).json({ ok: false, error: '已有 campaign 正在運行' });

  const { studentIds, template, templateId, targetNumber, delayMin = 10, delayMax = 20 } = req.body;
  const allStudents = await fetchStudents({ limit: 100 });
  const selected = studentIds?.length ? allStudents.filter(s => studentIds.includes(s.id)) : allStudents.slice(0, 10);

  res.json({ ok: true, count: selected.length });
  runCampaign({ students: selected, template, templateId, targetNumber, delayMin, delayMax });
});

app.post('/api/stop', (req, res) => {
  if (state.campaign) state.campaign.stopRequested = true;
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Student Outreach running → http://localhost:${PORT}\n`);
  try { execSync(`open http://localhost:${PORT}`); } catch {}
});

client.initialize();

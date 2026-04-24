const $ = id => document.getElementById(id);
const state = { templates: [], selectedTemplateId: null, students: [], notionConfigured: false };

const statusLabels = {
  initializing: { text: '啟動中...', cls: 'pill-init' },
  qr: { text: '等 Scan QR', cls: 'pill-qr' },
  authenticated: { text: '認證中...', cls: 'pill-auth' },
  ready: { text: '已連接', cls: 'pill-ready' },
  auth_failure: { text: '認證失敗', cls: 'pill-err' },
  disconnected: { text: '已斷線', cls: 'pill-err' },
};

function setStatus(status, detail) {
  const info = statusLabels[status] || statusLabels.initializing;
  $('statusPill').textContent = info.text;
  $('statusPill').className = 'pill ' + info.cls;
  $('statusDetail').textContent = detail || '';
  $('qrBox').style.display = (status === 'qr') ? 'block' : 'none';
  updatePanels();
}

function updatePanels() {
  const statusEl = $('statusPill');
  const isReady = statusEl && statusEl.classList.contains('pill-ready');
  $('setupCard').style.display = state.notionConfigured ? 'none' : 'block';
  $('waCard').style.display = state.notionConfigured ? 'block' : 'none';
  $('mainPanel').style.display = (state.notionConfigured && isReady) ? 'block' : 'none';
}

function setSetupMsg(text, cls) {
  const el = $('setupMsg');
  el.className = 'setup-msg ' + (cls || '');
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
}

async function testNotionConfig() {
  const token = $('setupToken').value.trim();
  const dbId = $('setupDbUrl').value.trim();
  if (!token || !dbId) return setSetupMsg('Step 1/2 要填', 'err');
  setSetupMsg('測試緊...', 'ok');
  const r = await fetch('/api/config/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, dbId }),
  });
  const data = await r.json();
  if (data.ok) setSetupMsg(`✅ 連到：「${data.dbTitle}」(${data.dbId})`, 'ok');
  else setSetupMsg('❌ ' + data.error, 'err');
}

async function saveNotionConfig() {
  const token = $('setupToken').value.trim();
  const dbId = $('setupDbUrl').value.trim();
  const productFilter = $('setupProductFilter').value.trim();
  if (!token || !dbId) return setSetupMsg('Step 1/2 要填', 'err');
  setSetupMsg('儲存緊...', 'ok');
  const r = await fetch('/api/config/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, dbId, productFilter }),
  });
  const data = await r.json();
  if (data.ok) {
    setSetupMsg(`✅ 已儲存！連到「${data.dbTitle}」— 即時重新載入名單...`, 'ok');
    state.notionConfigured = true;
    state.students = [];
    $('studentList').innerHTML = '';
    $('studentCount').textContent = '未 fetch';
    updatePanels();
    setTimeout(() => fetchStudents(), 800);
  } else {
    setSetupMsg('❌ ' + data.error, 'err');
  }
}

function reconfigure() {
  if (!confirm('重設 CRM 連線？現有 token 會被覆蓋。')) return;
  state.notionConfigured = false;
  state.students = [];
  $('studentList').innerHTML = '';
  $('studentCount').textContent = '未 fetch';
  $('setupToken').value = '';
  $('setupDbUrl').value = '';
  $('setupProductFilter').value = '';
  setSetupMsg('', '');
  updatePanels();
}

function renderTemplates() {
  const grid = $('templateGrid');
  grid.innerHTML = '';
  state.templates.forEach(t => {
    const div = document.createElement('div');
    div.className = 'template-card' + (t.id === state.selectedTemplateId ? ' selected' : '');
    div.innerHTML = `<div class="name">${t.name}</div><div class="desc">${t.description}</div>`;
    div.onclick = () => selectTemplate(t.id);
    grid.appendChild(div);
  });
}

function selectTemplate(id) {
  state.selectedTemplateId = id;
  const tpl = state.templates.find(t => t.id === id);
  if (tpl) $('templateText').value = tpl.text;
  renderTemplates();
}

function renderStudents() {
  const list = $('studentList');
  list.innerHTML = '';
  const skipRecent = $('skipRecent').checked;
  const skipDays = parseInt($('skipDays').value) || 30;

  state.students.forEach((s, i) => {
    const recentlySent = s.lastSentDays !== null && s.lastSentDays < skipDays;
    const shouldCheck = !(skipRecent && recentlySent);

    let sentBadge = '';
    if (s.lastSentDays === 0) sentBadge = `<span class="badge badge-warn">今日已 send</span>`;
    else if (s.lastSentDays !== null && s.lastSentDays < 7) sentBadge = `<span class="badge badge-warn">${s.lastSentDays}d 前 send 過</span>`;
    else if (s.lastSentDays !== null && s.lastSentDays < 30) sentBadge = `<span class="badge badge-muted">${s.lastSentDays}d 前 send 過</span>`;
    else if (s.lastSentDays !== null) sentBadge = `<span class="badge badge-ok">上次 ${s.lastSentDays}d 前</span>`;

    const flag = s.countryFlag || '🌍';
    const div = document.createElement('div');
    div.className = 'student' + (recentlySent ? ' student-dim' : '');
    div.id = `s-${i}`;
    div.innerHTML = `
      <input type="checkbox" ${shouldCheck ? 'checked' : ''} data-index="${i}">
      <div class="info">
        <div><strong>${s.name}</strong> ${sentBadge}</div>
        <div class="meta">${flag} +${s.phone} · ${s.tier || '—'} · ${s.status || ''}</div>
      </div>
      <span class="status s-pending">待發</span>
    `;
    list.appendChild(div);
  });

  updateCount();
}

function updateCount() {
  const total = state.students.length;
  const checked = document.querySelectorAll('#studentList input:checked').length;
  $('studentCount').textContent = `${checked} 揀咗 / ${total} 個`;
  $('btnStart').disabled = checked === 0;
}

function setStudentStatus(i, klass, text) {
  const el = document.querySelector(`#s-${i} .status`);
  if (!el) return;
  el.className = 'status ' + klass;
  el.textContent = text;
}

function appendLog(line) {
  const log = $('log');
  log.style.display = 'block';
  log.textContent += line + '\n';
  log.scrollTop = log.scrollHeight;
}

async function loadTemplates() {
  const r = await fetch('/api/templates');
  state.templates = await r.json();
  if (state.templates.length) selectTemplate(state.templates[0].id);
  renderTemplates();
}

async function fetchStudents() {
  $('btnFetch').disabled = true;
  $('btnFetch').textContent = '⏳ Fetching...';
  try {
    const r = await fetch('/api/students?limit=100');
    const data = await r.json();
    if (!data.ok) throw new Error(data.error);
    state.students = data.students;
    renderStudents();
  } catch (err) {
    alert('Fetch 失敗：' + err.message);
  } finally {
    $('btnFetch').disabled = false;
    $('btnFetch').textContent = '🔄 Fetch Notion';
  }
}

async function startCampaign() {
  const selected = Array.from(document.querySelectorAll('#studentList input:checked')).map(cb => state.students[parseInt(cb.dataset.index)]);
  if (!selected.length) return alert('揀至少一個客戶');

  const template = $('templateText').value.trim();
  if (!template) return alert('Template 唔可以空');

  const testMode = $('testMode').checked;
  const targetNumber = testMode ? $('targetNumber').value.replace(/\D/g, '') : null;
  if (testMode && !targetNumber) return alert('Test mode 要填 target number');

  if (!testMode) {
    const confirmMsg = `真係會 send 俾 ${selected.length} 個真客戶（唔係 test mode），確定？`;
    if (!confirm(confirmMsg)) return;
  }

  $('btnStart').style.display = 'none';
  $('btnStop').style.display = 'inline-block';
  $('log').style.display = 'block';
  $('log').textContent = '';
  appendLog(`🚀 開始 campaign：${selected.length} 個客戶${testMode ? `（Test → +${targetNumber}）` : '（真發送）'}`);

  const r = await fetch('/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentIds: selected.map(s => s.id),
      template,
      templateId: state.selectedTemplateId,
      targetNumber,
      delayMin: parseInt($('delayMin').value) || 10,
      delayMax: parseInt($('delayMax').value) || 20,
    }),
  });
  const data = await r.json();
  if (!data.ok) {
    appendLog(`❌ ${data.error}`);
    $('btnStop').style.display = 'none';
    $('btnStart').style.display = 'inline-block';
  }
}

async function stopCampaign() {
  await fetch('/api/stop', { method: 'POST' });
  appendLog('⏸  Stop 請求已送');
}

$('btnFetch').onclick = fetchStudents;
$('btnStart').onclick = startCampaign;
$('btnStop').onclick = stopCampaign;
$('btnReconfig').onclick = reconfigure;
$('btnSetupTest').onclick = testNotionConfig;
$('btnSetupSave').onclick = saveNotionConfig;
$('testMode').onchange = (e) => { $('targetNumber').disabled = !e.target.checked; };
$('skipRecent').onchange = renderStudents;
$('skipDays').onchange = renderStudents;
document.addEventListener('change', e => {
  if (e.target.matches('#studentList input[type="checkbox"]')) updateCount();
});

const es = new EventSource('/api/events');
es.addEventListener('hello', e => {
  const s = JSON.parse(e.data);
  state.notionConfigured = !!s.notionConfigured;
  setStatus(s.waStatus, s.selfPhone ? `登入：+${s.selfPhone}` : '');
  if (s.waStatus === 'qr' && s.qrDataUrl) $('qrImg').src = s.qrDataUrl;
  updatePanels();
});
es.addEventListener('wa_status', e => {
  const s = JSON.parse(e.data);
  setStatus(s.status, s.selfPhone ? `登入：+${s.selfPhone}` : '');
  if (s.status === 'qr' && s.qrDataUrl) $('qrImg').src = s.qrDataUrl;
});
es.addEventListener('config_saved', e => {
  state.notionConfigured = true;
  updatePanels();
});
es.addEventListener('progress', e => {
  const p = JSON.parse(e.data);
  const cls = p.status === 'sending' ? 's-sending' : p.status === 'sent' ? 's-sent' : 's-error';
  const txt = p.status === 'sending' ? '發送中' : p.status === 'sent' ? '✓' : '✗';
  setStudentStatus(p.index, cls, txt);
  appendLog(`[${p.index + 1}] ${p.name} — ${p.detail}`);
  const total = state.students.length;
  const pct = Math.round(((p.index + 1) / total) * 100);
  $('progressFill').style.width = pct + '%';
  $('progressText').textContent = `${p.index + 1} / ${total}`;
});
es.addEventListener('wait', e => {
  const d = JSON.parse(e.data);
  appendLog(`⏱  等 ${d.nextIn} 秒...`);
});
es.addEventListener('campaign_done', e => {
  const d = JSON.parse(e.data);
  appendLog(`\n✅ 完成：${d.success} 成功 / ${d.failed} 失敗（共 ${d.total}）`);
  $('btnStop').style.display = 'none';
  $('btnStart').style.display = 'inline-block';
  setTimeout(() => fetchStudents(), 1500);
});

loadTemplates();

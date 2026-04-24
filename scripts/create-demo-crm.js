import { notion } from '../lib.js';

const PARENT_PAGE_ID = process.argv[2] || '34c87d18-641e-8022-87ae-c849f80c4ab2';

const SCHEMA = {
  '姓名': { title: {} },
  'WhatsApp': { phone_number: {} },
  'IG Handle': { rich_text: {} },
  '產品': {
    multi_select: {
      options: [
        { name: '12 Agent 課程', color: 'blue' },
        { name: 'Coaching', color: 'green' },
        { name: 'Workshop', color: 'yellow' },
      ],
    },
  },
  '學員 Tier': {
    select: {
      options: [
        { name: '超早鳥 $2580', color: 'pink' },
        { name: '第二輪 $3888', color: 'yellow' },
        { name: '特別價', color: 'purple' },
      ],
    },
  },
  'Status': {
    status: {
      options: [
        { name: '未開始', color: 'default' },
        { name: '進行中', color: 'blue' },
        { name: '完成', color: 'green' },
      ],
    },
  },
  '行業': {
    select: {
      options: [
        { name: '教育', color: 'pink' },
        { name: '金融', color: 'blue' },
        { name: 'KOL', color: 'purple' },
        { name: '自由業', color: 'orange' },
        { name: '科技', color: 'green' },
        { name: '其他', color: 'gray' },
      ],
    },
  },
  'VIP / KOL': { checkbox: {} },
  '付款日期': { date: {} },
  '金額 HKD': { number: { format: 'hong_kong_dollar' } },
  '上次關心日期': { date: {} },
  '下次 Follow-up': { date: {} },
  'Notes': { rich_text: {} },
};

const FAKE_STUDENTS = [
  { name: '張大文 Alex',    phone: '+852 5500 0001', ig: '@alex_demo',    tier: '超早鳥 $2580', status: '完成',   product: '12 Agent 課程', industry: '科技',   amount: 2580, vip: false },
  { name: '陳小美 Betty',   phone: '+852 5500 0002', ig: '@betty_demo',   tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '教育',   amount: 3888, vip: false },
  { name: '李志強 Carson',  phone: '+852 5500 0003', ig: '@carson_demo',  tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '金融',   amount: 3888, vip: false },
  { name: '黃麗珊 Diana',   phone: '+852 5500 0004', ig: '@diana_demo',   tier: '超早鳥 $2580', status: '完成',   product: '12 Agent 課程', industry: 'KOL',    amount: 2580, vip: true  },
  { name: '吳俊傑 Eric',    phone: '+852 5500 0005', ig: '@eric_demo',    tier: '特別價',       status: '進行中', product: '12 Agent 課程', industry: '其他',   amount: 2000, vip: false },
  { name: '劉雅婷 Fiona',   phone: '+852 5500 0006', ig: '@fiona_demo',   tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '教育',   amount: 3888, vip: false },
  { name: '周家豪 Gary',    phone: '+852 5500 0007', ig: '@gary_demo',    tier: '超早鳥 $2580', status: '完成',   product: '12 Agent 課程', industry: '自由業', amount: 2580, vip: false },
  { name: '林可欣 Helen',   phone: '+852 5500 0008', ig: '@helen_demo',   tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '金融',   amount: 3888, vip: false },
  { name: '楊浩然 Ian',     phone: '+65 8500 0009',  ig: '@ian_demo',     tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '科技',   amount: 3888, vip: false },
  { name: '曾美玲 Jenny',   phone: '+60 15 500 0010',ig: '@jenny_demo',   tier: '超早鳥 $2580', status: '完成',   product: '12 Agent 課程', industry: '教育',   amount: 2580, vip: false },
  { name: '鄭俊賢 Kevin',   phone: '+852 5500 0011', ig: '@kevin_demo',   tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '其他',   amount: 3888, vip: false },
  { name: '蘇嘉雯 Lily',    phone: '+852 5500 0012', ig: '@lily_demo',    tier: '特別價',       status: '完成',   product: '12 Agent 課程', industry: 'KOL',    amount: 2500, vip: true  },
  { name: '何文斌 Marcus',  phone: '+852 5500 0013', ig: '@marcus_demo',  tier: '第二輪 $3888', status: '完成',   product: '12 Agent 課程', industry: '金融',   amount: 3888, vip: false },
  { name: '羅芷珊 Nina',    phone: '+852 5500 0014', ig: '@nina_demo',    tier: '超早鳥 $2580', status: '完成',   product: '12 Agent 課程', industry: '自由業', amount: 2580, vip: false },
  { name: '高志偉 Oscar',   phone: '+61 400 500 015',ig: '@oscar_demo',   tier: '第二輪 $3888', status: '進行中', product: '12 Agent 課程', industry: '科技',   amount: 3888, vip: false },
];

async function createDatabase(parentId) {
  console.log(`📁 Creating demo database under page ${parentId}...`);
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentId },
    title: [{ type: 'text', text: { content: 'CRM Demo（教學用 · 假資料）' } }],
    icon: { type: 'emoji', emoji: '🎭' },
    properties: SCHEMA,
  });
  console.log(`✅ Database created: ${db.id}`);
  console.log(`   URL: https://www.notion.so/${db.id.replace(/-/g, '')}`);
  return db.id;
}

async function addStudent(dbId, s, dayOffset) {
  const paidDate = new Date(Date.now() - dayOffset * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      '姓名': { title: [{ text: { content: s.name } }] },
      'WhatsApp': { phone_number: s.phone },
      'IG Handle': { rich_text: [{ text: { content: s.ig } }] },
      '產品': { multi_select: [{ name: s.product }] },
      '學員 Tier': { select: { name: s.tier } },
      'Status': { status: { name: s.status } },
      '行業': { select: { name: s.industry } },
      'VIP / KOL': { checkbox: s.vip },
      '付款日期': { date: { start: paidDate } },
      '金額 HKD': { number: s.amount },
      'Notes': { rich_text: [{ text: { content: '[DEMO] 教學示範用假資料' } }] },
    },
  });
}

async function main() {
  const dbId = await createDatabase(PARENT_PAGE_ID);
  console.log(`\n📝 Adding ${FAKE_STUDENTS.length} 學員...`);
  for (let i = 0; i < FAKE_STUDENTS.length; i++) {
    const s = FAKE_STUDENTS[i];
    try {
      await addStudent(dbId, s, (FAKE_STUDENTS.length - i) * 7);
      console.log(`  [${i + 1}/${FAKE_STUDENTS.length}] ✅ ${s.name}`);
    } catch (err) {
      console.log(`  [${i + 1}/${FAKE_STUDENTS.length}] ❌ ${s.name}: ${err.message}`);
    }
  }
  console.log(`\n✅ 完成！Demo CRM DB ID: ${dbId}`);
  console.log(`\n用法：將 DB_ID 改做 ${dbId} 就會用 demo data`);
  console.log(`或喺 .env 加：NOTION_DB_ID=${dbId}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'send-history.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS send_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    student_name TEXT,
    phone TEXT,
    message TEXT,
    template_id TEXT,
    ack INTEGER,
    result TEXT,
    sent_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_student_sent ON send_history(student_id, sent_at);
`);

const stmtInsert = db.prepare(`
  INSERT INTO send_history (student_id, student_name, phone, message, template_id, ack, result, sent_at)
  VALUES (@student_id, @student_name, @phone, @message, @template_id, @ack, @result, @sent_at)
`);

const stmtLastSent = db.prepare(`
  SELECT MAX(sent_at) AS last_sent_at
  FROM send_history
  WHERE student_id = ? AND result = 'sent'
`);

const stmtAllLastSent = db.prepare(`
  SELECT student_id, MAX(sent_at) AS last_sent_at
  FROM send_history
  WHERE result = 'sent'
  GROUP BY student_id
`);

export function recordSend({ studentId, studentName, phone, message, templateId, ack, result }) {
  stmtInsert.run({
    student_id: studentId,
    student_name: studentName,
    phone,
    message,
    template_id: templateId || null,
    ack: ack ?? null,
    result,
    sent_at: Date.now(),
  });
}

export function getLastSent(studentId) {
  const row = stmtLastSent.get(studentId);
  return row?.last_sent_at || null;
}

export function getAllLastSent() {
  const rows = stmtAllLastSent.all();
  const map = {};
  for (const r of rows) map[r.student_id] = r.last_sent_at;
  return map;
}

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Telegraf } = require('telegraf');
const { db, ADMIN_IDS } = require('./db');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = (process.env.WEBAPP_URL || '').replace(/\/+$/, '');
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("XATO: .env faylida BOT_TOKEN ko'rsatilmagan!");
  process.exit(1);
}

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Frontend konfiguratsiyasi
app.get('/config.js', (req, res) => {
  res.type('application/javascript')
    .send('window.__CONFIG__ = ' + JSON.stringify({ botUsername: process.env.BOT_USERNAME || '' }) + ';');
});

/* ================= Telegram WebAppData tekshiruvi ================= */
function validateInitData(initData, token) {
  if (!initData) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  // 1 kunlik amal qilish muddati
  const authDate = Number(params.get('auth_date') || 0);
  if (Date.now() / 1000 - authDate > 86400) return false;

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

/* ================= Auth middleware ================= */
function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.body?.initData || '';
  if (!validateInitData(initData, BOT_TOKEN)) {
    return res.status(401).json({ error: 'Ruxsat etilmagan. Bot orqali oching.' });
  }

  const params = new URLSearchParams(initData);
  let user = {};
  try { user = JSON.parse(params.get('user') || '{}'); } catch {}
  if (!user.id) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });

  const row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.id);
  let userId, isAdmin;

  if (row) {
    userId = row.id;
    // ADMIN_IDS ga kiritilgan bo'lsa — admin huquqini yangilab turamiz
    isAdmin = !!row.is_admin || ADMIN_IDS.includes(user.id);
    db.prepare('UPDATE users SET username = ?, first_name = ?, is_admin = ? WHERE telegram_id = ?')
      .run(user.username || null, user.first_name || null, isAdmin ? 1 : 0, user.id);
  } else {
    isAdmin = ADMIN_IDS.includes(user.id);
    const info = db.prepare(
      'INSERT INTO users (telegram_id, username, first_name, is_admin) VALUES (?, ?, ?, ?)'
    ).run(user.id, user.username || null, user.first_name || null, isAdmin ? 1 : 0);
    userId = info.lastInsertRowid;
  }

  req.user = {
    id: userId,
    telegram_id: user.id,
    username: user.username,
    first_name: user.first_name,
    is_admin: isAdmin,
  };
  next();
}

/* ================= API: AUTH ================= */
app.post('/api/auth', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

/* ================= API: TESTLAR ================= */
app.get('/api/tests', authMiddleware, (req, res) => {
  const rows = db.prepare(
    `SELECT id, image_path, question, variants, created_at
     FROM tests ORDER BY id DESC LIMIT 100`
  ).all();
  res.json(rows.map(r => ({
    id: r.id,
    question: r.question,
    variants_count: (JSON.parse(r.variants || '[]')).length,
    image: r.image_path ? '/uploads/' + path.basename(r.image_path) : null,
    created_at: r.created_at,
  })));
});

// To'g'ri javob yashirin qaytariladi (yechish uchun)
app.get('/api/tests/:id', authMiddleware, (req, res) => {
  const t = db.prepare('SELECT id, image_path, question, variants FROM tests WHERE id = ?')
    .get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Test topilmadi' });
  res.json({
    id: t.id,
    question: t.question,
    image: t.image_path ? '/uploads/' + path.basename(t.image_path) : null,
    variants: JSON.parse(t.variants || '[]'),
  });
});

/* ================= API: JAVOBNI TEKSHIRISH ================= */
app.post('/api/tests/:id/submit', authMiddleware, (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Test topilmadi' });

  const variants = JSON.parse(test.variants || '[]');
  const answer = Number(req.body?.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer >= variants.length) {
    return res.status(400).json({ error: "Noto'g'ri javob" });
  }

  const correct = answer === test.correct_index;
  db.prepare('INSERT INTO results (user_id, test_id, correct, total, answers) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, test.id, correct ? 1 : 0, 1, JSON.stringify({ answer }));

  res.json({
    correct,
    correctIndex: test.correct_index,
    correctVariant: variants[test.correct_index],
    yourVariant: variants[answer],
  });
});

/* ================= API: TARIX ================= */
app.get('/api/results', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.correct, r.total, r.answers, r.finished_at,
           t.question, t.image_path, t.variants, t.correct_index
    FROM results r JOIN tests t ON t.id = r.test_id
    WHERE r.user_id = ?
    ORDER BY r.id DESC LIMIT 50
  `).all(req.user.id);

  res.json(rows.map(r => ({
    id: r.id,
    correct: !!r.correct,
    total: r.total,
    answers: JSON.parse(r.answers || '{}'),
    finished_at: r.finished_at,
    question: r.question,
    image: r.image_path ? '/uploads/' + path.basename(r.image_path) : null,
    variants: JSON.parse(r.variants || '[]'),
    correct_index: r.correct_index,
  })));
});

/* ================= API: ADMIN ================= */
function adminOnly(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Faqat admin' });
  next();
}

app.get('/api/admin/tests', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare(
    `SELECT id, image_path, question, variants, correct_index, created_by, created_at
     FROM tests ORDER BY id DESC`
  ).all();
  res.json(rows.map(r => ({
    id: r.id,
    question: r.question,
    variants: JSON.parse(r.variants || '[]'),
    correct_index: r.correct_index,
    created_at: r.created_at,
    image: r.image_path ? '/uploads/' + path.basename(r.image_path) : null,
  })));
});

app.post('/api/admin/tests', authMiddleware, adminOnly, (req, res) => {
  const { imageDataUrl, question, variants, correctIndex } = req.body || {};
  const q = String(question || '').trim();
  const vars = Array.isArray(variants) ? variants.map(v => String(v).trim()).filter(Boolean) : [];
  const ci = Number(correctIndex);

  if (!q) return res.status(400).json({ error: 'Savol kiritilmagan' });
  if (vars.length < 2) return res.status(400).json({ error: "Kamida 2 ta variant kerak" });
  if (!Number.isInteger(ci) || ci < 0 || ci >= vars.length) {
    return res.status(400).json({ error: "To'g'ri javob tanlanmagan" });
  }

  let imagePath = null;
  if (imageDataUrl) {
    const m = String(imageDataUrl).match(/^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ error: "Rasm formati qo'llab-quvvatlanmaydi" });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Rasm juda katta (15 MB gacha)' });
    const fname = Date.now().toString(36) + '-' + crypto.randomBytes(5).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    imagePath = path.join('uploads', fname);
    fs.writeFileSync(path.join(__dirname, imagePath), buf);
  }

  const info = db.prepare(
    'INSERT INTO tests (image_path, question, variants, correct_index, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run(imagePath, q, JSON.stringify(vars), ci, req.user.id);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/admin/tests/:id', authMiddleware, adminOnly, (req, res) => {
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Topilmadi' });
  if (test.image_path) { try { fs.unlinkSync(path.join(__dirname, test.image_path)); } catch {} }
  db.prepare('DELETE FROM results WHERE test_id = ?').run(test.id);
  db.prepare('DELETE FROM tests WHERE id = ?').run(test.id);
  res.json({ ok: true });
});

/* ================= TELEGRAM BOT ================= */
const bot = new Telegraf(BOT_TOKEN);

function mainMenu(ctx, text) {
  return ctx.reply(text, {
    reply_markup: {
      resize_keyboard: true,
      keyboard: [
        [{ text: '🧩 Test yechish', web_app: { url: WEBAPP_URL } }],
      ],
    },
  });
}

bot.start(ctx => mainMenu(
  ctx,
  `Assalomu alaykum, ${ctx.from.first_name || 'dostim'}! 👋\n\n🧩 Test yechish uchun tugmani bosing — ajoyib Mini App ochiladi.`
));

bot.command('help', ctx => ctx.reply(
  "📖 Yordam:\n" +
  "• 🧩 Test yechish — Mini App ichida testlarni yeching\n" +
  "• 📊 Tarix — Mini App ichida (pastki tab bar: 📊)\n" +
  "• ⚙️ Admin — Mini App ichida (faqat adminlar uchun)"
));

bot.command('admin', ctx => mainMenu(ctx, "⚙️ Admin panel: Mini App ichida «Admin» varrog'i orqali test qo'shing va boshqaring."));

(async () => {
  // Web-server har doim ishlaydi
  app.listen(PORT, () => console.log(`🌐 Server: http://localhost:${PORT}`));

  try {
    if (WEBAPP_URL) {
      app.use(bot.webhookCallback(`/bot${BOT_TOKEN}`));
      await bot.telegram.setWebhook(`${WEBAPP_URL}/bot${BOT_TOKEN}`);
      console.log(`✅ Webhook ishlayapti: ${WEBAPP_URL}/bot${BOT_TOKEN}`);
    } else {
      await bot.launch();
      console.log('✅ Polling rejimi (development) — WEBAPP_URL ko\'rsatilmagan');
    }
  } catch (e) {
    console.error('⚠️ Bot ishga tushmadi (BOT_TOKEN noto\'g\'rimi?):', e.message);
  }
})();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

# ✨ TestHub — Telegram Bot + Mini App

Telegram bot va ajoyib **blur (glassmorphism) dizayn**li Mini App. Foydalanuvchilar test yechadi, tarixi saqlanadi; admin esa rasm yuklab, **OCR** orqali variantlarni avtomatik to'g'irlaydi.

## 🎬 Xususiyatlari

- 🌫️ **Blur dizayn** — glassmorphism, suzuvchi orb-lar, silliq animatsiyalar
- 📱 **Tab bar** — Testlar / Tarix / Admin (faqat adminda)
- 🧩 **Test yechish** — botdagi «Test yechish» tugmasi Mini App ni ochadi
- 📊 **Tarix** — har bir yechilgan test natijasi (to'g'ri/noto'g'ri, sana)
- ⚙️ **Admin panel**:
  - 🖼️ Rasm yuklash (drag & drop)
  - 🔎 **OCR** — rasmdan matn o'qib, `A) ... B) ...` variantlarini avtomatik to'g'irlaydi
  - ✍️ Savol yozish, to'g'ri javobni radio orqali tanlash
  - 🗑 Testlarni o'chirish

## 🚀 Tez boshlanish

### 1. Botni yarating
1. [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni nusxalang
2. [@userinfobot](https://t.me/userinfobot) → o'zingizning Telegram ID ni toping

### 2. Sozlamalar
```bash
cd telegram-test-mini-app
cp .env.example .env
```
`.env` faylini to'ldiring:
```
BOT_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BOT_USERNAME=TestHubBot
WEBAPP_URL=https://sizing-domeningiz.com
ADMIN_IDS=123456789
PORT=3000
```

> ⚠️ Telegram Mini App **HTTPS**ni talab qiladi. Lokal test uchun:
> ```bash
> ngrok http 3000
> ```
> Chiqqan `https://xxxx.ngrok-free.app` manzilini `WEBAPP_URL` ga yozing.

### 3. Ishga tushirish
```bash
npm install
npm start
```
Bot avtomatik ravishda webhook sozlaydi. Lokal tekshirish uchun `npm run dev` (polling rejimi).

## 🕐 Ish tartibi

1. Foydalanuvchi botga `/start` yozadi → «🧩 Test yechish» tugmasi ko'rinadi
2. Tugmani bosish → Mini App ochiladi (Telegram `initData` orqali autentifikatsiya)
3. Admin: **Admin → Yangi test qo'shish → rasm yuklash → OCR avtomatik variantlarni to'g'irlaydi → savol yozish → saqlash**
4. Boshqalar: **Testlarni tanlash → javob berish → natija modal + tarixga saqlanish**

## 📁 Fayl tuzilishi

```
telegram-test-mini-app/
├── server.js          # Express + Telegram bot + API
├── db.js              # SQLite bazasi (better-sqlite3)
├── package.json
├── .env.example
└── public/            # Mini App (frontend)
    ├── index.html
    ├── style.css      # Blur dizayn
    └── app.js         # Router, test, OCR, tarix
```

## 🔒 Xavfsizlik

- Har bir API so'rovda Telegram `initData` HMAC-SHA256 bilan tekshiriladi
- To'g'ri javob test yechish paytida yashirin qaytariladi
- Admin endpointlari faqat `ADMIN_IDS` dan foydalanuvchilarga ochiq

## 🛠 Texnologiyalar

Node.js · Express · Telegraf · better-sqlite3 · Telegram Web App SDK · Tesseract.js (OCR)
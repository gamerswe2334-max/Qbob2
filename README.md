# Qbob 🤖

AI-асистент з реальним pipeline, авторизацією, кешем і лімітами.

---

## Структура файлів

```
qbob/
├── index.html          ← Фронтенд (весь UI + auth + API виклики)
├── vercel.json         ← Конфіг Vercel
├── package.json        ← Залежності
├── supabase_setup.sql  ← SQL для бази даних
├── api/
│   └── chat.js         ← Бекенд endpoint
└── lib/
    ├── pipeline.js     ← Головна логіка (тригери → сервіси → AI)
    ├── triggers.js     ← Розпізнавання типу запиту
    ├── services.js     ← Зовнішні API (погода, курси, новини)
    ├── cache.js        ← Кеш через Supabase
    └── memory.js       ← Пам'ять користувача
```

---

## Кроки для запуску

### 1. Supabase (база даних + авторизація)

1. Зайди на [supabase.com](https://supabase.com) → New project
2. Відкрий **SQL Editor** → вставте вміст `supabase_setup.sql` → **Run**
3. Іди в **Authentication → Settings** → вимкни "Confirm email" (для тестування)
4. Іди в **Settings → API** → скопіюй:
   - `Project URL`
   - `anon public` key

### 2. API ключі

| Сервіс | Де отримати | Безкоштовно |
|--------|------------|-------------|
| Gemini | [aistudio.google.com](https://aistudio.google.com) → Get API Key | ✅ |
| Groq   | [console.groq.com](https://console.groq.com) → API Keys | ✅ |
| NewsAPI | [newsapi.org](https://newsapi.org) → Get API Key | ✅ (100/день) |

### 3. index.html — вставити Supabase конфіг

Відкрий `index.html`, знайди:
```js
const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';
```
Заміни на свої значення з кроку 1.

### 4. GitHub → завантаж всі файли

1. Зайди на [github.com](https://github.com) → New repository → `qbob`
2. Завантаж всі файли зберігаючи структуру папок

### 5. Vercel → деплой

1. Зайди на [vercel.com](https://vercel.com) → Add New Project → імпортуй з GitHub
2. В **Environment Variables** додай:

```
GEMINI_API_KEY=твій_ключ
GROQ_API_KEY=твій_ключ
SUPABASE_URL=https://твій.supabase.co
SUPABASE_SERVICE_KEY=твій_service_role_key
NEWS_API_KEY=твій_ключ (опціонально)
```

> `SUPABASE_SERVICE_KEY` — це **service_role** ключ (НЕ anon), знайдеш в Settings → API

3. Натисни **Deploy** → готово!

### 6. Cloudflare (захист від DDoS)

1. Якщо є свій домен — підключи через [cloudflare.com](https://cloudflare.com)
2. Security → Bot Fight Mode → **ON**
3. Security → Rate Limiting → `/api/*` → макс 20 запитів за 1 хвилину

---

## Що вміє Qbob

- 🌤 **Погода** — реальні дані Open-Meteo (безкоштовно, без ключа)
- 💱 **Курси валют** — ExchangeRate API (безкоштовно, без ключа)
- 📰 **Новини** — DuckDuckGo / NewsAPI
- 🔍 **Пошук** — DuckDuckGo Instant Answer
- 📖 **Вікіпедія** — українська + англійська
- 🧠 **Gemini** → **Groq** (fallback якщо Gemini впав)
- 💾 **Пам'ять** — запам'ятовує ім'я, місто, вік, нотатки
- 🔐 **Авторизація** — Supabase Auth (email + пароль)
- 📊 **Ліміти** — 30 запитів/день, гарантовано 10, скидання опівночі
- ⚡ **Кеш** — погода 30хв, курси 1год, новини 15хв

---

## Локальне тестування

Встанови [Vercel CLI](https://vercel.com/docs/cli):
```bash
npm i -g vercel
vercel dev
```

Або просто відкрий `index.html` в браузері — UI працює, але `/api/chat` потребує Vercel.

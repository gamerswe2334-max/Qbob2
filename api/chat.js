// api/chat.js
// Головний endpoint — приймає запити від фронтенду

import { createClient } from '@supabase/supabase-js';
import { runPipeline } from '../lib/pipeline.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_DAILY = 30;
const RATE_LIMIT_MS = 1500; // мін. інтервал між запитами (мс)
const lastRequest = new Map(); // userId → timestamp (in-memory, скидається при рестарті)

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { message, history = [], token, userKey } = req.body || {};

  // Базова валідація
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'invalid_message' });
  }
  if (!token) {
    return res.status(401).json({ error: 'no_token' });
  }
  if (message.trim().length === 0) {
    return res.status(400).json({ error: 'empty_message' });
  }

  // 1. Авторизація через Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  // 2. Rate limiting (захист від спаму)
  const lastTs = lastRequest.get(user.id);
  const now = Date.now();
  if (lastTs && now - lastTs < RATE_LIMIT_MS) {
    return res.status(429).json({ error: 'too_fast', retryAfter: RATE_LIMIT_MS });
  }
  lastRequest.set(user.id, now);

  // 3. Завантаження профілю і перевірка лімітів
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('usage_count, usage_date, style, lang, own_key_gemini, own_key_groq')
    .eq('id', user.id)
    .single();

  if (profileError) {
    // Профіль не знайдено — спробуємо створити
    await supabase.from('profiles').insert({ id: user.id }).catch(() => {});
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const usageToday = (profile?.usage_date === todayStr) ? (profile.usage_count || 0) : 0;

  // Свій ключ — ліміти не діють
  const hasOwnKey = !!(userKey?.gemini || profile?.own_key_gemini);

  if (!hasOwnKey && usageToday >= MAX_DAILY) {
    return res.status(429).json({ error: 'limit_exceeded' });
  }

  // 4. Вибір ключів: свій > з профілю > серверний
  const geminiKey = userKey?.gemini || profile?.own_key_gemini || process.env.GEMINI_API_KEY;
  const groqKey   = userKey?.groq   || profile?.own_key_groq   || process.env.GROQ_API_KEY;

  if (!geminiKey && !groqKey) {
    return res.status(500).json({ error: 'no_ai_keys' });
  }

  // 5. Запуск pipeline
  try {
    const reply = await runPipeline({
      message,
      history: Array.isArray(history) ? history.slice(-10) : [],
      userId: user.id,
      geminiKey,
      groqKey,
      style: profile?.style || 'friendly',
      lang:  profile?.lang  || 'auto',
      supabase
    });

    // 6. Оновлення лічильника (тільки якщо немає свого ключа)
    if (!hasOwnKey) {
      await supabase.from('profiles').upsert({
        id: user.id,
        usage_count: usageToday + 1,
        usage_date: todayStr
      }, { onConflict: 'id' });
    }

    return res.status(200).json({
      reply,
      usage: hasOwnKey ? null : usageToday + 1,
      limit: MAX_DAILY
    });

  } catch (err) {
    console.error('[Qbob] Pipeline error:', err.message);

    const errorMap = {
      'both_models_failed': [503, 'both_models_failed'],
      'service_timeout':    [200, 'service_timeout'], // не критично — мозок відповів
    };

    const [status, code] = errorMap[err.message] || [500, 'pipeline_failed'];
    return res.status(status).json({ error: code });
  }
}

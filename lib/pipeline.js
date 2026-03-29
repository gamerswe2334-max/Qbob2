// lib/pipeline.js
// Головна логіка Qbob: тригери → кеш → сервіси → мозок

import { detectTrigger } from './triggers.js';
import { callService } from './services.js';
import { checkCache, setCache } from './cache.js';
import { getMemory, maybeUpdateMemory } from './memory.js';

export async function runPipeline({ message, history, userId, geminiKey, groqKey, style, lang, supabase }) {

  // 1. Санітизація — обрізаємо і чистимо
  const clean = message.slice(0, 500).trim();

  // 2. Пам'ять користувача (паралельно з детекцією тригера)
  const [memory] = await Promise.all([
    getMemory(userId, supabase)
  ]);

  // 3. Детекція тригера (без AI — дуже швидко)
  const trigger = detectTrigger(clean);
  let serviceData = null;

  if (trigger) {
    // 4. Перевірка кешу
    const cacheKey = `${trigger.type}:${trigger.param}`;
    const cached = await checkCache(cacheKey, supabase);

    if (cached) {
      serviceData = cached;
    } else {
      // 5. Виклик сервісу з таймаутом 5 сек
      try {
        serviceData = await Promise.race([
          callService(trigger),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error('service_timeout')), 5000)
          )
        ]);
        // Якщо є дані — кешуємо
        if (serviceData) {
          await setCache(cacheKey, serviceData, trigger.ttl, supabase);
        }
      } catch (e) {
        // Сервіс не відповів — мозок відповість зі своїх знань
        serviceData = null;
      }
    }
  }

  // 6. Будуємо системний промт
  const systemPrompt = buildSystemPrompt(style, lang, memory, serviceData, trigger);

  // 7. Виклик мозку з fallback Gemini → Groq
  const reply = await callBrain(clean, history, systemPrompt, geminiKey, groqKey);

  // 8. Оновлюємо пам'ять асинхронно (не блокуємо відповідь)
  maybeUpdateMemory(clean, userId, supabase).catch(() => {});

  return reply;
}

// ── Системний промт ──────────────────────────
function buildSystemPrompt(style, lang, memory, serviceData, trigger) {
  const styles = {
    friendly: 'Ти Qbob — дружній, теплий асистент. Говори природно, як друг. Де доречно — з легким гумором.',
    neutral:  'Ти Qbob — чіткий і нейтральний асистент. Відповідай по суті, без зайвих слів.',
    pro:      'Ти Qbob — професійний асистент. Структуровані, точні відповіді з деталями.'
  };

  const langInstr =
    lang === 'uk' ? 'Завжди відповідай ТІЛЬКИ українською мовою.' :
    lang === 'en' ? 'Always reply ONLY in English.' :
    'Відповідай мовою користувача. Якщо пише українською — відповідай українською.';

  const memoryStr = memory.length
    ? '\n\nВідомо про користувача (використовуй природно, не перераховуй):\n' +
      memory.map(m => `• ${m.key}: ${m.value}`).join('\n')
    : '';

  const dataStr = serviceData
    ? `\n\nАктуальні дані з сервісу (${trigger?.type}):\n${JSON.stringify(serviceData, null, 2)}\n` +
      'Використай ці дані у відповіді. Подай їх зрозуміло, не як JSON.'
    : trigger
    ? `\n\nСервіс "${trigger.type}" зараз недоступний. Відповідай зі своїх знань і чесно вкажи що дані можуть бути неточними.`
    : '';

  return `${styles[style] || styles.friendly}

ОБОВ'ЯЗКОВІ ПРАВИЛА:
- Ти ЗАВЖДИ Qbob. Ніколи не кажи що ти Gemini, Groq, Claude чи будь-яка інша модель.
- Якщо питають яка ти модель — кажи "Я Qbob, власна розробка."
- Технічні помилки НІКОЛИ не показуй. Перефразуй людською мовою.
- Не вигадуй факти. Якщо не знаєш — кажи чесно.
- Відповіді мають бути корисними і по суті. Не розтягуй без потреби.
${langInstr}${memoryStr}${dataStr}`;
}

// ── Мозок з fallback ─────────────────────────
async function callBrain(message, history, systemPrompt, geminiKey, groqKey) {
  // Спочатку Gemini
  try {
    return await callGemini(message, history, systemPrompt, geminiKey);
  } catch (e) {
    console.warn('[Qbob] Gemini failed:', e.message, '— switching to Groq');
  }

  // Fallback — Groq
  try {
    return await callGroq(message, history, systemPrompt, groqKey);
  } catch (e) {
    console.error('[Qbob] Groq also failed:', e.message);
    throw new Error('both_models_failed');
  }
}

async function callGemini(message, history, systemPrompt, apiKey) {
  // Конвертуємо history у формат Gemini
  const contents = [
    ...history.slice(-10).map(m => ({
      role: m.role === 'bot' ? 'model' : 'user',
      parts: [{ text: m.text }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
          topP: 0.9
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini empty response');
  return text;
}

async function callGroq(message, history, systemPrompt, apiKey) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(m => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text
    })),
    { role: 'user', content: message }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages,
      max_tokens: 1024,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq ${res.status}: ${err.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq empty response');
  return text;
}

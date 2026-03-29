// lib/memory.js
// Довгострокова пам'ять користувача

// Що Qbob завжди запам'ятовує автоматично
const MEMORY_PATTERNS = [
  { pattern: /(?:мене звати|я -|моє ім'я)\s+([А-ЯA-Zа-яa-z]+)/i, key: 'name' },
  { pattern: /(?:я живу в|я з|я з міста?)\s+([А-ЯA-Zа-яa-z\-]+)/i, key: 'city' },
  { pattern: /мені\s+(\d+)\s+рок/i, key: 'age' },
  { pattern: /я\s+(?:працюю|студент|вчусь|розробник|дизайнер|лікар|вчитель)/i, key: 'occupation' },
];

export async function getMemory(userId, supabase) {
  try {
    const { data } = await supabase
      .from('memory')
      .select('key, value')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  } catch {
    return [];
  }
}

export async function maybeUpdateMemory(message, userId, supabase) {
  const updates = [];

  // Явна команда "запам'ятай"
  if (/запам.ятай/i.test(message)) {
    const note = message.replace(/запам.ятай/i, '').trim();
    if (note) updates.push({ key: 'note_' + Date.now(), value: note });
  }

  // Автоматичне розпізнавання
  for (const p of MEMORY_PATTERNS) {
    const m = message.match(p.pattern);
    if (m && m[1]) {
      updates.push({ key: p.key, value: m[1] });
    }
  }

  if (!updates.length) return;

  for (const u of updates) {
    try {
      // Для нотаток — insert, для решти — upsert (перезаписуємо)
      if (u.key.startsWith('note_')) {
        await supabase.from('memory').insert({ user_id: userId, ...u });
      } else {
        await supabase.from('memory')
          .upsert({ user_id: userId, ...u }, { onConflict: 'user_id,key' });
      }
    } catch {}
  }
}

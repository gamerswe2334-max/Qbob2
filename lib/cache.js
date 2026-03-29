// lib/cache.js
// Кеш через Supabase (таблиця cache)

export async function checkCache(key, supabase) {
  try {
    const { data, error } = await supabase
      .from('cache')
      .select('value, expires_at')
      .eq('key', key)
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      // Протух — видаляємо асинхронно, не блокуємо
      supabase.from('cache').delete().eq('key', key).then(() => {});
      return null;
    }

    return data.value;
  } catch {
    return null;
  }
}

export async function setCache(key, value, ttlSeconds, supabase) {
  try {
    const expires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    await supabase
      .from('cache')
      .upsert({ key, value, expires_at: expires }, { onConflict: 'key' });
  } catch {
    // Не критично — продовжуємо без кешу
  }
}

// Чистимо старі записи (виклик раз на день достатньо)
export async function cleanCache(supabase) {
  try {
    await supabase
      .from('cache')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch {}
}

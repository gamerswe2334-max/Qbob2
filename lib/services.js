// lib/services.js
// Зовнішні API: погода, валюта, новини, пошук, вікіпедія

export async function callService(trigger) {
  switch (trigger.type) {
    case 'weather':  return fetchWeather(trigger.param);
    case 'exchange': return fetchExchange(trigger.param);
    case 'news':     return fetchNews();
    case 'search':   return fetchSearch(trigger.param);
    case 'wiki':     return fetchWiki(trigger.param);
    default:         return null;
  }
}

async function fetchWeather(city) {
  // Геокодування міста
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=uk&format=json`
  );
  const geo = await geoRes.json();
  if (!geo.results?.length) throw new Error(`Місто "${city}" не знайдено`);

  const { latitude, longitude, name, country } = geo.results[0];

  // Погода
  const wRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relative_humidity_2m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=3`
  );
  const w = await wRes.json();

  const codes = {
    0:'ясно',1:'переважно ясно',2:'частково хмарно',3:'хмарно',
    45:'туман',48:'крижаний туман',51:'мряка',53:'помірна мряка',55:'густа мряка',
    61:'невеликий дощ',63:'помірний дощ',65:'сильний дощ',
    71:'невеликий сніг',73:'помірний сніг',75:'сильний сніг',
    80:'зливи',81:'помірні зливи',82:'сильні зливи',
    95:'гроза',96:'гроза з градом',99:'сильна гроза з градом'
  };

  const cur = w.current;
  return {
    city: name, country,
    temp: Math.round(cur.temperature_2m),
    feels: Math.round(cur.apparent_temperature),
    desc: codes[cur.weathercode] || 'невідомо',
    wind: Math.round(cur.windspeed_10m),
    humidity: cur.relative_humidity_2m,
    forecast: w.daily?.time?.slice(0,3).map((d, i) => ({
      date: d,
      max: Math.round(w.daily.temperature_2m_max[i]),
      min: Math.round(w.daily.temperature_2m_min[i]),
      desc: codes[w.daily.weathercode[i]] || ''
    })) || []
  };
}

async function fetchExchange(currency) {
  // ExchangeRate-API (безкоштовно без ключа)
  const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
  const data = await res.json();
  if (data.result !== 'success') throw new Error('Exchange API error');

  const uahRate = data.rates['UAH'];
  const targetRate = data.rates[currency];

  return {
    base: 'UAH',
    currency,
    rate: (uahRate / targetRate).toFixed(4),
    usdToUah: uahRate.toFixed(2),
    updated: data.time_last_update_utc
  };
}

async function fetchNews() {
  // DuckDuckGo news (без ключа)
  const res = await fetch(
    `https://api.duckduckgo.com/?q=ukraine+news&format=json&no_html=1&skip_disambig=1`
  );
  const data = await res.json();
  const topics = (data.RelatedTopics || []).slice(0, 5).map(t => ({
    title: t.Text?.slice(0, 120) || '',
    url: t.FirstURL || ''
  })).filter(t => t.title);
  return { topics, source: 'DuckDuckGo' };
}

async function fetchSearch(query) {
  if (!query) return null;
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  );
  const data = await res.json();
  return {
    abstract: data.Abstract || '',
    source: data.AbstractSource || '',
    url: data.AbstractURL || '',
    answer: data.Answer || '',
    related: (data.RelatedTopics || []).slice(0,3).map(t => t.Text).filter(Boolean)
  };
}

async function fetchWiki(query) {
  if (!query) return null;
  // Спочатку пробуємо українську
  try {
    const res = await fetch(
      `https://uk.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
    );
    if (res.ok) {
      const d = await res.json();
      return { title: d.title, extract: d.extract?.slice(0, 600), lang: 'uk' };
    }
  } catch {}
  // Fallback — англійська
  const res = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`
  );
  const d = await res.json();
  return { title: d.title, extract: d.extract?.slice(0, 600), lang: 'en' };
}

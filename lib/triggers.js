// lib/triggers.js
// Рівень 1: швидке розпізнавання без AI

const TRIGGERS = [
  {
    keywords: ['погода','дощ','сніг','температура','прогноз','хмарно','сонячно','мороз'],
    type: 'weather',
    ttl: 1800 // 30 хв
  },
  {
    keywords: ['курс','долар','євро','фунт','злотий','валюта','гривня','обмін'],
    type: 'exchange',
    ttl: 3600 // 1 год
  },
  {
    keywords: ['новини','що сталось','що трапилось','останні події','breaking'],
    type: 'news',
    ttl: 900 // 15 хв
  },
  {
    keywords: ['знайди','пошук','що таке','хто такий','розкажи про','info про'],
    type: 'search',
    ttl: 86400 // 24 год
  },
  {
    keywords: ['wikipedia','вікіпедія','wiki'],
    type: 'wiki',
    ttl: 86400
  }
];

export function detectTrigger(message) {
  const lower = message.toLowerCase();
  for (const t of TRIGGERS) {
    if (t.keywords.some(k => lower.includes(k))) {
      return {
        type: t.type,
        param: extractParam(message, t.type),
        ttl: t.ttl
      };
    }
  }
  return null;
}

function extractParam(message, type) {
  if (type === 'weather') {
    const m = message.match(/(?:в|у|для)\s+([А-ЯA-Zа-яa-z\-]+)/i);
    return m ? m[1] : 'Київ';
  }
  if (type === 'exchange') {
    const m = message.match(/(долар|євро|фунт|злотий|usd|eur|gbp|pln)/i);
    const map = { 'долар':'USD','usd':'USD','євро':'EUR','eur':'EUR','фунт':'GBP','gbp':'GBP','злотий':'PLN','pln':'PLN' };
    return map[(m?.[1] || 'долар').toLowerCase()] || 'USD';
  }
  if (type === 'search' || type === 'wiki') {
    return message.replace(/знайди|що таке|хто такий|розкажи про|wiki|wikipedia|вікіпедія|пошук/gi, '').trim().slice(0, 100);
  }
  return message.slice(0, 100);
}

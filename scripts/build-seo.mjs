// Генерация статических страниц под каждую одобренную точку и карты сайта.
//
// Зачем: сайт — одностраничная карта, весь контент рисует JS, поэтому в индекс
// попадает единственная пустая страница. Здесь мы раскладываем по /d/<id>/
// настоящие HTML-страницы с фото, описанием и разметкой Schema.org, а ссылка
// «смотреть на карте» ведёт в приложение.
//
// Запуск: npm run seo

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'd');
const SITE = 'https://textula.ru';

const SUPABASE_URL = 'https://yzvigrtnwmkwkpmqmdzh.supabase.co';
const SUPABASE_KEY = 'sb_publishable__AIRJSDqAYUK_vxwYhXmRA_4-QzSKkR';

const CATEGORIES = {
  texture: 'Текстура',
  sign: 'Знак',
  art: 'Арт',
  detail: 'Деталь',
  other: 'Другое'
};

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Разметка Schema.org внутри <script>. JSON.stringify не трогает "</script>",
// поэтому находка с таким названием разорвала бы блок, и её текст выполнился бы
// как код на нашей странице. Экранируем "<" — на разбор JSON это не влияет.
function jsonLdBlock(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Дату считаем по Туле, а не по часовому поясу машины. Генератор запускается
// и локально, и в GitHub Actions по UTC, и раньше находка, добавленная поздно
// вечером, меняла дату туда-сюда при каждой пересборке.
const TIMEZONE = 'Europe/Moscow';

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';

  const parts = {};
  for (const p of new Intl.DateTimeFormat('ru-RU', {
    timeZone: TIMEZONE, day: 'numeric', month: 'numeric', year: 'numeric'
  }).formatToParts(d)) parts[p.type] = p.value;

  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

function categoryLabels(category) {
  return String(category || 'other')
    .split(',')
    .map(c => CATEGORIES[c.trim()] || CATEGORIES.other);
}

// Описание для поисковой выдачи: осмысленный текст вместо обрезанного HTML.
function metaDescription(detail) {
  const parts = [];
  if (detail.description) parts.push(detail.description.trim());
  parts.push(`${categoryLabels(detail.category).join(', ')} на карте деталей Тулы`);
  if (detail.author) parts.push(`Нашёл: ${detail.author}`);

  let text = parts.join('. ').replace(/\s+/g, ' ').replace(/\.\./g, '.');
  if (text.length > 300) text = text.slice(0, 297).trimEnd() + '…';
  return text;
}

function pageHtml(detail) {
  const title = detail.title || 'Деталь города';
  const url = `${SITE}/d/${detail.id}/`;
  const mapUrl = `${SITE}/?d=${encodeURIComponent(detail.id)}`;
  const image = detail.photo_url || `${SITE}/assets/og-image.png`;
  const description = metaDescription(detail);
  const cats = categoryLabels(detail.category);
  const date = formatDate(detail.created_at);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': detail.photo_url ? 'Photograph' : 'CreativeWork',
    name: title,
    description: detail.description || description,
    url,
    ...(detail.photo_url ? { image: detail.photo_url } : {}),
    ...(detail.created_at ? { dateCreated: detail.created_at } : {}),
    ...(detail.author ? { author: { '@type': 'Person', name: detail.author } } : {}),
    keywords: cats.join(', '),
    contentLocation: {
      '@type': 'Place',
      name: 'Тула',
      geo: { '@type': 'GeoCoordinates', latitude: detail.lat, longitude: detail.lng }
    },
    isPartOf: { '@type': 'WebSite', name: 'textula — детали города', url: SITE + '/' }
  };

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Детали города', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: title, item: url }
    ]
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — textula, детали города</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/assets/favicon.png" sizes="32x32">
<meta name="theme-color" content="#ffffff">

<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)} — textula">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="textula — детали города">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)} — textula">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">

<script type="application/ld+json">${jsonLdBlock(jsonLd)}</script>
<script type="application/ld+json">${jsonLdBlock(breadcrumbs)}</script>

<link rel="stylesheet" href="/vendor/fonts/fonts.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Source Serif 4', Georgia, serif;
    background: #fff;
    color: #000;
    line-height: 1.6;
  }
  header {
    border-bottom: 1px solid #000;
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
  }
  header a.logo { font-weight: 700; font-size: 16px; color: #000; text-decoration: none; letter-spacing: -0.02em; }
  header a.logo span { font-weight: 400; font-style: italic; color: #666; }
  header a.map-link {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: #000;
    text-decoration: none;
    border-bottom: 1px solid #000;
    white-space: nowrap;
  }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 32px; letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 12px; }
  .meta {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
    margin-bottom: 24px;
  }
  .meta .tag { border: 1px solid #000; color: #000; padding: 2px 8px; margin-right: 6px; display: inline-block; }
  img.photo {
    max-width: 100%;
    max-height: 75vh;
    width: auto;
    height: auto;
    border: 1px solid #000;
    display: block;
    margin: 0 auto 24px;
  }
  p.description { font-size: 17px; margin-bottom: 28px; }
  .cta {
    display: inline-block;
    background: #000;
    color: #fff;
    text-decoration: none;
    padding: 14px 28px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .cta:hover { background: #333; }
  footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: #999;
  }
  footer a { color: #666; }
  @media (max-width: 600px) { h1 { font-size: 24px; } main { padding: 24px 16px 48px; } }
</style>
</head>
<body>
  <header>
    <a class="logo" href="/">textula <span>— детали города</span></a>
    <a class="map-link" href="/">Вся карта →</a>
  </header>

  <main>
    <article>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        ${cats.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}
        ${detail.author ? escapeHtml(detail.author) + ' · ' : ''}${escapeHtml(date)}
      </div>
      ${detail.photo_url ? `<img class="photo" src="${escapeHtml(detail.photo_url)}" alt="${escapeHtml(title)} — деталь города в Туле" loading="lazy">` : ''}
      ${detail.description ? `<p class="description">${escapeHtml(detail.description)}</p>` : ''}
      <a class="cta" href="${escapeHtml(mapUrl)}">Смотреть на карте</a>
    </article>

    <footer>
      Проект визуального исследования Тулы через детали.
      <a href="/">Карта</a> · <a href="/d/">Все находки списком</a> ·
      <a href="/privacy.html">Политика конфиденциальности</a>
    </footer>
  </main>
</body>
</html>
`;
}

// Список всех находок: без него страницы точек — «сироты», на которые ведёт
// только карта сайта, а внутренние ссылки для индексации важнее.
function indexHtml(details) {
  const url = SITE + '/d/';
  const description = `Все ${details.length} находок проекта textula: фактуры стен, старинные ` +
    'вывески, узоры решёток и другие детали Тулы.';

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Детали города — все находки',
    numberOfItems: details.length,
    itemListElement: details.map((d, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/d/${d.id}/`,
      name: d.title
    }))
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Все находки — textula, детали города</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/assets/favicon.png" sizes="32x32">
<meta property="og:type" content="website">
<meta property="og:title" content="Все находки — textula">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${SITE}/assets/og-image.png">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ru_RU">
<script type="application/ld+json">${jsonLdBlock(itemList)}</script>
<link rel="stylesheet" href="/vendor/fonts/fonts.css">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Source Serif 4', Georgia, serif; background: #fff; color: #000; line-height: 1.6; }
  header {
    border-bottom: 1px solid #000; padding: 12px 20px;
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
  }
  header a.logo { font-weight: 700; font-size: 16px; color: #000; text-decoration: none; letter-spacing: -0.02em; }
  header a.logo span { font-weight: 400; font-style: italic; color: #666; }
  header a.map-link {
    font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #000;
    text-decoration: none; border-bottom: 1px solid #000; white-space: nowrap;
  }
  main { max-width: 1000px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 28px; letter-spacing: -0.03em; margin-bottom: 8px; }
  .count {
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.05em; color: #666; margin-bottom: 28px;
  }
  ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
  li a { color: #000; text-decoration: none; display: block; }
  li a:hover .title { border-bottom: 1px solid #000; }
  .thumb { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border: 1px solid #000; display: block; margin-bottom: 8px; }
  .title { font-size: 16px; display: inline; }
  .sub {
    font-family: 'IBM Plex Mono', monospace; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.05em; color: #999; margin-top: 4px;
  }
  footer {
    margin-top: 48px; padding-top: 20px; border-top: 1px solid #ddd;
    font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #999;
  }
  footer a { color: #666; }
</style>
</head>
<body>
  <header>
    <a class="logo" href="/">textula <span>— детали города</span></a>
    <a class="map-link" href="/">Вся карта →</a>
  </header>
  <main>
    <h1>Все находки</h1>
    <div class="count">${details.length} деталей Тулы</div>
    <ul>
${details.map(d => `      <li>
        <a href="/d/${d.id}/">
          ${d.photo_url ? `<img class="thumb" src="${escapeHtml(d.thumb_url || d.photo_url)}" alt="${escapeHtml(d.title)}" loading="lazy">` : ''}
          <span class="title">${escapeHtml(d.title)}</span>
          <div class="sub">${escapeHtml(categoryLabels(d.category).join(' · '))}</div>
        </a>
      </li>`).join('\n')}
    </ul>
    <footer>
      <a href="/">Смотреть на карте</a> · <a href="/privacy.html">Политика конфиденциальности</a>
    </footer>
  </main>
</body>
</html>
`;
}

function sitemapXml(details) {
  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: SITE + '/', lastmod: today, changefreq: 'daily', priority: '1.0' },
    { loc: SITE + '/d/', lastmod: today, changefreq: 'weekly', priority: '0.8' },
    ...details.map(d => ({
      loc: `${SITE}/d/${d.id}/`,
      lastmod: (d.created_at || '').slice(0, 10) || today,
      changefreq: 'monthly',
      priority: '0.7'
    })),
    { loc: SITE + '/privacy.html', lastmod: today, changefreq: 'yearly', priority: '0.2' }
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

async function main() {
  const query = 'details?select=id,title,description,category,lat,lng,photo_url,thumb_url,author,created_at' +
    '&status=eq.approved&order=created_at.desc';

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });

  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const details = (await res.json()).filter(d => d && d.id && d.title);
  if (!details.length) throw new Error('Supabase вернул пустой список — страницы не трогаем');

  // Полностью пересобираем каталог, чтобы удалённые точки не оставляли страниц.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  for (const detail of details) {
    const dir = path.join(OUT_DIR, detail.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(detail));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml(details));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml(details));

  console.log(`Готово: ${details.length} страниц точек, список /d/ и карта сайта`);
}

main().catch(err => {
  console.error('Не удалось собрать SEO-страницы:', err.message);
  process.exit(1);
});

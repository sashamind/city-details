// Страницы находок: разметка Schema.org должна оставаться разбираемой, а даты —
// не зависеть от часового пояса машины, которая запускала сборку.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const title = 'Страницы находок';
export const needsBrowser = false;

const PAGES_DIR = 'd';

export async function run({ check }) {
  const pages = fs.readdirSync(PAGES_DIR)
    .map((name) => path.join(PAGES_DIR, name, 'index.html'))
    .filter((file) => fs.existsSync(file));

  check('страницы находок собраны', pages.length > 0, pages.length + ' страниц');

  let blocks = 0;
  const broken = [];
  for (const file of pages.concat([path.join(PAGES_DIR, 'index.html')])) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); blocks++; } catch { broken.push(file); }
    }
    // Разрыв блока — след незакрытой разметки в пользовательском тексте.
    if (/<\/script><script(?!\s+type="application\/ld)/.test(html)) broken.push(file + ' (разрыв)');
  }

  check('вся разметка Schema.org разбирается', broken.length === 0,
    blocks + ' блоков, проблемных ' + broken.length + (broken.length ? ': ' + broken[0] : ''));

  // Название с разметкой не должно закрывать блок.
  const generator = fs.readFileSync('scripts/build-seo.mjs', 'utf8');
  const body = generator.match(/function jsonLdBlock\(data\) \{([\s\S]*?)\n\}/);
  check('в генераторе есть экранирование разметки', !!body);
  if (body) {
    const jsonLdBlock = new Function('data', body[1]);
    const evil = 'Дверь</script><script>alert(1)</script>';
    const rendered = '<script type="application/ld+json">' + jsonLdBlock({ name: evil }) + '</script>';
    check('название с разметкой не разрывает блок', !rendered.includes('</script><script>'));
    check('текст при этом не искажается',
      JSON.parse(rendered.slice(rendered.indexOf('>') + 1, rendered.lastIndexOf('</script>'))).name === evil);
  }

  // Дата не должна зависеть от пояса, в котором запущена сборка.
  const inTimezone = (tz) => execFileSync(process.execPath, ['-e', `
    const fs = require('fs');
    const src = fs.readFileSync('scripts/build-seo.mjs', 'utf8');
    const months = eval('[' + src.match(/const MONTHS = \\[([\\s\\S]*?)\\];/)[1] + ']');
    const body = src.match(/function formatDate\\(iso\\) \\{([\\s\\S]*?)\\n\\}/)[1];
    const TIMEZONE = 'Europe/Moscow';
    const formatDate = new Function('iso', 'MONTHS', 'TIMEZONE', body);
    process.stdout.write(formatDate('2026-02-16T23:22:44Z', months, TIMEZONE));
  `], { env: { ...process.env, TZ: tz } }).toString();

  const utc = inTimezone('UTC');
  const moscow = inTimezone('Europe/Moscow');
  const newYork = inTimezone('America/New_York');
  check('дата одинакова в любом часовом поясе', utc === moscow && moscow === newYork,
    [utc, moscow, newYork].join(' / '));
  check('дата считается по Туле', moscow === '17 февраля 2026', moscow);
}

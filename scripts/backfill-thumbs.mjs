// Превью для фотографий, загруженных до появления этой функции.
//
// Новые снимки получают превью прямо в браузере при отправке (см. uploadPhoto в
// app.js). Этот скрипт добирает старые: скачивает оригинал, уменьшает его через
// системный sips, кладёт копию в photos/thumbs/ и пишет миграцию, которая
// проставит thumb_url в базе (анонимный ключ менять записи не может — это и
// правильно, поэтому обновление идёт через supabase db push).
//
// Запуск:
//   node scripts/backfill-thumbs.mjs
//   supabase db push

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = 'https://yzvigrtnwmkwkpmqmdzh.supabase.co';
const SUPABASE_KEY = 'sb_publishable__AIRJSDqAYUK_vxwYhXmRA_4-QzSKkR';
const BUCKET = 'photos';
const THUMB_WIDTH = 480;
const THUMB_QUALITY = 60;

const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

async function rest(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Имя файла внутри бакета из публичного адреса.
function objectName(url) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = String(url || '').indexOf(marker);
  if (i === -1) return null;
  const name = url.slice(i + marker.length).split('?')[0];
  return name ? decodeURIComponent(name) : null;
}

async function uploadThumb(name, filePath) {
  const body = fs.readFileSync(filePath);
  const target = `thumbs/${name}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${target.split('/').map(encodeURIComponent).join('/')}`;

  let res = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body });

  // файл уже лежит с прошлого запуска — перезаписываем
  if (res.status === 409) {
    res = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body });
  }

  if (!res.ok) throw new Error(`Upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${target}`;
}

async function processRow(table, row, tmpDir) {
  const name = objectName(row.photo_url);
  if (!name) return { skipped: 'адрес не из нашего бакета' };

  const original = path.join(tmpDir, 'src_' + path.basename(name));
  const thumb = path.join(tmpDir, 'thumb_' + path.basename(name).replace(/\.[^.]+$/, '') + '.jpg');

  const res = await fetch(row.photo_url);
  if (!res.ok) return { skipped: `оригинал недоступен (${res.status})` };
  fs.writeFileSync(original, Buffer.from(await res.arrayBuffer()));

  try {
    execFileSync('sips', ['-Z', String(THUMB_WIDTH), '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(THUMB_QUALITY), original, '--out', thumb], { stdio: 'ignore' });
  } catch (e) {
    return { skipped: 'sips не смог обработать файл' };
  }

  const before = fs.statSync(original).size;
  const after = fs.statSync(thumb).size;

  // если «превью» не легче оригинала, смысла в нём нет
  if (after >= before) return { skipped: 'превью не меньше оригинала' };

  const thumbUrl = await uploadThumb(name, thumb);
  fs.rmSync(original, { force: true });
  fs.rmSync(thumb, { force: true });

  return { table, id: row.id, thumbUrl, before, after };
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbs-'));

  const targets = [
    { table: 'details', rows: await rest('details?select=id,photo_url,thumb_url') },
    { table: 'photos', rows: await rest('photos?select=id,photo_url,thumb_url') }
  ];

  const done = [];
  let savedBefore = 0, savedAfter = 0;

  for (const { table, rows } of targets) {
    const pending = rows.filter(r => r.photo_url && !r.thumb_url);
    console.log(`${table}: ${pending.length} без превью (всего ${rows.length})`);

    for (const row of pending) {
      try {
        const result = await processRow(table, row, tmpDir);
        if (result.skipped) {
          console.log(`  пропуск ${row.id}: ${result.skipped}`);
          continue;
        }
        done.push(result);
        savedBefore += result.before;
        savedAfter += result.after;
        process.stdout.write(`  ${done.length}. ${Math.round(result.before / 1024)} КБ → ${Math.round(result.after / 1024)} КБ\n`);
      } catch (e) {
        console.log(`  ошибка ${row.id}: ${e.message}`);
      }
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (!done.length) {
    console.log('\nНечего обновлять — превью уже есть у всех.');
    return;
  }

  // Метка должна быть строго позже уже существующих миграций, иначе supabase
  // откажется применять файл «из прошлого».
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const latest = fs.readdirSync(dir)
    .map(f => f.slice(0, 14))
    .filter(s => /^\d{14}$/.test(s))
    .sort()
    .pop() || '';

  const now = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const stamp = now > latest ? now : String(BigInt(latest) + 1n);
  const file = path.join(dir, `${stamp}_thumb_urls.sql`);

  const sql = [
    '-- Адреса превью для фотографий, загруженных до появления превью.',
    '-- Сгенерировано scripts/backfill-thumbs.mjs: сами файлы уже лежат в бакете,',
    '-- здесь только проставляются ссылки на них.',
    '',
    ...done.map(r =>
      `update public.${r.table} set thumb_url = '${r.thumbUrl.replace(/'/g, "''")}' ` +
      `where id = '${String(r.id).replace(/'/g, "''")}' and thumb_url = '';`)
  ].join('\n') + '\n';

  fs.writeFileSync(file, sql);

  console.log(`\nГотово: ${done.length} превью.`);
  console.log(`Было ${(savedBefore / 1048576).toFixed(1)} МБ → стало ${(savedAfter / 1048576).toFixed(1)} МБ ` +
    `(в ${(savedBefore / savedAfter).toFixed(1)} раза меньше).`);
  console.log(`Миграция: ${path.relative(ROOT, file)} — примените её через supabase db push`);
}

main().catch(err => {
  console.error('Не удалось собрать превью:', err.message);
  process.exit(1);
});

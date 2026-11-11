"""Find unreviewed approved photos without downloading images or changing the registry.

Use --input all-sources.json for an offline check. Without --input, query the
public Supabase API, including additional approved photos. Requires only Python.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent


def normalize(row):
    return {
        'source_id': row.get('detail_id') or row.get('source_id') or row.get('id'),
        'photo_id': row.get('id') if row.get('detail_id') else None,
        'title': row.get('title', ''),
        'photo_url': row.get('photo_url') or row.get('url'),
    }


def find_new(rows, registry):
    processed = {p['photo_url']: p for p in registry['photos']}
    source_ids = {p['source_id'] for p in registry['photos']}
    seen = set()
    pending = []
    for row in rows:
        photo = normalize(row)
        url = photo['photo_url']
        if not url or url in seen:
            continue
        seen.add(url)
        previous = processed.get(url)
        if previous:
            # When a local snapshot supplies a hash, also catch replaced bytes
            # under an unchanged URL. A remote URL check alone cannot do that.
            if not row.get('sha256') or row['sha256'] == previous['sha256']:
                continue
            photo['reason'] = 'changed_content'
        else:
            photo['reason'] = 'new_photo'
            if not photo['photo_id'] and photo['source_id'] in source_ids:
                photo['reason'] = 'replaced_cover'
        pending.append(photo)
    return pending


def fetch_public():
    app = (ROOT.parents[1] / 'app.js').read_text()
    base = re.search(r"var SUPABASE_URL = '([^']+)'", app)[1]
    key = re.search(r"var SUPABASE_KEY = '([^']+)'", app)[1]

    def table(name, fields):
        result = []
        offset = 0
        while True:
            url = (f'{base}/rest/v1/{name}?select={fields}'
                   f'&status=eq.approved&order=id.asc&limit=1000&offset={offset}')
            response = subprocess.run(
                ['curl', '--http1.1', '-fLsS', '--max-time', '60', url,
                 '-H', 'apikey: ' + key], capture_output=True, text=True, check=True)
            page = json.loads(response.stdout)
            result.extend(page)
            if len(page) < 1000:
                return result
            offset += len(page)

    covers = table('details', 'id,title,photo_url')
    titles = {p['id']: p['title'] for p in covers}
    extras = table('photos', 'id,detail_id,photo_url')
    for photo in extras:
        photo['title'] = titles.get(photo['detail_id'], 'Дополнительная фотография')
    return covers + extras


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='JSON snapshot instead of the public API')
    parser.add_argument('--output', type=Path, default=ROOT / 'pending-photos.json')
    args = parser.parse_args()
    registry = json.loads((ROOT / 'processed-photos.json').read_text())
    rows = json.loads(args.input.read_text()) if args.input else fetch_public()
    pending = find_new(rows, registry)
    args.output.write_text(json.dumps({'photos': pending}, ensure_ascii=False, indent=2) + '\n')
    print(f'Проверено ссылок: {len(rows)}. Новых/изменённых фотографий: {len(pending)}.')
    print(f'Очередь: {args.output}')
    print('Реестр обработанных фотографий не изменён.')


if __name__ == '__main__':
    main()

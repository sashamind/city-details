"""Persistent local edits. Original photographs and crops are never removed."""
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone
import copy
import hashlib
import json
import threading
import zipfile


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


class ConflictError(Exception):
    pass


class CollectionEditor:
    def __init__(self, root):
        self.root = Path(root)
        self.lock = threading.Lock()
        baseline = self.root / 'manifest-base.json'
        if not baseline.exists():
            write_json(baseline, json.loads((self.root / 'manifest-all.json').read_text()))
        if not (self.root / 'editor-edits.json').exists():
            write_json(self.root / 'editor-edits.json', {'schema_version': 1, 'revision': 0, 'edits': {}})

    def original(self):
        return json.loads((self.root / 'manifest-base.json').read_text())

    def document(self):
        return json.loads((self.root / 'editor-edits.json').read_text())

    def state(self):
        return {'document': self.document(), 'original': self.original(),
                'manifest': json.loads((self.root / 'manifest-all.json').read_text())}

    def validate(self, original, patch):
        if not isinstance(patch, dict) or set(patch) != {'character', 'alphabet', 'box', 'hidden'}:
            raise ValueError('Нужны поля character, alphabet, box, hidden.')
        ch, alphabet, box = patch['character'], patch['alphabet'], patch['box']
        if not isinstance(ch, str) or len(ch) != 1 or not ch.isalpha():
            raise ValueError('Укажите ровно одну букву.')
        if alphabet not in ('cyrillic', 'latin'):
            raise ValueError('Неизвестный алфавит.')
        if alphabet == 'cyrillic' and not ('\u0400' <= ch <= '\u04ff'):
            raise ValueError('Для кириллицы укажите кириллическую букву.')
        if alphabet == 'latin' and not ('A' <= ch.upper() <= 'Z' or '\u00c0' <= ch <= '\u024f'):
            raise ValueError('Для латиницы укажите латинскую букву.')
        if type(patch['hidden']) is not bool:
            raise ValueError('hidden должен быть логическим значением.')
        if not isinstance(box, list) or len(box) != 4 or any(type(v) is not int for v in box):
            raise ValueError('Координаты должны быть четырьмя целыми числами.')
        x, y, right, bottom = box
        w, h = original['source_size']
        if not (0 <= x < right <= w and 0 <= y < bottom <= h):
            raise ValueError('Рамка должна находиться внутри фотографии и иметь ненулевой размер.')

    def save(self, crop_id, patch, revision):
        with self.lock:
            document = self.document()
            if type(revision) is not int or revision != document['revision']:
                raise ConflictError('Коллекция изменена в другой вкладке. Обновите страницу перед сохранением.')
            original = next((m for m in self.original() if m['id'] == crop_id), None)
            if original is None:
                raise ValueError('Вариант не найден.')
            self.validate(original, patch)
            updated = copy.deepcopy(document)
            updated['revision'] += 1
            updated['edits'][crop_id] = {**patch, 'updated_at': datetime.now(timezone.utc).isoformat()}
            # Generate the crop and collection before acknowledging a saved edit.
            self.materialize(updated)
            write_json(self.root / 'editor-edits.json', updated)
            history = self.root / 'editor-history.jsonl'
            with history.open('a') as log:
                log.write(json.dumps({'revision': updated['revision'], 'id': crop_id,
                                      'before': document['edits'].get(crop_id),
                                      'after': updated['edits'][crop_id]}, ensure_ascii=False) + '\n')
            return self.state()

    def materialize(self, document=None, baseline=None):
        document = document if document is not None else self.document()
        baseline = baseline if baseline is not None else self.original()
        manifest = []
        for original in baseline:
            m = copy.deepcopy(original)
            patch = document['edits'].get(m['id'])
            m['hidden'] = False
            if patch:
                self.validate(original, {k: patch[k] for k in ('character', 'alphabet', 'box', 'hidden')})
                for k in ('character', 'alphabet', 'box', 'hidden'):
                    m[k] = patch[k]
                m['letter'] = m['character'].upper()
                m['case'] = 'lower' if m['character'].islower() else 'upper'
                m['edited_at'] = patch['updated_at']
                if m['box'] != original['box']:
                    from PIL import Image, ImageOps
                    # A new filename preserves the initial crop and avoids stale browser cache.
                    digest = hashlib.sha256(json.dumps(m['box']).encode()).hexdigest()[:12]
                    target = self.root / 'edited' / f"{m['id']}-{digest}.png"
                    target.parent.mkdir(exist_ok=True)
                    if not target.exists():
                        with Image.open(self.root / m['source_file']) as image:
                            image = ImageOps.exif_transpose(image)
                            if list(image.size) != m['source_size']:
                                raise ValueError('Размер исходной фотографии изменился. Нужна повторная проверка.')
                            image.crop(m['box']).save(target)
                    m['file'] = str(target.relative_to(self.root))
            manifest.append(m)
        active = [m for m in manifest if not m['hidden']]
        counts = Counter(m['source_id'] for m in active)
        reviews = json.loads((self.root / 'review.json').read_text())
        for source in reviews:
            source['crop_count'] = counts[source['id']]
        summary = {
            'sources_reviewed': len(reviews), 'sources_with_crops': len(counts),
            'crops': len(active), 'hidden_crops': len(manifest) - len(active),
            'cyrillic_letters': sorted({m['letter'] for m in active if m['alphabet'] == 'cyrillic'}),
            'latin_letters': sorted({m['letter'] for m in active if m['alphabet'] == 'latin'}),
        }
        summary['missing_cyrillic'] = [ch for ch in 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' if ch not in summary['cyrillic_letters']]
        # Build the archive in memory first; an error leaves the previous archive intact.
        import io
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            entries = []
            for m in active:
                dest = f"{m['alphabet']}/{m['letter']}/{Path(m['file']).name}"
                z.write(self.root / m['file'], dest)
                entries.append({**m, 'file': dest})
            for name, content in [('manifest-all.json', entries), ('review.json', reviews),
                                  ('summary.json', summary), ('editor-edits.json', document)]:
                z.writestr(name, json.dumps(content, ensure_ascii=False, indent=2))
        (self.root / 'collection.zip').write_bytes(archive.getvalue())
        write_json(self.root / 'manifest-all.json', manifest)
        write_json(self.root / 'summary.json', summary)
        write_json(self.root / 'review.json', reviews)
        from build_letter_quality import build as build_quality
        build_quality(self.root)
        if baseline is not None:
            write_json(self.root / 'manifest-base.json', baseline)
        return manifest

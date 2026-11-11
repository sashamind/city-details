"""Create lightweight WebP display copies. Keep original crops unchanged."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent


def build(root=ROOT):
    root = Path(root)
    manifest = json.loads((root / 'manifest-all.json').read_text())
    output = root / 'previews'
    output.mkdir(exist_ok=True)
    files = {}
    source_bytes = 0
    preview_bytes = 0
    for m in manifest:
        if m.get('hidden'):
            continue
        source = root / m['file']
        content = source.read_bytes()
        digest = hashlib.sha256(content).hexdigest()[:20]
        target = output / (digest + '.webp')
        if not target.exists():
            with Image.open(source) as image:
                image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
                image.save(target, 'WEBP', quality=90, method=6)
        files[m['file']] = str(target.relative_to(root))
        source_bytes += len(content)
        preview_bytes += target.stat().st_size
    result = {'schema_version': 1, 'files': files, 'source_bytes': source_bytes, 'preview_bytes': preview_bytes}
    (root / 'letter-previews.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Letter display copies: {len(files)}, {source_bytes:,} → {preview_bytes:,} bytes')
    return result


if __name__ == '__main__':
    build()

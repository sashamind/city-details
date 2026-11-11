"""Classify the current crops for the optional sharp-only composer filter.
Requires Pillow. Does not modify crops or user edits.
"""
import json
from pathlib import Path
from PIL import Image, ImageFilter, ImageStat

ROOT = Path(__file__).resolve().parent
# Visual review of the 100 px contact sheets rejected these soft photographs,
# even where their textures produce a deceptively high edge score.
SOFT_SOURCES = {
    'c8d7ee59-a4ae-407e-a5eb-a713641b3277',  # purple graffiti
    'dc465b75-97de-4a5c-9e4e-33afeffe40dd',  # Очень больно
}
SOFT_MUSEUM_WORDS = {'ИСТОРИКО', 'АРХЕОЛОГИЧЕСК', 'МУЗЕЙ'}


def build(root=ROOT):
    root = Path(root)
    manifest = json.loads((root / 'manifest-all.json').read_text())
    quality = {}
    for m in manifest:
        with Image.open(root / m['file']) as image:
            gray = image.convert('L')
            w, h = gray.size
            scaled = gray.resize((max(6, round(w * 100 / h)), 100))
            edge = scaled.filter(ImageFilter.FIND_EDGES).crop((1, 1, scaled.width - 1, 99))
            focus = ImageStat.Stat(edge).mean[0] / max(ImageStat.Stat(scaled).stddev[0], 1)
        reason = 'clear'
        if h < 60:
            reason = 'small_crop'
        elif focus < .16:
            reason = 'soft_edges'
        if m['source_id'] in SOFT_SOURCES or (
            m['source_id'] == '2a496a2e-1b1d-480b-bc8f-84f3403dc765'
            and m.get('word') in SOFT_MUSEUM_WORDS
        ):
            reason = 'visually_soft'
        quality[m['id']] = {'file': m['file'], 'clear': reason == 'clear',
                            'height': h, 'focus': round(focus, 4), 'reason': reason}
    result = {'schema_version': 1, 'method': 'resolution_and_edges_with_visual_exclusions',
              'min_height': 60, 'min_focus': .16, 'variants': quality}
    (root / 'letter-quality.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print('Clear active variants:', sum(quality[m['id']]['clear'] for m in manifest if not m.get('hidden')))


if __name__ == '__main__':
    build()

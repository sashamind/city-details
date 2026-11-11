"""Rebuild manually reviewed rectangular letter crops. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json, html, zipfile
root = Path(__file__).resolve().parent
sources = json.loads((root/'sources.json').read_text())
by_title = {s['title']: s for s in sources}
specs = [
 ('Лого Автошкола', list('АВТОШКОЛА'), [(185,380,260,450),(259,383,319,452),(317,386,378,454),(378,389,444,457),(445,392,530,459),(532,395,592,462),(590,398,651,464),(652,400,710,466),(709,403,774,468)]),
 ('Вывеска Победа', list('ПОБЕДА'), [(120,130,232,204),(258,138,324,201),(360,133,447,196),(483,128,579,192),(606,121,710,188),(721,116,832,184)]),
 ('ТИАМ', list('ТИАМ'), [tuple(v*4 for v in b) for b in [(134,232,231,342),(334,237,426,344),(339,382,441,493),(531,382,645,493)]])
]
manifest=[]; sections=[]
font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
font=ImageFont.truetype(font_path,22)
canvas=Image.new('RGB',(1260,600),'#eee8df'); draw=ImageDraw.Draw(canvas)
for row,(title,letters,boxes) in enumerate(specs):
 s=by_title[title]; im=ImageOps.exif_transpose(Image.open(root/'sources'/f"{s['id']}.jpg")); cards=[]
 for idx,(letter,box) in enumerate(zip(letters,boxes)):
  filename=f"crops/{s['id'][:8]}-{idx+1:02d}-{letter}.png"; crop=im.crop(box); crop.save(root/filename)
  manifest.append({'letter':letter,'alphabet':'cyrillic','file':filename,'source_id':s['id'],'source_title':title,'source_url':s['url'],'box':list(box),'source_size':list(im.size)})
  cards.append(f'<a class="card" href="{filename}" download><img src="{filename}" alt="Буква {letter}"><span>{letter} ↓</span></a>')
  thumb=crop.copy(); thumb.thumbnail((115,115)); x=20+idx*137; y=row*200+40; canvas.paste(thumb,(x+(115-thumb.width)//2,y+(115-thumb.height)//2)); draw.text((x+45,y+122),letter,font=font,fill='#222222')
 draw.text((20,row*200+5),title,font=font,fill='#222222')
 sections.append(f'<section><h2>{html.escape(title)}</h2><div class="letters">{"".join(cards)}</div><details><summary>Исходная фотография</summary><img class="source" src="sources/{s["id"]}.jpg"></details></section>')
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
canvas.save(root/'preview.jpg')
(root/'index.html').write_text('''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Буквы Тулы — пробные кропы</title><style>body{font-family:system-ui,sans-serif;background:#f2eee7;color:#25251f;margin:0;padding:32px;max-width:1200px;margin:auto}h1{font-size:clamp(30px,5vw,56px);letter-spacing:-2px;margin-bottom:12px}p{line-height:1.6;color:#65635d}section{margin:48px 0}h2{font-size:20px}.letters{display:flex;flex-wrap:wrap;gap:12px}.card{background:white;padding:12px;border-radius:10px;text-decoration:none;color:inherit;display:flex;flex-direction:column;align-items:center;gap:12px}.card img{height:100px;width:auto;max-width:180px;object-fit:contain}.card:hover{box-shadow:0 4px 20px #0002}.source{display:block;max-width:100%;max-height:550px;margin-top:16px}details{margin-top:20px}summary{cursor:pointer}a{color:inherit}</style><h1>Буквы из города</h1><p>Первый эксперимент: 19 букв из трёх вывесок. Прямоугольные кропы с исходным фоном, без перерисовки и выравнивания перспективы. Нажми на букву, чтобы скачать PNG.</p><a href="letters.zip" download>Скачать весь набор ZIP</a>'''+''.join(sections))
with zipfile.ZipFile(root/'letters.zip','w',zipfile.ZIP_DEFLATED) as z:
 for m in manifest: z.write(root/m['file'],m['file'])
 z.write(root/'manifest.json','manifest.json')
print(f'Created {len(manifest)} crops, preview, gallery and archive')

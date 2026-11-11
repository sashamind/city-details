"""Build the reviewed collection without removing any existing files.
Run: PYTHONPATH=/tmp/textula-python python3 experiments/letters/build_collection.py
Pillow is the only dependency. selections.py contains reviewed crop coordinates.
"""
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
from collections import Counter,defaultdict
import json,math,zipfile,html,shutil
from selections import ROWS
ROOT=Path(__file__).resolve().parent
SOURCES=json.loads((ROOT/'all-sources.json').read_text())
# A new source must be visually reviewed before this generator can mark it so.
registry=json.loads((ROOT/'processed-photos.json').read_text())
reviewed={(p['source_id'],p['photo_url']) for p in registry['photos']}
unreviewed=[s['id'] for s in SOURCES if (s['id'],s['url']) not in reviewed]
if unreviewed:
 raise SystemExit('Сначала просмотрите новые фото и обновите processed-photos.json: '+', '.join(unreviewed))
OUT=ROOT/'variants';OUT.mkdir(exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
manifest=json.loads((ROOT/'manifest.json').read_text())
for m in manifest:
 m['character']=m['letter'];m['source_file']='sources/'+m['source_id']+'.jpg';m['id']=Path(m['file']).stem;m['review']='visual';m['case']='upper'
seq=Counter(); row_previews=[]
for source_index,text,boxes in ROWS:
 s=SOURCES[source_index]; image=ImageOps.exif_transpose(Image.open(ROOT/'sources'/f"{s['id']}.jpg"));w,h=image.size
 ref=image.copy();ref.thumbnail((1000,1000));rw,rh=ref.size;sx,sy=w/rw,h/rh
 row_items=[]
 for ch,b in zip(text,boxes):
  seq[s['id']]+=1; name=f"{s['id'][:8]}-{seq[s['id']]:03d}-U{ord(ch):04X}"
  pixel_box=[round(b[0]*sx),round(b[1]*sy),round(b[2]*sx),round(b[3]*sy)]
  assert 0<=pixel_box[0]<pixel_box[2]<=w and 0<=pixel_box[1]<pixel_box[3]<=h,(text,ch,pixel_box,w,h)
  crop=image.crop(pixel_box);file=f'variants/{name}.png';crop.save(ROOT/file)
  alpha='cyrillic' if '\u0400'<=ch<='\u04ff' else 'latin'
  m={'id':name,'letter':ch.upper(),'character':ch,'case':'lower' if ch.islower() else 'upper','alphabet':alpha,'file':file,'source_id':s['id'],'source_title':s['title'],'source_url':s['url'],'source_file':f"sources/{s['id']}.jpg",'box':pixel_box,'source_size':[w,h],'word':text,'review':'visual'}
  manifest.append(m);row_items.append((crop,ch,name))
 row_previews.append((source_index,text,row_items))
(ROOT/'manifest-all.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
# Every reviewed source gets an explicit disposition.
counts=Counter(m['source_id'] for m in manifest)
ambiguous={7:'Отражённые и обрезанные надписи на стекле; целые буквы уверенно не читаются.',11:'Неразборчивые граффити: символам нельзя уверенно назначить букву.',19:'Следы стёртой надписи и тегов; целые буквы не определяются.',22:'Переплетённые рукописные теги, неоднозначная расшифровка.',23:'Неразборчивые теги на фасаде.',42:'Знак в рамке может быть рисунком; не присвоен кириллице или латинице.',56:'Мелкие повреждённые теги.',57:'Нечитаемые следы надписей за стеклом.',64:'Стикер с рисунком; читаемой отдельной надписи нет.',68:'Рисунки на стикерах без читаемых букв.',72:'Крошечный обрезанный фрагмент надписи внизу снимка.'}
audit=[]
for i,s in enumerate(SOURCES):
 n=counts[s['id']];note='Вырезаны читаемые буквы; мелкий текст, обрезанные и неоднозначные символы пропущены.' if n else ambiguous.get(i,'Читаемых букв на фотографии не найдено.')
 audit.append({**s,'index':i,'reviewed':True,'status':'extracted' if n else 'ambiguous' if i in ambiguous else 'no_readable_letters','crop_count':n,'note':note})
(ROOT/'review.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
# Visual QA: one labelled row for every selected word, split across manageable sheets.
for batch in range(math.ceil(len(row_previews)/10)):
 rows=row_previews[batch*10:batch*10+10]; canvas=Image.new('RGB',(1500,len(rows)*145),'#eee8df');draw=ImageDraw.Draw(canvas)
 for j,(idx,text,entries) in enumerate(rows):
  y=j*145;draw.text((10,y+3),f'{idx:02d} {text}',font=font,fill='#222')
  for k,(im,ch,name) in enumerate(entries):
   thumb=im.copy();thumb.thumbnail((82,88));x=12+k*96;canvas.paste(thumb,(x+(82-thumb.width)//2,y+28+(88-thumb.height)//2));draw.text((x+31,y+117),ch,font=font,fill='#222')
 canvas.save(ROOT/f'qa-{batch+1:02d}.jpg')
# Small representative overview, preserving real crop aspect ratios.
groups=defaultdict(list)
for m in manifest: groups[(m['alphabet'],m['letter'])].append(m)
cyr='АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';lat='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
summary={'sources_reviewed':len(audit),'sources_with_crops':len(counts),'crops':len(manifest),'cyrillic_letters':sorted({m['letter'] for m in manifest if m['alphabet']=='cyrillic'}),'latin_letters':sorted({m['letter'] for m in manifest if m['alphabet']=='latin'}),'missing_cyrillic':[ch for ch in cyr if ('cyrillic',ch) not in groups]}
(ROOT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
with zipfile.ZipFile(ROOT/'collection.zip','w',zipfile.ZIP_DEFLATED) as z:
 archive_manifest=[]
 for m in manifest:
  target=f"{m['alphabet']}/{m['letter']}/{Path(m['file']).name}"
  z.write(ROOT/m['file'],target)
  archive_manifest.append({**m,'file':target})
 z.writestr('manifest-all.json',json.dumps(archive_manifest,ensure_ascii=False,indent=2))
 for name in ['review.json','summary.json']:z.write(ROOT/name,name)
# Preserve the first experiment's gallery alongside the new collection.
if not (ROOT/'sample.html').exists():shutil.copyfile(ROOT/'index.html',ROOT/'sample.html')
# Reapply saved curation after rebuilding the initial crops; never silently lose edits.
from collection_editor import CollectionEditor
editor=CollectionEditor(ROOT)
editor.materialize(baseline=manifest)
summary=json.loads((ROOT/'summary.json').read_text())
print(json.dumps(summary,ensure_ascii=False,indent=2))

'use strict';
const $ = id => document.getElementById(id);
const standardLetters = {cyrillic: [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'], latin:[...'ABCDEFGHIJKLMNOPQRSTUVWXYZÉ']};
let alphabet='cyrillic', chosen='', data=[], sources=[], originals=[], revision=0, edits={}, canSave=false;
let currentId='', draft=null, saved=null, sourceImage=null, dragging=null, busy=false, loadToken=0;
const imageCache=new Map();
let editorAdminToken='';
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const patchOf=m=>({character:m.character,alphabet:m.alphabet,box:[...m.box],hidden:!!m.hidden});
function isDirty(){return !!draft&&JSON.stringify(draft)!==JSON.stringify(saved);}
function plural(n){return n%10===1&&n%100!==11?'вариант':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'варианта':'вариантов';}
function allLetters(){return [...new Set([...standardLetters[alphabet],...data.filter(m=>m.alphabet===alphabet).map(m=>m.letter)])];}
function filtered(includeLetter=true){return data.filter(m=>(!m.hidden||$('show-hidden').checked)&&m.alphabet===alphabet&&(!includeLetter||!chosen||m.letter===chosen)&&(!$('source').value||m.source_id===$('source').value)&&(!$('large').checked||m.box[3]-m.box[1]>=80));}
function updateStats(){
 const active=data.filter(m=>!m.hidden),hidden=data.length-active.length;
 $('stats').replaceChildren();
 for(const [n,label] of [[sources.length,'фотографии проверены'],[new Set(active.map(m=>m.source_id)).size,'источника с буквами'],[active.length,'кропов'],[new Set(active.filter(m=>m.alphabet==='cyrillic').map(m=>m.letter)).size,'букв кириллицы']]){const span=element('span');span.append(element('strong','',n),document.createTextNode(label));$('stats').append(span);}
 $('editor-status').textContent=canSave?`Правки сохраняются в проект · ${Object.keys(edits).length} отредактировано${hidden?` · ${hidden} скрыто`:''}`:'Просмотр без сохранения. Для редактирования запусти локальный редактор: python3 experiments/letters/serve.py --port 5173';
 $('editor-status').classList.toggle('offline',!canSave);
 document.querySelector('a[href^="collection.zip"]').href=`collection.zip?revision=${revision}`;
}
function render(){
 const available=filtered(false);$('alphabet').replaceChildren();
 for(const ch of allLetters()){const n=available.filter(m=>m.letter===ch).length;const b=element('button',chosen===ch?'active':'',ch);b.disabled=!n;b.title=`${ch}: ${n} ${plural(n)}`;b.setAttribute('aria-pressed',String(chosen===ch));b.onclick=()=>{chosen=chosen===ch?'':ch;render();};$('alphabet').append(b);}
 const items=filtered();$('collection').replaceChildren();$('empty').hidden=!!items.length;$('result-count').textContent=`${items.length} ${plural(items.length)} · ${new Set(items.map(m=>m.source_id)).size} источников`;
 for(const ch of allLetters()){const group=items.filter(m=>m.letter===ch);if(!group.length)continue;group.sort((a,b)=>(b.box[3]-b.box[1])-(a.box[3]-a.box[1]));
  const section=element('section','letter-group');const title=element('div','group-title');title.append(element('h2','',ch),element('span','',`${group.length} ${plural(group.length)}`));section.append(title);const cards=element('div','cards');
  for(const m of group){const card=element('button',`card${m.hidden?' hidden-variant':''}`);card.dataset.id=m.id;card.setAttribute('aria-label',`${m.character}: ${m.source_title}, редактировать`);const well=element('div','image-well');const img=element('img');img.src=m.file;img.alt=m.character;img.loading='lazy';well.append(img);const line=element('span','card-letter',m.character);line.append(element('small','',`${m.box[2]-m.box[0]} × ${m.box[3]-m.box[1]}`));card.append(well,element('span','card-name',m.source_title),line);if(m.hidden)card.append(element('span','variant-state','Скрыт · можно вернуть'));else if(edits[m.id])card.append(element('span','variant-state','Исправлен'));card.onclick=()=>openDetail(m);cards.append(card);}
  section.append(cards);$('collection').append(section);
 }
 updateStats();
}
function loadImage(file){
 if(!imageCache.has(file))imageCache.set(file,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{imageCache.delete(file);reject(Error('Не удалось загрузить исходную фотографию.'));};img.src=file;}));
 return imageCache.get(file);
}
async function openDetail(m){
 currentId=m.id;saved=patchOf(m);draft=structuredClone(saved);sourceImage=null;dragging=null;const token=++loadToken;
 $('detail-title').textContent=m.source_title;$('source-link').href=`https://textula.ru/d/${m.source_id}/`;$('save-status').textContent='Загружаем исходную фотографию…';$('crop-zoom').value=1;$('editor-viewport').scrollTo(0,0);$('edit-fields').disabled=true;
 if(!$('detail').open)$('detail').showModal();
 syncForm();
 try{const img=await loadImage(m.source_file);if(token!==loadToken)return;sourceImage=img;const [w,h]=m.source_size;if(img.naturalWidth!==w||img.naturalHeight!==h)throw Error('Размер фотографии изменился. Рамку нужно проверить заново.');$('edit-fields').disabled=!canSave;$('crop-zoom').value=String(clamp(Math.round(100/(Math.min(draft.box[2]-draft.box[0],draft.box[3]-draft.box[1])*displayScale())*4)/4,1,6));syncForm();focusCrop();$('save-status').textContent=canSave?'Изменения появятся в файлах после сохранения.':'Сохранение недоступно: открой локальный редактор.';}
 catch(e){if(token===loadToken)$('save-status').textContent=e.message;}
}
function syncForm(){
 if(!draft)return;const [x,y,r,b]=draft.box;
 $('edit-character').value=draft.character;$('edit-alphabet').value=draft.alphabet;
 for(const [id,value] of [['crop-x',x],['crop-y',y],['crop-width',r-x],['crop-height',b-y]])$(id).value=value;
 $('detail-letter').textContent=draft.character;$('detail-alphabet').textContent=draft.alphabet==='cyrillic'?'Кириллица':'Латиница';$('detail-size').textContent=`${r-x} × ${b-y} px${draft.hidden?' · скрыт из коллекции':''}`;
 $('toggle-hidden').textContent=draft.hidden?'Вернуть в коллекцию':'Скрыть вариант';$('toggle-hidden').classList.toggle('will-hide',!draft.hidden);
 $('save-edit').disabled=busy||!sourceImage||!isDirty()||!canSave;$('cancel-edit').disabled=busy||!isDirty();
 drawEditor();drawPreview();
}
function changed(){syncForm();$('save-status').textContent=isDirty()?'Есть несохранённые изменения.':'Изменений нет.';}
function drawPreview(){
 const canvas=$('detail-crop'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!sourceImage||!draft)return;
 const [x,y,r,b]=draft.box,w=r-x,h=b-y,scale=Math.min(1,420/w,220/h);canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));ctx.drawImage(sourceImage,x,y,w,h,0,0,canvas.width,canvas.height);
 $('download').href='#';$('download').download=`${draft.character}-${currentId}.png`;
}
$('download').onclick=e=>{
 if(!sourceImage||!draft){e.preventDefault();return;}
 const [x,y,r,b]=draft.box,canvas=document.createElement('canvas');
 canvas.width=r-x;canvas.height=b-y;
 canvas.getContext('2d').drawImage(sourceImage,x,y,r-x,b-y,0,0,r-x,b-y);
 $('download').href=canvas.toDataURL('image/png');
};
function displayScale(){if(!sourceImage)return 1;return Math.min(($('editor-viewport').clientWidth-18)/sourceImage.naturalWidth,460/sourceImage.naturalHeight,1)*Number($('crop-zoom').value);}
function drawEditor(){
 if(!sourceImage||!draft)return;const canvas=$('crop-canvas'),w=sourceImage.naturalWidth,h=sourceImage.naturalHeight,scale=displayScale();
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}canvas.style.width=`${w*scale}px`;canvas.style.height=`${h*scale}px`;$('zoom-value').textContent=`${$('crop-zoom').value}×`;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.drawImage(sourceImage,0,0);const [x,y,r,b]=draft.box;
 ctx.fillStyle='#10180c77';ctx.fillRect(0,0,w,y);ctx.fillRect(0,b,w,h-b);ctx.fillRect(0,y,x,b-y);ctx.fillRect(r,y,w-r,b-y);
 ctx.strokeStyle='#ecff63';ctx.lineWidth=2/scale;ctx.strokeRect(x,y,r-x,b-y);
 for(const [hx,hy] of handles(draft.box)){ctx.fillStyle='#ecff63';ctx.fillRect(hx-4/scale,hy-4/scale,8/scale,8/scale);ctx.strokeStyle='#222';ctx.lineWidth=1/scale;ctx.strokeRect(hx-4/scale,hy-4/scale,8/scale,8/scale);}
}
function handles([x,y,r,b]){return [[x,y],[(x+r)/2,y],[r,y],[r,(y+b)/2],[r,b],[(x+r)/2,b],[x,b],[x,(y+b)/2]];}
function point(e){const rect=$('crop-canvas').getBoundingClientRect();return [clamp(Math.round((e.clientX-rect.left)/rect.width*sourceImage.naturalWidth),0,sourceImage.naturalWidth),clamp(Math.round((e.clientY-rect.top)/rect.height*sourceImage.naturalHeight),0,sourceImage.naturalHeight)];}
$('crop-canvas').addEventListener('pointerdown',e=>{
 if(!sourceImage||!canSave||busy||e.button!==0)return;e.preventDefault();const p=point(e),box=[...draft.box];const handle=handles(box).findIndex(([x,y])=>Math.hypot(x-p[0],y-p[1])<12/displayScale());
 dragging={start:p,box,handle,mode:handle>=0?'resize':p[0]>=box[0]&&p[0]<=box[2]&&p[1]>=box[1]&&p[1]<=box[3]?'move':'new'};$('crop-canvas').setPointerCapture(e.pointerId);
});
$('crop-canvas').addEventListener('pointermove',e=>{
 if(!dragging||!sourceImage)return;const p=point(e),d=dragging,[w,h]=[sourceImage.naturalWidth,sourceImage.naturalHeight];let [x,y,r,b]=d.box;
 if(d.mode==='move'){const dx=clamp(p[0]-d.start[0],-x,w-r),dy=clamp(p[1]-d.start[1],-y,h-b);x+=dx;r+=dx;y+=dy;b+=dy;}
 else if(d.mode==='new'){x=Math.min(d.start[0],p[0]);r=Math.max(d.start[0],p[0]);y=Math.min(d.start[1],p[1]);b=Math.max(d.start[1],p[1]);}
 else{if([0,6,7].includes(d.handle))x=clamp(p[0],0,r-1);if([2,3,4].includes(d.handle))r=clamp(p[0],x+1,w);if([0,1,2].includes(d.handle))y=clamp(p[1],0,b-1);if([4,5,6].includes(d.handle))b=clamp(p[1],y+1,h);}
 if(r>x&&b>y){draft.box=[x,y,r,b];changed();}
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('crop-canvas').addEventListener(name,()=>{dragging=null;});
function focusCrop(){
 if(!sourceImage||!draft)return;const view=$('editor-viewport'),canvas=$('crop-canvas'),vr=view.getBoundingClientRect(),cr=canvas.getBoundingClientRect(),s=displayScale(),[x,y,r,b]=draft.box;
 view.scrollLeft=(cr.left-vr.left+view.scrollLeft)+(x+r)/2*s-view.clientWidth/2;view.scrollTop=(cr.top-vr.top+view.scrollTop)+(y+b)/2*s-view.clientHeight/2;
}
$('crop-zoom').oninput=()=>{drawEditor();focusCrop();};
$('edit-character').oninput=()=>{draft.character=$('edit-character').value;changed();};
$('edit-alphabet').onchange=()=>{draft.alphabet=$('edit-alphabet').value;changed();};
for(const id of ['crop-x','crop-y','crop-width','crop-height'])$(id).onchange=()=>{
 if(!sourceImage)return;let x=Number($('crop-x').value),y=Number($('crop-y').value),w=Number($('crop-width').value),h=Number($('crop-height').value);if(![x,y,w,h].every(Number.isInteger))return;
 x=clamp(x,0,sourceImage.naturalWidth-1);y=clamp(y,0,sourceImage.naturalHeight-1);draft.box=[x,y,x+clamp(w,1,sourceImage.naturalWidth-x),y+clamp(h,1,sourceImage.naturalHeight-y)];changed();
};
$('toggle-hidden').onclick=()=>{draft.hidden=!draft.hidden;changed();};
$('cancel-edit').onclick=()=>{draft=structuredClone(saved);changed();};
$('restore-original').onclick=()=>{draft=patchOf(originals.find(m=>m.id===currentId));changed();};
$('edit-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!isDirty()||!canSave)return;
 if(!/^\p{L}$/u.test(draft.character)){$('save-status').textContent='Укажи одну букву.';return;}
 busy=true;$('edit-fields').disabled=true;$('save-status').textContent='Сохраняем PNG, каталог и архив…';
 try{const response=await fetch('api/edit',{method:'POST',headers:{'Content-Type':'application/json','X-Textula-Editor':'1','X-Textula-Admin':editorAdminToken},body:JSON.stringify({id:currentId,patch:draft,revision})});const result=await response.json();if(!response.ok)throw Error(result.error||'Не удалось сохранить.');
  adoptState(result);const m=data.find(m=>m.id===currentId);saved=patchOf(m);draft=structuredClone(saved);render();$('save-status').textContent='Сохранено в проект. PNG, каталог и ZIP обновлены.';
 }catch(e){$('save-status').textContent=e.message;}
 finally{busy=false;$('edit-fields').disabled=!canSave;syncForm();}
};
function adoptState(state){data=state.manifest;originals=state.original;revision=state.document.revision;edits=state.document.edits;}
function requestClose(){if(busy){$('save-status').textContent='Дождись завершения сохранения.';return;}if(isDirty()&&!confirm('Закрыть без сохранения изменений?'))return;$('detail').close();++loadToken;}
$('detail').querySelector('.close').onclick=requestClose;
$('detail').addEventListener('cancel',e=>{e.preventDefault();requestClose();});
$('detail').addEventListener('click',e=>{if(e.target===$('detail')){const b=$('detail').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)requestClose();}});
window.addEventListener('beforeunload',e=>{if(busy||isDirty()&&$('detail').open){e.preventDefault();e.returnValue='';}});
window.addEventListener('resize',drawEditor);
async function init(){
 try{
  try{editorAdminToken=sessionStorage.getItem('textula_admin_token')||'';}catch{}
  if(!editorAdminToken){$('editor-access-message').textContent='Редактор доступен после входа в админку на главной странице.';return;}
  const verify=await fetch('https://yzvigrtnwmkwkpmqmdzh.supabase.co/functions/v1/admin-action',{method:'POST',headers:{'Content-Type':'application/json','apikey':'sb_publishable__AIRJSDqAYUK_vxwYhXmRA_4-QzSKkR'},body:JSON.stringify({token:editorAdminToken,action:'list_pending',payload:{}})});
  if(!verify.ok){$('editor-access-message').textContent='Сессия недействительна или истекла. Войди в админку на главной странице.';return;}
  document.body.removeAttribute('data-editor-locked');
  const responses=await Promise.all(['manifest-all.json','review.json'].map(p=>fetch(p,{cache:'no-store'})));for(const r of responses)if(!r.ok)throw Error(r.status);[data,sources]=await Promise.all(responses.map(r=>r.json()));originals=structuredClone(data);
  try{const response=await fetch('api/state',{cache:'no-store',headers:{'X-Textula-Admin':editorAdminToken}});if(response.ok){adoptState(await response.json());canSave=true;}}catch{}
  for(const s of sources.filter(s=>data.some(m=>m.source_id===s.id)).sort((a,b)=>a.title.localeCompare(b.title,'ru'))){const o=element('option','',s.title);o.value=s.id;$('source').append(o);}
  $('audit-count').textContent=`(${sources.length})`;for(const s of sources){const card=element('article','audit-card');const a=element('a');a.href=`sources/${s.id}.jpg`;a.target='_blank';a.rel='noopener';const img=element('img');img.src=`thumbnails/${s.id}.jpg`;img.alt=s.title;img.loading='lazy';a.append(img);card.append(a,element('h3','',s.title),element('span','badge',s.crop_count?`${s.crop_count} кропов`:s.status==='ambiguous'?'Неоднозначный фрагмент':'Нет читаемых букв'),element('p','',s.note));$('audit').append(card);}
  render();
 }catch(e){$('editor-access-message').textContent='Не удалось проверить вход. Вернись на главную страницу и попробуй снова.';$('stats').textContent='Не удалось загрузить коллекцию. Обнови страницу через локальный сервер.';console.error(e);}
}
for(const b of document.querySelectorAll('[data-alphabet]'))b.onclick=()=>{alphabet=b.dataset.alphabet;chosen='';for(const t of document.querySelectorAll('[data-alphabet]')){t.classList.toggle('selected',t===b);t.setAttribute('aria-pressed',String(t===b));}render();};
for(const id of ['source','large','show-hidden'])$(id).onchange=render;
$('reset').onclick=()=>{chosen='';$('source').value='';$('large').checked=false;$('show-hidden').checked=false;render();};
init();

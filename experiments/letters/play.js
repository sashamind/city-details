'use strict';
const $=id=>document.getElementById(id);
const STORAGE_KEY='textula-letter-play-v1';
const layout=window.matchMedia('(max-width: 650px)').matches?'mobile':'desktop';
let settingsByLayout={};
$('letter-size').value=layout==='mobile'?40:100;
$('letter-gap').value=layout==='mobile'?3:5;
let quality={},qualityAvailable=false,previewFiles={};
let manifest=[],byId=new Map(),groups=new Map(),tiles=[],phrase='',pickerIndex=-1,ready=false,loading=false,loadedRevision=null;
let pendingShuffle=null,shuffleBusy=false,exportBusy=false;
let baseGroups=new Map(),selectedSignId='';
const imageCache=new Map();
const warmedFiles=new Set(),warmInFlight=new Set(),failedWarmFiles=new Set();
let warmQueue=[],warmTimer=null,lastInteraction=performance.now(),priorityLoads=0,visibleImagesReady=false,visibleEpoch=0,visibleReadyPromise=Promise.resolve();
function displayFile(m){return previewFiles[m.file]||m.file;}
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
function keyFor(ch){const upper=ch.toUpperCase();return /^\p{Script=Cyrillic}$/u.test(ch)?`cyrillic:${upper}`:/^\p{Script=Latin}$/u.test(ch)?`latin:${upper}`:null;}
function optionsFor(ch){return groups.get(keyFor(ch))||[];}
function isClear(m){const q=quality[m.id];return q?.clear===true&&q.file===m.file;}
function populateSignSources(){
 const previous=$('sign-source').value,all=new Map(manifest.map(m=>[m.source_id,m.source_title]));
 $('sign-source').replaceChildren(node('option','','Подобрать по тексту'));$('sign-source').firstChild.value='';
 for(const [id,title] of [...all].sort((a,b)=>a[1].localeCompare(b[1],'ru'))){const option=node('option','',title);option.value=id;$('sign-source').append(option);}
 if(all.has(previous))$('sign-source').value=previous;
}
function rebuildGroups(){
 const eligible=manifest.filter(m=>!$('sharp-only').checked||isClear(m));baseGroups=new Map();
 for(const m of eligible){const key=`${m.alphabet}:${m.letter}`;if(!baseGroups.has(key))baseGroups.set(key,[]);baseGroups.get(key).push(m);}
 const single=$('letter-mode').value==='single';selectedSignId='';
 if(single){
  selectedSignId=$('sign-source').value;
  if(!selectedSignId){
   const wanted=[...phrase.normalize('NFC')].map(keyFor).filter(Boolean),scores=new Map();
   for(const m of eligible)if(!scores.has(m.source_id))scores.set(m.source_id,{keys:new Set(),count:0});
   for(const m of eligible){scores.get(m.source_id).keys.add(`${m.alphabet}:${m.letter}`);scores.get(m.source_id).count++;}
   let best=-1;for(const [id,s] of scores){const score=wanted.filter(k=>s.keys.has(k)).length*1000+s.keys.size+s.count/1000;if(score>best){best=score;selectedSignId=id;}}
  }
 }
 groups=new Map();for(const [key,options] of baseGroups){const local=single?options.filter(m=>m.source_id===selectedSignId):options;groups.set(key,local.length?local:(single&&$('sign-fallback').checked?options:[]));}
 byId=new Map([...groups.values()].flat().map(m=>[m.id,m]));
 for(const id of ['sign-source-label','sign-fallback-label','sign-summary'])$(id).hidden=!single;
 $('collection-info').textContent=`${byId.size} ${$('sharp-only').checked?'чётких вариантов':'вариантов'} · актуальная коллекция`;
}
function updateSignSummary(){
 if($('letter-mode').value!=='single')return;
 const title=manifest.find(m=>m.source_id===selectedSignId)?.source_title||'Нет подходящей вывески';
 const borrowed=tiles.filter(t=>t.id&&byId.get(t.id)?.source_id!==selectedSignId).length;
 $('sign-summary').textContent=`${title}${borrowed?` · из других источников: ${borrowed}`:''}`;
}

function pick(options,previous){const candidates=options.filter(m=>m.id!==previous);const pool=candidates.length?candidates:options;return pool.length?pool[Math.floor(Math.random()*pool.length)].id:null;}
function savePlay(){try{settingsByLayout[layout]={size:Number($('letter-size').value),gap:Number($('letter-gap').value),defaultsVersion:2};localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,phrase,tiles:tiles.map(t=>({char:t.char,id:t.id})),settingsByLayout,signMode:$('letter-mode').value,signSourceId:$('sign-source').value,signFallback:$('sign-fallback').checked}));}catch{}}
function reconcile(text,previous=tiles){
 const chars=[...text.normalize('NFC')];
 return chars.map((char,index)=>{const old=previous[index],options=optionsFor(char);return {char,id:old?.char===char&&options.some(m=>m.id===old.id)?old.id:pick(options,null)};});
}
function fitTextarea(){
 const input=$('phrase');
 if(!window.matchMedia('(max-width: 650px)').matches){input.style.height='';return;}
 input.style.height='0px';input.style.height=`${input.scrollHeight}px`;
}
function render(preloadedImages=[]){
 fitTextarea();
 const stage=$('word-stage');stage.replaceChildren();stage.style.setProperty('--letter-size',`${$('letter-size').value}px`);stage.style.setProperty('--letter-gap',`${$('letter-gap').value}px`);stage.setAttribute('aria-label',phrase||'Пустая надпись');$('size-value').textContent=$('letter-size').value;$('gap-value').textContent=$('letter-gap').value;for(const id of ['letter-size','letter-gap']){const range=$(id);range.style.setProperty('--range-fill',`${(Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100}%`);}$('blank-hint').hidden=!!phrase.trim();
 let word=null;const createWord=()=>{word=node('span','word');stage.append(word);};
 tiles.forEach((tile,index)=>{
  if(tile.char==='\n'){stage.append(node('span','word-break'));word=null;return;}
  if(/\s/u.test(tile.char)){stage.append(node('span','word-space'));word=null;return;}
  if(!word)createWord();const m=byId.get(tile.id);
  if(m){const button=node('button','glyph');const cropWidth=m.box[2]-m.box[0],cropHeight=m.box[3]-m.box[1];button.style.width=`${Number($('letter-size').value)*cropWidth/cropHeight}px`;button.dataset.index=index;button.dataset.variant=m.id;button.title=`${tile.char} · ${m.source_title} · выбрать вариант`;button.setAttribute('aria-label',`${tile.char}, позиция ${index+1}, ${m.source_title}. Выбрать вариант`);const img=preloadedImages[index]||node('img');img.width=cropWidth;img.height=cropHeight;img.fetchPriority='high';const file=displayFile(m);if(img.getAttribute('src')!==file)img.src=file;img.alt=tile.char;img.draggable=false;button.append(img);button.onclick=()=>openPicker(index);word.append(button);}
  else if(/^\p{L}$/u.test(tile.char)){const missing=node('button','glyph missing',tile.char);missing.title=`Для «${tile.char}» ${$('sharp-only').checked?'нет чёткого варианта':'пока нет вариантов в коллекции'}`;missing.setAttribute('aria-label',`${tile.char}: нет вариантов`);missing.onclick=()=>openPicker(index);word.append(missing);}
  else word.append(node('span','literal',tile.char));
 });
 updateShuffleButton();
 updateExportButtons();updateSignSummary();
 watchVisibleImages();
 prepareShuffle();
}
function status(message,error=false){$('play-status').textContent=message;$('play-status').classList.toggle('error',error);}
function describe(){const missing=[...new Set(tiles.filter(t=>/^\p{L}$/u.test(t.char)&&!t.id).map(t=>t.char.toUpperCase()))];return missing.length?`${$('letter-mode').value==='single'&&!$('sign-fallback').checked?'В этой вывеске нет букв':$('sharp-only').checked?'Среди чётких вариантов нет букв':'Пока нет букв'}: ${missing.join(', ')}. Для остальных можно выбирать варианты.`:'Нажми на букву в надписи, чтобы сменить вариант или посмотреть источник.';}
function shuffleKey(){return JSON.stringify([phrase,$('sharp-only').checked,$('letter-mode').value,selectedSignId,$('sign-fallback').checked,tiles.map(t=>[t.char,t.id,byId.get(t.id)?displayFile(byId.get(t.id)):null])]);}
function updateShuffleButton(){
 $('shuffle').disabled=shuffleBusy||!ready||!tiles.some(t=>optionsFor(t.char).length>1);
 $('shuffle').textContent=shuffleBusy?'Загружаем…':'Перемешать ↻';
 $('word-stage').setAttribute('aria-busy',String(shuffleBusy));updateExportButtons();
}
function loadImage(file,priority='auto'){
 if(!imageCache.has(file)){
  const image=new Image();image.decoding='async';image.fetchPriority=priority;
  const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Image timeout')),20000);image.onload=async()=>{try{if(image.decode)await image.decode();clearTimeout(timer);warmedFiles.add(file);resolve(image);}catch(e){clearTimeout(timer);reject(e);}};image.onerror=()=>{clearTimeout(timer);reject(Error('Image unavailable'));};image.src=file;});
  imageCache.set(file,promise);promise.catch(()=>{if(imageCache.get(file)===promise)imageCache.delete(file);});
  if(imageCache.size>128)imageCache.delete(imageCache.keys().next().value);
 }
 return imageCache.get(file);
}
async function loadTileImages(next,priority='auto'){
 priorityLoads++;
 try{return await Promise.all(next.map(async tile=>{
  const m=byId.get(tile.id);if(!m)return null;
  const cached=await loadImage(displayFile(m),priority),image=cached.cloneNode(false);
  if(image.decode)await image.decode();return image;
 }));}finally{priorityLoads--;scheduleBackgroundWarm();}
}
function watchVisibleImages(){
 const epoch=++visibleEpoch,images=Array.from($('word-stage').querySelectorAll('img'));visibleImagesReady=false;
 visibleReadyPromise=Promise.all(images.map(image=>{
  if(image.decode)return image.decode().catch(()=>{});
  if(image.complete)return Promise.resolve();
  return new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});});
 })).then(()=>{
  if(epoch!==visibleEpoch)return;visibleImagesReady=true;
  for(const image of images)if(image.complete&&image.naturalWidth)warmedFiles.add(image.getAttribute('src'));
  refillWarmQueue();scheduleBackgroundWarm();
 });
}
function refillWarmQueue(){
 const currentOptions=tiles.flatMap(t=>optionsFor(t.char));
 warmQueue=[...new Set([...currentOptions,...manifest].map(displayFile))].filter(file=>!warmedFiles.has(file)&&!warmInFlight.has(file)&&!failedWarmFiles.has(file));
}
function scheduleBackgroundWarm(){
 if(warmTimer){clearTimeout(warmTimer);warmTimer=null;}
 if(document.hidden||!visibleImagesReady||priorityLoads||shuffleBusy||loading||navigator.onLine===false)return;
 warmTimer=setTimeout(warmRemaining,Math.max(0,800-(performance.now()-lastInteraction)));
}
function warmRemaining(){
 warmTimer=null;
 if(document.hidden||!visibleImagesReady||priorityLoads||shuffleBusy||loading||navigator.onLine===false||performance.now()-lastInteraction<800){scheduleBackgroundWarm();return;}
 while(warmInFlight.size<2&&warmQueue.length){
  const file=warmQueue.shift();if(warmedFiles.has(file)||failedWarmFiles.has(file))continue;
  warmInFlight.add(file);const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  fetch(file,{cache:'force-cache',priority:'low',signal:controller.signal}).then(async response=>{
   if(!response.ok||!response.headers.get('Content-Type')?.startsWith('image/'))throw Error('Preview unavailable');
   await response.arrayBuffer();warmedFiles.add(file);
  }).catch(()=>failedWarmFiles.add(file)).finally(()=>{clearTimeout(timeout);warmInFlight.delete(file);scheduleBackgroundWarm();});
 }
}
function noteInteraction(){lastInteraction=performance.now();scheduleBackgroundWarm();}
for(const event of ['pointerdown','keydown','input','scroll'])document.addEventListener(event,noteInteraction,{passive:true,capture:true});
document.addEventListener('visibilitychange',scheduleBackgroundWarm);
window.addEventListener('online',()=>{failedWarmFiles.clear();refillWarmQueue();scheduleBackgroundWarm();});

function prepareShuffle(){
 const key=shuffleKey();if(pendingShuffle?.key===key)return pendingShuffle;
 if(pendingShuffle?.timer)clearTimeout(pendingShuffle.timer);
 if(!ready||!tiles.some(t=>optionsFor(t.char).length>1)){pendingShuffle=null;return null;}
 const next=tiles.map(t=>({...t,id:pick(optionsFor(t.char),t.id)}));
 const entry={key,next,promise:null,timer:null};
 entry.start=(foreground=false)=>{if(entry.timer){clearTimeout(entry.timer);entry.timer=null;}if(!entry.promise)entry.promise=loadTileImages(next,foreground?'high':'low').then(images=>({images}),error=>({error}));return entry.promise;};
 entry.timer=setTimeout(()=>{visibleReadyPromise.then(()=>{if(pendingShuffle===entry&&!document.hidden)entry.start();});},150);pendingShuffle=entry;return entry;
}
async function shuffle(){
 if(shuffleBusy)return;const entry=prepareShuffle();if(!entry)return;
 shuffleBusy=true;updateShuffleButton();
 try{
  const result=await entry.start(true);
  if(shuffleKey()!==entry.key)return;
  if(result.error){pendingShuffle=null;status('Не удалось загрузить новые буквы. Прежняя надпись сохранена — попробуй ещё раз.',true);return;}
  const changed=entry.next.filter((t,i)=>t.id!==tiles[i].id).length;
  tiles=entry.next;render(result.images);savePlay();status(`Надпись та же — заменено вариантов: ${changed}. ${describe()}`);
 }finally{shuffleBusy=false;updateShuffleButton();scheduleBackgroundWarm();}
}

function updateExportButtons(){
 $('download-word').disabled=exportBusy||shuffleBusy||!ready||!phrase.trim();
 $('download-letters').disabled=exportBusy||shuffleBusy||!ready||!tiles.some(t=>t.id&&byId.has(t.id));
}
let lastDownloadUrl=null;
function offerDownload(blob,filename){
 if(lastDownloadUrl)URL.revokeObjectURL(lastDownloadUrl);lastDownloadUrl=URL.createObjectURL(blob);
 const link=$('download-result');link.href=lastDownloadUrl;link.textContent=filename.endsWith('.zip')?'Открыть архив ↗':'Открыть картинку ↗';link.hidden=false;
 const anchor=document.createElement('a');anchor.href=lastDownloadUrl;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();
}
function exportSnapshot(){
 const stage=$('word-stage');stage.classList.add('exporting');
 try{return Array.from(stage.querySelectorAll('.glyph,.literal')).map(el=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el),m=byId.get(el.dataset.variant);return {x:r.left,y:r.top,w:r.width,h:r.height,m,text:el.textContent,font:`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,color:style.color,missing:el.classList.contains('missing')};});}
 finally{stage.classList.remove('exporting');}
}
async function buildInscriptionPng(atoms,size){
 if(!atoms.length)throw Error('Напиши текст для скачивания.');
 const left=Math.min(...atoms.map(a=>a.x)),top=Math.min(...atoms.map(a=>a.y)),right=Math.max(...atoms.map(a=>a.x+a.w)),bottom=Math.max(...atoms.map(a=>a.y+a.h)),padding=16;
 const w=Math.ceil(right-left+padding*2),h=Math.ceil(bottom-top+padding*2),scale=Math.min(Math.max(2,Math.min(4,160/size)),4096/w,4096/h,Math.sqrt(8000000/(w*h)));
 const images=await Promise.all(atoms.map(a=>a.m?loadImage(a.m.file,'high'):null));if(document.fonts)await document.fonts.ready;
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*scale));canvas.height=Math.max(1,Math.ceil(h*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);
 atoms.forEach((a,i)=>{const x=a.x-left+padding,y=a.y-top+padding;if(images[i]){ctx.drawImage(images[i],x,y,a.w,a.h);}else{ctx.fillStyle=a.color;ctx.font=a.font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(a.text,x+a.w/2,y+a.h/2);if(a.missing){ctx.strokeStyle='#aaa';ctx.setLineDash([3,3]);ctx.strokeRect(x,y,a.w,a.h);ctx.setLineDash([]);}}});
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось создать PNG.')),'image/png'));
}
async function buildLetterArchive(snapshot,text){
 const letters=snapshot.map((t,index)=>({t,index,m:byId.get(t.id)})).filter(x=>x.m),files=[],metadata=[];
 await Promise.all(letters.map(x=>loadImage(x.m.file,'high')));
 for(const {t,index,m} of letters){const response=await fetch(m.file,{cache:'force-cache'});if(!response.ok)throw Error('Не удалось загрузить исходную букву.');const name=`${String(index+1).padStart(3,'0')}-${t.char}.png`;files.push({name,bytes:new Uint8Array(await response.arrayBuffer())});metadata.push({position:index+1,character:t.char,file:name,variant_id:m.id,source_id:m.source_id,source_title:m.source_title,source_url:m.source_url,box:m.box});}
 files.push({name:'letters.json',bytes:new TextEncoder().encode(JSON.stringify({text,letters:metadata,missing:snapshot.map((t,index)=>({position:index+1,character:t.char,id:t.id})).filter(t=>!t.id&&/^\p{L}$/u.test(t.character)).map(({position,character})=>({position,character}))},null,2))});return createLetterZip(files);
}
async function downloadInscription(kind){
 if(exportBusy||shuffleBusy||!ready)return;const text=phrase,snapshot=tiles.map(t=>({...t})),atoms=kind==='word'?exportSnapshot():null,size=Number($('letter-size').value);
 exportBusy=true;priorityLoads++;updateExportButtons();status(kind==='word'?'Готовим надпись в PNG…':'Собираем исходные буквы в ZIP…');
 try{const blob=kind==='word'?await buildInscriptionPng(atoms,size):await buildLetterArchive(snapshot,text);offerDownload(blob,kind==='word'?'textula-inscription.png':'textula-letters.zip');if(phrase===text)status(kind==='word'?'Надпись готова. На iPhone файл можно открыть по ссылке рядом с кнопками.':'Архив готов: отдельные PNG и файл с порядком букв и источниками.');}
 catch(e){status(e.message||'Не удалось подготовить файл. Попробуй ещё раз.',true);}
 finally{exportBusy=false;priorityLoads--;updateExportButtons();scheduleBackgroundWarm();}
}
$('download-word').onclick=()=>downloadInscription('word');$('download-letters').onclick=()=>downloadInscription('letters');

function showSource(m,expand=true){
 $('origin-title').textContent=`${m.character} · ${m.source_title}`;$('origin-image').src=m.source_file;$('origin-image').alt=m.source_title;$('origin-link').href=`https://textula.ru/d/${m.source_id}/`;
 const [w,h]=m.source_size,[x,y,r,b]=m.box;Object.assign($('origin-outline').style,{left:`${x/w*100}%`,top:`${y/h*100}%`,width:`${(r-x)/w*100}%`,height:`${(b-y)/h*100}%`});$('source-details').hidden=false;$('source-details').open=expand;
}
function openPicker(index){
 pickerIndex=index;const tile=tiles[index];if(!tile)return;const options=optionsFor(tile.char);$('picker-title').textContent=`Буква ${tile.char}`;$('picker-info').textContent=options.length?`${options.length} ${$('sharp-only').checked?'чётких вариантов':'вариантов'} · позиция ${index+1} в надписи. Выбор меняет только эту букву.`:($('sharp-only').checked?'Для этой буквы нет чётких вариантов. Сними галочку, чтобы использовать всю коллекцию.':'Этой буквы пока нет среди нескрытых вариантов коллекции.');$('variant-options').replaceChildren();$('source-details').hidden=!options.length;$('source-details').open=false;
 const current=byId.get(tile.id);if(current)showSource(current,false);
 for(const m of [...options].sort((a,b)=>(b.box[3]-b.box[1])-(a.box[3]-a.box[1]))){
  const article=node('article',`variant-option${tile.id===m.id?' chosen':''}`);article.dataset.id=m.id;const select=node('button','variant-choice');select.title=`Выбрать ${m.source_title}`;select.setAttribute('aria-label',`Выбрать вариант: ${m.source_title}`);const well=node('span','image-well'),img=node('img');img.src=displayFile(m);img.alt=m.character;img.loading='lazy';well.append(img);select.append(well,node('span','option-title',m.source_title),node('span','option-state',tile.id===m.id?'Выбран сейчас':'Выбрать этот вариант'));select.onclick=()=>{tiles[pickerIndex]={char:tiles[pickerIndex].char,id:m.id};render();savePlay();$('variant-picker').close();status(`Для «${tile.char}» выбран вариант: ${m.source_title}.`);const button=$('word-stage').querySelector(`[data-index="${pickerIndex}"]`);button?.focus();};
  const source=node('button','origin-button','Откуда эта буква ↗');source.onclick=()=>{showSource(m);$('source-details').scrollIntoView({block:'nearest'});};article.append(select,source);$('variant-options').append(article);
 }
 if(!$('variant-picker').open)$('variant-picker').showModal();
}
async function loadCollection(initial=false,quiet=false){
 if(loading)return;loading=true;
 try{
  const [response,qualityResponse,previewResponse]=await Promise.all([fetch('manifest-all.json',{cache:'no-store'}),fetch('letter-quality.json',{cache:'no-store'}).catch(()=>null),fetch('letter-previews.json',{cache:'no-store'}).catch(()=>null)]);if(!response.ok)throw Error('Не удалось прочитать коллекцию.');
  const rows=await response.json();const qualityData=qualityResponse?.ok?await qualityResponse.json():null;
  qualityAvailable=!!qualityData?.variants;quality=qualityData?.variants||{};previewFiles=previewResponse?.ok?(await previewResponse.json()).files||{}:{};
  $('sharp-only').disabled=!qualityAvailable;if(!qualityAvailable)$('sharp-only').checked=false;
  const revision=JSON.stringify([rows.map(m=>[m.id,m.character,m.alphabet,m.file,m.hidden]),quality,previewFiles]);
  if(!Array.isArray(rows))throw Error('Некорректный список букв.');
  if(quiet&&ready&&revision!==null&&revision===loadedRevision)return;
  manifest=rows.filter(m=>!m.hidden);populateSignSources();
  let previous=tiles;
  if(initial){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.version===1&&typeof saved.phrase==='string'&&Array.isArray(saved.tiles)){phrase=saved.phrase.slice(0,200);previous=saved.tiles;$('phrase').value=phrase;$('letter-mode').value=saved.signMode==='single'?'single':'all';if(Array.from($('sign-source').options).some(o=>o.value===saved.signSourceId))$('sign-source').value=saved.signSourceId;if(typeof saved.signFallback==='boolean')$('sign-fallback').checked=saved.signFallback;settingsByLayout=saved.settingsByLayout&&typeof saved.settingsByLayout==='object'?saved.settingsByLayout:{};const preferences=settingsByLayout[layout]||(layout==='desktop'?saved:{});if(Number.isFinite(preferences.size))$('letter-size').value=layout==='mobile'&&preferences.defaultsVersion!==2&&preferences.size===50?40:Math.min(180,Math.max(40,preferences.size));if(Number.isFinite(preferences.gap))$('letter-gap').value=Math.min(24,Math.max(0,preferences.gap));}}catch{}if(!phrase)phrase=$('phrase').value;}
  rebuildGroups();tiles=reconcile(phrase,previous);loadedRevision=revision;ready=true;render();savePlay();
  if($('variant-picker').open)openPicker(pickerIndex);
  status(quiet?'Коллекция обновлена с учётом сохранённых правок. '+describe():describe());
 }catch(e){status('Не удалось обновить буквы. '+(ready?'Надпись сохранена, попробуй обновить ещё раз.':'Открой страницу через локальный сервер и попробуй снова.'),true);console.error(e);}
 finally{loading=false;scheduleBackgroundWarm();}
}
$('phrase').addEventListener('input',()=>{fitTextarea();phrase=$('phrase').value;if(!ready)return;rebuildGroups();tiles=reconcile(phrase);render();savePlay();status(describe());});
$('shuffle').onclick=shuffle;
for(const id of ['letter-mode','sign-source','sign-fallback'])$(id).onchange=()=>{rebuildGroups();tiles=reconcile(phrase);render();savePlay();if($('variant-picker').open)openPicker(pickerIndex);status(describe());};
$('sharp-only').onchange=()=>{rebuildGroups();tiles=reconcile(phrase);render();savePlay();if($('variant-picker').open)openPicker(pickerIndex);status(describe());};
for(const id of ['letter-size','letter-gap'])$(id).oninput=()=>{render();savePlay();};
$('close-picker').onclick=()=>$('variant-picker').close();
$('variant-picker').addEventListener('click',e=>{if(e.target===$('variant-picker')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('focus',()=>{if(ready)loadCollection(false,true);});
window.addEventListener('resize',fitTextarea);
phrase=$('phrase').value;fitTextarea();loadCollection(true);

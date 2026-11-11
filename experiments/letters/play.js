'use strict';
const $=id=>document.getElementById(id);
const STORAGE_KEY='textula-letter-play-v1';
const layout=window.matchMedia('(max-width: 650px)').matches?'mobile':'desktop';
let settingsByLayout={};
$('letter-size').value=layout==='mobile'?50:100;
$('letter-gap').value=layout==='mobile'?3:5;
let quality={},qualityAvailable=false;
let manifest=[],byId=new Map(),groups=new Map(),tiles=[],phrase='',pickerIndex=-1,ready=false,loading=false,loadedRevision=null;
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
function keyFor(ch){const upper=ch.toUpperCase();return /^\p{Script=Cyrillic}$/u.test(ch)?`cyrillic:${upper}`:/^\p{Script=Latin}$/u.test(ch)?`latin:${upper}`:null;}
function optionsFor(ch){return groups.get(keyFor(ch))||[];}
function isClear(m){const q=quality[m.id];return q?.clear===true&&q.file===m.file;}
function rebuildGroups(){
 const eligible=manifest.filter(m=>!$('sharp-only').checked||isClear(m));byId=new Map(eligible.map(m=>[m.id,m]));groups=new Map();
 for(const m of eligible){const key=`${m.alphabet}:${m.letter}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
 $('collection-info').textContent=`${eligible.length} ${$('sharp-only').checked?'чётких вариантов':'вариантов'} · актуальная коллекция`;
}
function pick(options,previous){const candidates=options.filter(m=>m.id!==previous);const pool=candidates.length?candidates:options;return pool.length?pool[Math.floor(Math.random()*pool.length)].id:null;}
function savePlay(){try{settingsByLayout[layout]={size:Number($('letter-size').value),gap:Number($('letter-gap').value)};localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,phrase,tiles:tiles.map(t=>({char:t.char,id:t.id})),settingsByLayout}));}catch{}}
function reconcile(text,previous=tiles){
 const chars=[...text.normalize('NFC')];
 return chars.map((char,index)=>{const old=previous[index],options=optionsFor(char);return {char,id:old?.char===char&&options.some(m=>m.id===old.id)?old.id:pick(options,null)};});
}
function render(){
 const stage=$('word-stage');stage.replaceChildren();stage.style.setProperty('--letter-size',`${$('letter-size').value}px`);stage.style.setProperty('--letter-gap',`${$('letter-gap').value}px`);stage.setAttribute('aria-label',phrase||'Пустая надпись');$('size-value').textContent=$('letter-size').value;$('gap-value').textContent=$('letter-gap').value;for(const id of ['letter-size','letter-gap']){const range=$(id);range.style.setProperty('--range-fill',`${(Number(range.value)-Number(range.min))/(Number(range.max)-Number(range.min))*100}%`);}$('blank-hint').hidden=!!phrase.trim();
 let word=null;const createWord=()=>{word=node('span','word');stage.append(word);};
 tiles.forEach((tile,index)=>{
  if(tile.char==='\n'){stage.append(node('span','word-break'));word=null;return;}
  if(/\s/u.test(tile.char)){stage.append(node('span','word-space'));word=null;return;}
  if(!word)createWord();const m=byId.get(tile.id);
  if(m){const button=node('button','glyph');button.dataset.index=index;button.dataset.variant=m.id;button.title=`${tile.char} · ${m.source_title} · выбрать вариант`;button.setAttribute('aria-label',`${tile.char}, позиция ${index+1}, ${m.source_title}. Выбрать вариант`);const img=node('img');img.src=m.file;img.alt=tile.char;img.draggable=false;button.append(img);button.onclick=()=>openPicker(index);word.append(button);}
  else if(/^\p{L}$/u.test(tile.char)){const missing=node('button','glyph missing',tile.char);missing.title=`Для «${tile.char}» ${$('sharp-only').checked?'нет чёткого варианта':'пока нет вариантов в коллекции'}`;missing.setAttribute('aria-label',`${tile.char}: нет вариантов`);missing.onclick=()=>openPicker(index);word.append(missing);}
  else word.append(node('span','literal',tile.char));
 });
 $('shuffle').disabled=!ready||!tiles.some(t=>optionsFor(t.char).length>1);
}
function status(message,error=false){$('play-status').textContent=message;$('play-status').classList.toggle('error',error);}
function describe(){const missing=[...new Set(tiles.filter(t=>/^\p{L}$/u.test(t.char)&&!t.id).map(t=>t.char.toUpperCase()))];return missing.length?`${$('sharp-only').checked?'Среди чётких вариантов нет букв':'Пока нет букв'}: ${missing.join(', ')}. Для остальных можно выбирать варианты.`:'Нажми на букву в надписи, чтобы сменить вариант или посмотреть источник.';}
function shuffle(){
 let changed=0;tiles=tiles.map(t=>{const id=pick(optionsFor(t.char),t.id);if(id!==t.id)changed++;return {...t,id};});render();savePlay();status(changed?`Надпись та же — заменено вариантов: ${changed}. ${describe()}`:'Для этих букв пока нет других вариантов.');
}
function showSource(m,expand=true){
 $('origin-title').textContent=`${m.character} · ${m.source_title}`;$('origin-image').src=m.source_file;$('origin-image').alt=m.source_title;$('origin-link').href=`https://textula.ru/d/${m.source_id}/`;
 const [w,h]=m.source_size,[x,y,r,b]=m.box;Object.assign($('origin-outline').style,{left:`${x/w*100}%`,top:`${y/h*100}%`,width:`${(r-x)/w*100}%`,height:`${(b-y)/h*100}%`});$('source-details').hidden=false;$('source-details').open=expand;
}
function openPicker(index){
 pickerIndex=index;const tile=tiles[index];if(!tile)return;const options=optionsFor(tile.char);$('picker-title').textContent=`Буква ${tile.char}`;$('picker-info').textContent=options.length?`${options.length} ${$('sharp-only').checked?'чётких вариантов':'вариантов'} · позиция ${index+1} в надписи. Выбор меняет только эту букву.`:($('sharp-only').checked?'Для этой буквы нет чётких вариантов. Сними галочку, чтобы использовать всю коллекцию.':'Этой буквы пока нет среди нескрытых вариантов коллекции.');$('variant-options').replaceChildren();$('source-details').hidden=!options.length;$('source-details').open=false;
 const current=byId.get(tile.id);if(current)showSource(current,false);
 for(const m of [...options].sort((a,b)=>(b.box[3]-b.box[1])-(a.box[3]-a.box[1]))){
  const article=node('article',`variant-option${tile.id===m.id?' chosen':''}`);article.dataset.id=m.id;const select=node('button','variant-choice');select.title=`Выбрать ${m.source_title}`;select.setAttribute('aria-label',`Выбрать вариант: ${m.source_title}`);const well=node('span','image-well'),img=node('img');img.src=m.file;img.alt=m.character;img.loading='lazy';well.append(img);select.append(well,node('span','option-title',m.source_title),node('span','option-state',tile.id===m.id?'Выбран сейчас':'Выбрать этот вариант'));select.onclick=()=>{tiles[pickerIndex]={char:tiles[pickerIndex].char,id:m.id};render();savePlay();$('variant-picker').close();status(`Для «${tile.char}» выбран вариант: ${m.source_title}.`);const button=$('word-stage').querySelector(`[data-index="${pickerIndex}"]`);button?.focus();};
  const source=node('button','origin-button','Откуда эта буква ↗');source.onclick=()=>{showSource(m);$('source-details').scrollIntoView({block:'nearest'});};article.append(select,source);$('variant-options').append(article);
 }
 if(!$('variant-picker').open)$('variant-picker').showModal();
}
async function loadCollection(initial=false,quiet=false){
 if(loading)return;loading=true;
 try{
  const [response,qualityResponse]=await Promise.all([fetch('manifest-all.json',{cache:'no-store'}),fetch('letter-quality.json',{cache:'no-store'}).catch(()=>null)]);if(!response.ok)throw Error('Не удалось прочитать коллекцию.');
  const rows=await response.json();const qualityData=qualityResponse?.ok?await qualityResponse.json():null;
  qualityAvailable=!!qualityData?.variants;quality=qualityData?.variants||{};
  $('sharp-only').disabled=!qualityAvailable;if(!qualityAvailable)$('sharp-only').checked=false;
  const revision=JSON.stringify([rows.map(m=>[m.id,m.character,m.alphabet,m.file,m.hidden]),quality]);
  if(!Array.isArray(rows))throw Error('Некорректный список букв.');
  if(quiet&&ready&&revision!==null&&revision===loadedRevision)return;
  manifest=rows.filter(m=>!m.hidden);rebuildGroups();
  let previous=tiles;
  if(initial){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.version===1&&typeof saved.phrase==='string'&&Array.isArray(saved.tiles)){phrase=saved.phrase.slice(0,200);previous=saved.tiles;$('phrase').value=phrase;settingsByLayout=saved.settingsByLayout&&typeof saved.settingsByLayout==='object'?saved.settingsByLayout:{};const preferences=settingsByLayout[layout]||(layout==='desktop'?saved:{});if(Number.isFinite(preferences.size))$('letter-size').value=Math.min(180,Math.max(40,preferences.size));if(Number.isFinite(preferences.gap))$('letter-gap').value=Math.min(24,Math.max(0,preferences.gap));}}catch{}if(!phrase)phrase=$('phrase').value;}
  tiles=reconcile(phrase,previous);loadedRevision=revision;ready=true;render();savePlay();
  if($('variant-picker').open)openPicker(pickerIndex);
  status(quiet?'Коллекция обновлена с учётом сохранённых правок. '+describe():describe());
 }catch(e){status('Не удалось обновить буквы. '+(ready?'Надпись сохранена, попробуй обновить ещё раз.':'Открой страницу через локальный сервер и попробуй снова.'),true);console.error(e);}
 finally{loading=false;}
}
$('phrase').addEventListener('input',()=>{phrase=$('phrase').value;if(!ready)return;tiles=reconcile(phrase);render();savePlay();status(describe());});
$('shuffle').onclick=shuffle;
$('sharp-only').onchange=()=>{rebuildGroups();tiles=reconcile(phrase);render();savePlay();if($('variant-picker').open)openPicker(pickerIndex);status(describe());};
for(const id of ['letter-size','letter-gap'])$(id).oninput=()=>{render();savePlay();};
$('close-picker').onclick=()=>$('variant-picker').close();
$('variant-picker').addEventListener('click',e=>{if(e.target===$('variant-picker')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('focus',()=>{if(ready)loadCollection(false,true);});
phrase=$('phrase').value;loadCollection(true);

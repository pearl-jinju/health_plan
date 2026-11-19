import {exercises,routines,replacements,current,token,createSession,advance,adjust,recommend,statistics,revise,restored,volume} from './core.mjs';
import {load,save} from './storage.mjs';
import {coach} from './audio.mjs';
import {swipeDirection,tempoOptions,tempoPhases,tempoProfile} from './tempo.mjs';
import {defaultCountVoice,normalizeCountVoice} from './count-voice.mjs';
import {createSummaryAd} from './adfit.mjs';

const root=document.querySelector('main');
const summaryAd=createSummaryAd(document.querySelector('#summary-ad'),root);
const status=document.querySelector('#status');
const notify=message=>{status.textContent=message;};
let headsetStatus='이어폰 다시 연결을 눌러 Chrome 미디어를 켤 수 있습니다.';
function showHeadsetStatus(message){
 headsetStatus=message;
 const indicator=document.querySelector('#headset-status');
 if(indicator)indicator.textContent=message;
}
const audio=coach(dispatch,()=>token(data?.active),notify,showHeadsetStatus);
let data, page='today', setupTab='goal', routine='가슴만', plans=[], editPlan=0, editSet=0;
let recordDay=null, summaryExercise=null;
let draft=null, detail=null, filter='bench', graphWeight=null, timer, sequence=0, busy=false, swallowClickUntil=0;
const settings={rest:60,cues:false,countVoice:defaultCountVoice};
const tempoKey='health-agent.exercise-tempos';
const countVoiceKey='health-agent.count-voice';
const adsKey='health-agent.show-ads';
let exerciseTempos={};
let showAds=true;
try{exerciseTempos=JSON.parse(localStorage.getItem(tempoKey))??{};}catch{}
try{settings.countVoice=normalizeCountVoice(localStorage.getItem(countVoiceKey));}catch{}
try{showAds=localStorage.getItem(adsKey)!=='off';}catch{}
const labels={count:'카운트 중',target:'목표 안내 완료',answer:'실제 기록 확인',rest:'휴식 중',ready:'다음 세트 준비',paused:'일시정지'};
const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date());
const weightLabel=(key,value)=>exercises[key][2]==='맨몸'?'맨몸':(exercises[key][3]==='한 손'?'한 손 ':'')+value+'kg';
const button=(action,label,style='')=>'<button class="'+style+'" data-action="'+action+'">'+label+'</button>';
const total=session=>session.sets.reduce((sum,set)=>sum+volume(set),0);
function chooseRoutine(value){
 routine=value;
 // The first exercise is selected for the three-set MVP.
 plans=routines[value].map((exercise,index)=>({exercise,enabled:index===0,sets:Array.from({length:3},()=>({weight:exercise==='bench'?40:0,reps:10}))}));
 editPlan=editSet=0;
 setupTab='goal';
}
chooseRoutine(routine);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const adjustAnimations=new WeakMap();
function adjustedValue(field,value,key,scope,direction){
 if(field==='reps'&&scope!=='plan')return Math.max(0,Math.min(999,value+direction));
 return adjust({[field]:value},field,direction,key)[field];
}
function readout(field,value,key,scope){
 const format=n=>field==='weight'?weightLabel(key,n):n+'회';
 const neighbor=direction=>{
  const next=adjustedValue(field,value,key,scope,direction);
  return next===value?'':format(next);
 };
 return [neighbor(-1),format(value),neighbor(1)];
}
function adjuster(field,value,key,scope){
 if(field==='weight'&&exercises[key][5]===null)return '<div class="card">맨몸</div>';
 const weight=field==='weight';
 const label=weight?'무게':'횟수';
 const step=weight?exercises[key][5]+'kg':'1회';
 const control=(direction,symbol,verb)=>'<button type="button" data-action="delta:'+scope+':'+field+':'+direction+'" aria-label="'+label+' '+step+' '+verb+'">'+symbol+'</button>';
 const values=readout(field,value,key,scope);
 return '<section class="adjust card" data-swipe="'+scope+':'+field+'"><small>'+label+'</small><div class="adjust-controls">'+
 control(-1,'−','줄이기')+'<div class="swipe-reading"><div class="swipe-window" aria-hidden="true"><div class="swipe-track">'+
 values.map((text,i)=>'<strong data-swipe-slot="'+(i-1)+'">'+text+'</strong>').join('')+'</div></div>'+
 '<span class="swipe-hint">← 증가 · 감소 →</span><span class="swipe-live" aria-live="polite">'+values[1]+'</span></div>'+
 control(1,'＋','늘리기')+'</div><small class="adjust-step">한 칸 '+step+'</small></section>';
}
function tempoSettings(key){
 const profile=tempoProfile(key,exerciseTempos[key]);
 const total=profile.reduce((sum,phase)=>sum+phase.seconds,0);
 return '<section class="card tempo"><h3>'+exercises[key][0]+' 템포</h3><p>한 번에 '+total+'초 · 각 구간이 시작될 때 신호음이 납니다.</p>'+
  '<div class="tempo-fields">'+profile.map(({label,slot,seconds})=>'<label><span>'+label+'</span><select data-tempo-slot="'+slot+'" aria-label="'+label+' 시간">'+
   tempoOptions(slot).map(value=>'<option value="'+value+'" '+(value===seconds?'selected':'')+'>'+(!value?'없음':value+'초')+'</option>').join('')+'</select></label>').join('')+'</div>'+
  '<div class="tempo-actions">'+button('previewTempo','신호음 듣기')+'<label><input type="checkbox" data-setting="cues" '+(settings.cues?'checked':'')+'> 동작 이름도 읽기</label></div></section>';
}
function populateCountVoices(){
 const select=root.querySelector('[data-count-voice]');
 if(!select)return;
 const options=audio.countVoices();
 if(!options.some(({id})=>id===settings.countVoice))options.push({id:settings.countVoice,label:'저장한 음성 · 현재 사용 불가'});
 select.replaceChildren(...options.map(({id,label})=>new Option(label,id,false,id===settings.countVoice)));
 root.querySelector('#count-voice-description').textContent=audio.hasTrainerClips()?
  '남성 트레이너 AI 음성으로 1회부터 20회까지 읽습니다. 그 이후에는 기기의 한국어 음성으로 이어집니다.':
  '트레이너 톤은 낮고 또렷하게 카운트를 읽습니다. 음색은 기기의 한국어 음성에 따라 달라집니다.';
}
window.speechSynthesis?.addEventListener?.('voiceschanged',populateCountVoices);

function render(){
 if(!data)return;
 const session=data.active;
 const set=current(session);
 if(session||page!=='summary')summaryAd.update(null);
 root.dataset.view=session?'active':page;
 document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('selected',el.dataset.action===page));
 if(session){
  const phase=session.phase;
  const visiblePhase=phase==='paused'?session.previous:phase;
  const number=visiblePhase==='rest'?Math.ceil((phase==='paused'?session.remaining:Math.max(0,session.deadline-Date.now()))/1000):session.rep;
  const motion=visiblePhase==='count'&&session.motion?tempoPhases(set.exercise,set.tempo)[session.motion.index]:null;
  const primary={count:'카운트 멈추고 기록',target:'계획대로 세트 확정',answer:'실제 기록 확정',rest:'지금 다음 세트 시작',ready:'세트 시작',paused:'재개'}[phase];
  const preparing=phase==='ready'?(session.rests?'휴식 시간 종료':'운동 준비 완료'):labels[phase];
  root.innerHTML='<section class="session-heading"><div class="eyebrow">'+preparing+'</div><h1>'+exercises[set.exercise][0]+'</h1><p>'+weightLabel(set.exercise,set.weight)+' · '+set.number+'세트 · 목표 '+set.reps+'회</p></section>'+
   (phase==='answer'?'<div class="adjust-pair">'+adjuster('weight',draft.weight,set.exercise,'actual')+adjuster('reps',draft.reps,set.exercise,'actual')+'</div>':
   phase==='ready'?'<div class="ready-prompt card"><strong>이어폰의 ‘다음 곡’으로 시작</strong><p id="headset-status" role="status">'+headsetStatus+'</p></div>':
   '<div class="counter card"><strong id="counter">'+number+'</strong><small>'+(visiblePhase==='rest'?'남은 시간 · 초':'반복')+'</small>'+
   (motion?'<div class="motion-label">'+motion.label+'</div>':'')+'</div>')+
   '<div class="actions">'+button('primary',primary,'accent')+(phase==='target'?button('editActual','실제 기록 수정'):'')+
   (phase==='rest'||(phase==='ready'&&session.rests)?button('extendRest','휴식 +30초'):'')+
   (['count','rest'].includes(phase)?button('pause','일시정지'):'')+button('unlock','이어폰 다시 연결')+button('stop','중단')+'</div>';
  return;
 }
 if(page==='today'){
  const plan=plans[editPlan], item=plan.sets[editSet];
  const proposal=recommend(data.history,plan.exercise);
  const selectOption=(value,label,chosen)=>'<option value="'+value+'" '+(chosen?'selected':'')+'>'+label+'</option>';
  const routineOptions=Object.keys(routines).map(name=>selectOption(name,name,name===routine)).join('');
  const tabs=[['goal','목표'],['tempo','템포'],['voice','음성'],['rest','휴식']].map(([id,label])=>button('setup:'+id,label,id===setupTab?'selected':'')).join('');
  const selector='<div class="setup-top"><label>루틴 <select data-routine>'+routineOptions+'</select></label>'+
   '<label>종목 <select data-plan>'+plans.map((p,i)=>selectOption(i,exercises[p.exercise][0],i===editPlan)).join('')+'</select></label></div>';
  const fields='<div class="setup-top current-plan"><label><input type="checkbox" data-enable="'+editPlan+'" '+(plan.enabled?'checked':'')+'> 운동 포함</label>'+
   '<label>교체 <select aria-label="종목 교체" data-replace="'+editPlan+'">'+replacements(plan.exercise).map(key=>selectOption(key,exercises[key][0],key===plan.exercise)).join('')+'</select></label></div>'+
   '<div class="set-controls"><label>수정할 세트 <select data-target-set>'+plan.sets.map((_,i)=>selectOption(i,(i+1)+'세트',i===editSet)).join('')+'</select></label>'+
   '<div class="set-steps">'+button('setCount:-1','−')+'<span>총 '+plan.sets.length+'세트</span>'+button('setCount:1','＋')+'</div></div>';
  const goals=fields+'<div class="adjust-pair">'+adjuster('weight',item.weight,plan.exercise,'plan')+
   adjuster('reps',item.reps,plan.exercise,'plan')+'</div><div class="setup-extras">'+button('apply','남은 세트에 적용')+
   (proposal?button('setup:recommend','지난 추천'):'')+'</div>';
  const rest='<section class="card option-page"><h2>기본 휴식</h2><label><select data-setting="rest">'+[30,60,90,120].map(n=>selectOption(n,n+'초',n===settings.rest)).join('')+'</select></label>'+
   '<p>타이머가 끝나면 이어폰의 ‘다음 곡’ 신호를 기다립니다. 운동 화면에서 휴식을 30초씩 추가할 수 있습니다.</p>'+button('headphones','이어폰 버튼 확인')+'</section>';
  const voice='<section class="card count-voice"><h2>카운트 음성</h2><div class="count-voice-controls"><select data-count-voice aria-label="카운트 음성"></select>'+
   button('previewCount','미리 듣기')+'</div><p id="count-voice-description"></p></section>';
  const suggested=proposal?'<section class="card option-page"><h2>지난 기록 기준 추천</h2><strong>'+weightLabel(plan.exercise,proposal.weight)+' × '+proposal.reps+'회</strong><p>'+proposal.reason+'</p>'+
   button('propose','이 종목에 적용','accent')+'</section>':goals;
  const body={goal:goals,tempo:tempoSettings(plan.exercise),voice,rest,recommend:suggested}[setupTab];
  root.innerHTML=selector+'<div class="setup-tabs" aria-label="운동 설정">'+tabs+'</div>'+body+
   '<div class="actions setup-footer">'+button('start','운동 준비','accent')+'</div>';
  if(setupTab==='voice'){populateCountVoices();void audio.loadCountFiles().then(populateCountVoices);}
  return;
 }
 if(page==='summary'){
  const last=data.history.at(-1);
  const keys=[...new Set(last.sets.filter(x=>x.confirmed).map(x=>x.exercise))];
  const key=keys.includes(summaryExercise)?summaryExercise:keys[0];
  const hasWeights=keys.some(id=>exercises[id][2]!=='맨몸');
  const proposal=key&&recommend(data.history,key);
  const rows=key?last.sets.filter(x=>x.exercise===key&&x.confirmed):[];
  root.innerHTML='<section class="session-heading"><div class="eyebrow">'+last.date+'</div><h1>'+(last.phase==='done'?'운동 완료':'운동 중단')+'</h1></section>'+
   '<div class="card summary-total"><strong>'+last.sets.filter(x=>x.confirmed).length+'세트'+(hasWeights?' · '+total(last)+'kg':'')+'</strong><span>휴식 '+last.rests+'회</span></div>'+
   (key?'<section class="card option-page"><label>종목 <select data-summary>'+keys.map(id=>'<option value="'+id+'" '+(id===key?'selected':'')+'>'+exercises[id][0]+'</option>').join('')+'</select></label><p>'+
    rows.slice(0,4).map(x=>weightLabel(key,x.actualWeight)+' × '+x.actualReps+'회').join(' · ')+(rows.length>4?' 외 '+(rows.length-4)+'세트':'')+'</p>'+
    '<strong>다음 권장 '+weightLabel(key,proposal.weight)+' × '+proposal.reps+'회</strong><p>'+proposal.reason+'</p></section>':'')+
   '<div class="actions setup-footer">'+button('records','성장 기록 보기','accent')+'</div>';
  summaryAd.update(showAds&&last.phase==='done'?last.id:null);
  return;
 }
 if(page==='settings'){
  root.innerHTML='<h1>설정</h1><div class="card"><h2>음성 명령</h2><p>기능을 켜면 마이크를 사용합니다. 음성이 브라우저 음성 인식 서비스로 전송될 수 있습니다. 앱은 원본 음성을 저장하지 않습니다.</p>'+
   button('voice','음성 명령 켜기 / 끄기')+'</div><p>운동 기록은 이 브라우저 프로필에 저장됩니다. 사이트 데이터를 삭제하면 기록이 사라질 수 있습니다.</p>'+
   '<div class="card"><label><input type="checkbox" data-show-ads '+(showAds?'checked':'')+'> 완료 화면 광고 표시</label>'+
   '<p>화면에 여유가 있으면 카카오 애드핏 배너가 표시됩니다.</p></div>';
  return;
 }
 const weights=[...new Set(data.history.flatMap(s=>s.sets.filter(x=>x.confirmed&&x.exercise===filter).map(x=>x.actualWeight)))].sort((a,b)=>a-b);
 const weight=weights.includes(graphWeight)?graphWeight:weights.at(-1);
 const days=statistics(data.history,filter,weight).reverse();
 const chosenDay=days.find(d=>d.date===recordDay)??days[0];
 const body=exercises[filter][2]==='맨몸';
 const week=new Date();
 week.setDate(week.getDate()-(week.getDay()+6)%7);
 const weekdays=Array.from({length:7},(_,i)=>{const d=new Date(week);d.setDate(d.getDate()+i);return new Intl.DateTimeFormat('sv-SE').format(d);});
 const max=Math.max(1,...days.map(d=>body?d.totalReps:d.max));
 if(detail){
  const rows=data.history.filter(s=>s.date===detail.day).flatMap(s=>s.sets).filter(x=>x.confirmed&&x.exercise===filter);
  if(!detail.set&&rows.length)detail.set=editRecord(rows[0]);
  const edit=detail.set;
  root.innerHTML='<section class="session-heading"><div class="eyebrow">'+detail.day+'</div><h1>세트 원본</h1></section>'+
   '<label class="record-select">세트 <select data-past>'+rows.map((x,i)=>'<option value="'+x.id+'" '+(x.id===edit?.id?'selected':'')+'>'+(i+1)+'번째 · '+weightLabel(x.exercise,x.actualWeight)+' × '+x.actualReps+'회</option>').join('')+'</select></label>'+
   (edit?'<div class="adjust-pair">'+adjuster('weight',edit.weight,edit.exercise,'past')+adjuster('reps',edit.reps,edit.exercise,'past')+'</div>':'')+
   '<div class="actions setup-footer">'+(edit?button('savePast','수정 저장','accent'):'')+button('leavePast','성장 기록으로')+'</div>';
  return;
 }
 root.innerHTML='<h1>성장 기록</h1><div class="setup-top"><label>종목 <select data-filter>'+Object.entries(exercises).map(([key,x])=>'<option value="'+key+'" '+(key===filter?'selected':'')+'>'+x[0]+'</option>').join('')+'</select></label>'+
  (!body&&weights.length?'<label>반복 비교 <select data-weight>'+weights.map(w=>'<option '+(w===weight?'selected':'')+'>'+w+'</option>').join('')+'</select>kg</label>':'')+'</div>'+
  '<section class="card option-page"><h2>날짜별 '+(body?'반복':'최고 중량')+'</h2><p>'+(body?'총 '+days.reduce((n,d)=>n+d.totalReps,0)+'회':'총 운동량 '+days.reduce((n,d)=>n+d.volume,0)+'kg')+'</p>'+
  (chosenDay?'<label class="record-select">날짜 <select data-record-day>'+days.map(d=>'<option '+(d.date===chosenDay.date?'selected':'')+'>'+d.date+'</option>').join('')+'</select></label>'+
   '<meter max="'+max+'" value="'+(body?chosenDay.totalReps:chosenDay.max)+'"></meter><p>'+(body?chosenDay.totalReps+'회 · '+chosenDay.sets+'세트':chosenDay.max+'kg · '+chosenDay.reps+'회 · '+chosenDay.volume+'kg')+'</p>'+
   button('day:'+chosenDay.date,'세트 원본 보기'):'<p>확정된 세트가 없습니다.</p>')+'</section>'+
  '<section class="card option-page"><h2>이번 주 완료 세트</h2><div class="week">'+weekdays.map((day,i)=>'<div>'+['월','화','수','목','금','토','일'][i]+'<strong>'+data.history.filter(s=>s.date===day).reduce((n,s)=>n+s.sets.filter(x=>x.confirmed).length,0)+'</strong></div>').join('')+'</div></section>';
}
function editRecord(row){
 return {id:row.id,exercise:row.exercise,weight:row.actualWeight,reps:row.actualReps};
}
async function persist(next){
 const snapshot={...next,revision:data.revision+1};
 await save(snapshot);
 data=snapshot;
}
function clearTimers(){clearTimeout(timer);sequence++;}
function schedule(session,opening=''){
 const run=sequence;
 const valid=()=>run===sequence&&data.active;
 const later=(type,deadline)=>{
  const action={type,token:token(session)};
  timer=setTimeout(()=>{
   if(!valid())return;
   if(Date.now()<deadline){later(type,deadline);return;}
   void dispatch(action);
  },Math.max(0,deadline-Date.now()));
 };
 if(session.phase==='count'){
  const start=()=>{if(valid())later('tick',session.motion?.deadline??Date.now());};
  if(opening)audio.say(opening).then(start);
  else start();
 }
 if(session.phase==='rest')later('expire',session.deadline);
}
async function dispatch(action){
 if(!data?.active||busy)return;
 const before=data.active;
 let next=action.type==='editActual'&&before.phase==='target'?{...before,phase:'answer',version:before.version+1}:advance(before,action);
 if(next===before)return;
 const motionTick=action.type==='tick'&&next.phase==='count';
 if(!motionTick){
  clearTimers();
  audio.silence();
 }
 busy=true;
 try{
  const finished=['done','stopped'].includes(next.phase);
  await persist({...data,active:finished?null:next,history:finished?[...data.history,next]:data.history});
  if(finished){audio.run(false);page='summary';summaryExercise=null;render(); if(next.phase==='done')audio.say('운동 완료. '+next.sets.length+'세트를 마쳤습니다.');return;}
  const set=current(next);
  if(next.phase==='answer')draft={weight:set.weight,reps:Math.max(0,before.rep)};
  render();
  if(motionTick){
   const motion=tempoPhases(set.exercise,set.tempo)[next.motion.index];
   if(next.motion.index===0)void audio.count(next.rep,next.countVoice,next.cues?motion.label:'');
   else if(next.cues)void audio.say(motion.label);
   audio.cue(motion.slot);
   schedule(next);
   return;
  }
  if(next.phase==='rest'&&next.index!==before.index){
   const remaining=next.sets.length-next.index;
   audio.say(current(before).number+'세트 완료. '+remaining+'세트 남았습니다. 휴식을 시작합니다.');
  }
  if(next.phase==='ready')void audio.say('휴식 시간이 끝났습니다. 준비되면 다음 세트를 시작하세요.');
  if(next.phase==='answer')audio.say('몇 회 하셨나요?');
  const opening=next.phase==='count'&&before.phase!=='paused'?exercises[set.exercise][0]+' '+weightLabel(set.exercise,set.weight)+' '+set.number+'세트':'';
  schedule(next,opening);
 }catch(error){
  audio.run(false);
  notify('저장 실패 · '+error.message+' 새로고침해 기록을 확인하세요.');
 }finally{busy=false;}
}
function settleAdjuster(tile){
 const pending=adjustAnimations.get(tile);
 if(!pending)return;
 adjustAnimations.delete(tile);
 pending.sync();
 pending.animation.cancel();
}
function moveAdjuster(tile,direction,sync=()=>{}){
 const track=tile.querySelector('.swipe-track');
 const width=track.clientWidth;
 const offset=parseFloat(tile.style.getPropertyValue('--swipe-offset'))||0;
 tile.style.removeProperty('--swipe-offset');
 if(!width||reducedMotion.matches||(!direction&&!offset)){sync();return;}
 const animation=track.animate([
  {transform:'translate3d('+(-width+offset)+'px,0,0)'},
  {transform:'translate3d('+(-width*(1+direction))+'px,0,0)'}
 ],{duration:direction?220:170,easing:'cubic-bezier(.2,.72,.3,1)',fill:'forwards'});
 adjustAnimations.set(tile,{animation,sync});
 animation.onfinish=()=>{if(adjustAnimations.get(tile)?.animation===animation)settleAdjuster(tile);};
}
function delta(tile,direction){
 settleAdjuster(tile);
 const [scope,field]=tile.dataset.swipe.split(':');
 const plan=plans[editPlan];
 const state=scope==='plan'?plan.sets[editSet]:scope==='actual'?draft:detail.set;
 const key=scope==='plan'?plan.exercise:scope==='actual'?current(data.active).exercise:state.exercise;
 const next=adjustedValue(field,state[field],key,scope,direction);
 if(next===state[field]){moveAdjuster(tile,0);return;}
 const updated={...state,[field]:next};
 if(scope==='plan')plan.sets[editSet]=updated;
 else if(scope==='actual')draft=updated;
 else detail.set=updated;
 const values=readout(field,next,key,scope);
 tile.querySelector('.swipe-live').textContent=values[1];
 moveAdjuster(tile,direction,()=>{
  tile.querySelectorAll('[data-swipe-slot]').forEach((item,i)=>{item.textContent=values[i];});
 });
}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');
 if(!el||!data||busy)return;
 if(el.dataset.action.startsWith('delta:')&&event.detail&&Date.now()<swallowClickUntil)return;
 const [action,a,b,c]=el.dataset.action.split(':');
 if(['today','records','settings'].includes(action)){
  if(data.active){if(action==='settings')notify('운동 전에 설정에서 음성 명령을 켤 수 있습니다.');return;}
  page=action;
  if(action==='records')detail=null;
 }else if(action==='setup')setupTab=a;
 else if(action==='leavePast')detail=null;
 else if(action==='setCount'){
  const sets=plans[editPlan].sets;
  if(a==='1'&&sets.length<12)sets.push({...sets[0]});
  if(a==='-1'&&sets.length>1)sets.pop();
  editSet=Math.min(editSet,sets.length-1);
 }else if(action==='delta'){delta(el.closest('[data-swipe]'),Number(c));return;}
 else if(action==='apply'){
  const sets=plans[editPlan].sets;
  for(let i=editSet+1;i<sets.length;i++)sets[i]={...sets[editSet]};
 }else if(action==='propose'){
  const plan=plans[editPlan];
  const {weight,reps}=recommend(data.history,plan.exercise);
  plan.sets=plan.sets.map(()=>({weight,reps:Math.max(1,reps)}));
  setupTab='goal';
 }else if(action==='previewTempo')audio.preview();
 else if(action==='previewCount')void audio.previewCount(settings.countVoice);
 else if(action==='headphones')audio.check();
 else if(action==='voice')audio.voice();
 else if(action==='unlock')audio.unlock(data.active?.countVoice);
 else if(action==='start'){
  const included=plans.filter(p=>p.enabled).map(plan=>({...plan,tempo:exerciseTempos[plan.exercise]}));
  if(!included.length){notify('진행할 종목을 선택하세요.');return;}
  notify('');
  audio.silence();
  audio.unlock(settings.countVoice);
  busy=true;
  const session=createSession(included,{id:crypto.randomUUID(),date:today(),...settings});
  try{
   await persist({...data,active:session});
   audio.run(true);
   void audio.say('운동 준비가 끝났습니다. 이어폰의 다음 곡으로 시작하세요.');
  }catch(error){audio.run(false);notify('운동을 저장할 수 없습니다. '+error.message);}
  finally{busy=false;}
 }else if(action==='primary'){
  const phase=data.active.phase;
  if(phase==='paused'){audio.unlock(data.active.countVoice);return dispatch({type:'resume'});}
  return dispatch(phase==='answer'?{type:'actual',...draft}:{type:'next'});
 }else if(action==='stop'){if(confirm('운동을 중단할까요? 확정 세트는 보관됩니다.'))return dispatch({type:'stop'});}
 else if(['pause','editActual','extendRest'].includes(action))return dispatch({type:action});
 else if(action==='day')detail={day:a};
 else if(action==='savePast'){
  const {id,weight,reps}=detail.set;
  busy=true;
  try{await persist({...data,history:revise(data.history,id,weight,reps)});notify('수정한 기록을 저장했습니다.');}
  catch(error){notify('수정 저장 실패 · '+error.message);}
  finally{busy=false;}
 }
 render();
});
document.addEventListener('change',event=>{
 const el=event.target;
 if('showAds' in el.dataset){
  showAds=el.checked;
  try{localStorage.setItem(adsKey,showAds?'on':'off');}
  catch{notify('이번 접속 중에만 광고 설정을 적용합니다.');}
 }
 if('routine' in el.dataset)chooseRoutine(el.value);
 if('plan' in el.dataset){editPlan=Number(el.value);editSet=0;}
 if('targetSet' in el.dataset)editSet=Number(el.value);
 if('summary' in el.dataset)summaryExercise=el.value;
 if('recordDay' in el.dataset)recordDay=el.value;
 if('past' in el.dataset){
  const row=data.history.flatMap(s=>s.sets).find(x=>x.id===el.value&&x.confirmed);
  if(row)detail.set=editRecord(row);
 }
 if('enable' in el.dataset)plans[el.dataset.enable].enabled=el.checked;
 if('replace' in el.dataset){
  const plan=plans[el.dataset.replace];
  plan.exercise=el.value;
  plan.sets=plan.sets.map(s=>({...s,weight:el.value==='bench'?40:0}));
 }
 if(el.dataset.setting)settings[el.dataset.setting]=el.type==='checkbox'?el.checked:Number(el.value);
 if('countVoice' in el.dataset){
  settings.countVoice=normalizeCountVoice(el.value);
  try{localStorage.setItem(countVoiceKey,settings.countVoice);}
  catch{notify('이번 운동에는 음성을 적용합니다. 브라우저에 설정을 저장할 수 없습니다.');}
  return;
 }
 if('tempoSlot' in el.dataset){
  const key=plans[editPlan].exercise;
  const seconds=tempoProfile(key,exerciseTempos[key]).map(phase=>phase.seconds);
  seconds[Number(el.dataset.tempoSlot)]=Number(el.value);
  exerciseTempos[key]=seconds;
  try{localStorage.setItem(tempoKey,JSON.stringify(exerciseTempos));}
  catch{notify('이번 화면에서 템포를 적용했습니다. 브라우저가 설정 저장을 허용하지 않았습니다.');}
 }
 if('filter' in el.dataset){filter=el.value;detail=null;recordDay=null;graphWeight=null;}
 if('weight' in el.dataset)graphWeight=Number(el.value);
 render();
});
let pointer;
root.addEventListener('pointerdown',event=>{
 if(!event.isPrimary||event.button!==0||busy)return;
 swallowClickUntil=0;
 const tile=event.target.closest('[data-swipe]');
 if(tile){
  settleAdjuster(tile);
  const track=tile.querySelector('.swipe-track');
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,tile,width:track.clientWidth,slots:track.children,dragging:false};
 }
});
document.addEventListener('pointermove',event=>{
 if(pointer?.id!==event.pointerId)return;
 const x=event.clientX-pointer.x,y=event.clientY-pointer.y;
 if(!pointer.dragging){
  if(Math.abs(y)>12&&Math.abs(y)>Math.abs(x)){pointer=null;return;}
  if(Math.abs(x)<12||Math.abs(x)<Math.abs(y)*1.4)return;
  pointer.dragging=true;
  if(pointer.tile.isConnected)pointer.tile.setPointerCapture(event.pointerId);
 }
 if(reducedMotion.matches)return;
 const hasNeighbor=pointer.slots[x<0?2:0].textContent!=='';
 const limit=hasNeighbor?pointer.width:pointer.width*.16;
 const offset=hasNeighbor?x:x*.2;
 pointer.tile.style.setProperty('--swipe-offset',Math.max(-limit,Math.min(limit,offset))+'px');
});
function finishSwipe(event,commit){
 if(pointer?.id!==event.pointerId)return;
 const start=pointer;
 pointer=null;
 if(!start.tile.isConnected||!start.dragging)return;
 if(commit)swallowClickUntil=Date.now()+350;
 const direction=commit&&!busy?swipeDirection(event.clientX-start.x,event.clientY-start.y):0;
 if(direction)delta(start.tile,direction);
 else moveAdjuster(start.tile,0);
}
document.addEventListener('pointercancel',event=>finishSwipe(event,false));
document.addEventListener('pointerup',event=>finishSwipe(event,true));
document.addEventListener('lostpointercapture',event=>{if(pointer?.tile===event.target)finishSwipe(event,false);});
setInterval(()=>{
 if(data?.active?.phase==='rest'){
  const el=document.querySelector('#counter');
  if(el)el.textContent=Math.ceil(Math.max(0,data.active.deadline-Date.now())/1000);
 }
},250);
try{
 data=await load();
 const state=restored(data.active,Date.now());
 if(state!==data.active)await persist({...data,active:state});
 if(state){
  if(state.phase==='answer'){const set=current(state);draft={weight:set.weight,reps:state.rep};}
  audio.run(true);schedule(state);
 }
 render();
}catch(error){notify('기록 저장소를 열 수 없습니다. '+error.message);}

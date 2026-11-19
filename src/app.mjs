import {exercises,routines,replacements,current,token,createSession,advance,adjust,recommend,statistics,revise,restored,volume} from './core.mjs';
import {load,save} from './storage.mjs';
import {coach} from './audio.mjs';

const root=document.querySelector('main');
const status=document.querySelector('#status');
const notify=message=>{status.textContent=message;};
const audio=coach(dispatch,()=>token(data?.active),notify);
let data, page='today', routine='가슴만', selected=[], plans=[], editPlan=0, editSet=0;
let draft=null, detail=null, filter='bench', graphWeight=null, timer, countDue=0, pausedDelay=0, sequence=0, busy=false;
const settings={rest:60,tempo:3,cues:false};
const labels={count:'카운트 중',target:'목표 안내 완료',answer:'실제 기록 확인',rest:'휴식 중',ready:'다음 세트 준비',paused:'일시정지'};
const today=()=>new Intl.DateTimeFormat('sv-SE').format(new Date());
const weightLabel=(key,value)=>exercises[key][2]==='맨몸'?'맨몸':(exercises[key][3]==='한 손'?'한 손 ':'')+value+'kg';
const button=(action,label,style='')=>'<button class="'+style+'" data-action="'+action+'">'+label+'</button>';
const total=session=>session.sets.reduce((sum,set)=>sum+volume(set),0);
function chooseRoutine(value){
 routine=value;
 selected=[...routines[value]];
 // The first exercise is selected for the three-set MVP.
 plans=selected.map((exercise,index)=>({exercise,enabled:index===0,sets:Array.from({length:3},()=>({weight:exercise==='bench'?40:0,reps:10}))}));
 editPlan=editSet=0;
}
chooseRoutine(routine);
function adjuster(field,value,key,scope){
 if(field==='weight'&&exercises[key][5]===null)return '<div class="card">맨몸</div>';
 const weight=field==='weight';
 const label=weight?'무게':'횟수';
 return '<section class="adjust card" data-swipe="'+scope+':'+field+'"><small>'+label+'</small><div>'+
 button('delta:'+scope+':'+field+':-1','−')+'<strong>'+(weight?weightLabel(key,value):value+'회')+'</strong>'+
 button('delta:'+scope+':'+field+':1','＋')+'</div></section>';
}
function render(){
 if(!data)return;
 const session=data.active;
 const set=current(session);
 document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('selected',el.dataset.action===page));
 if(session){
  const phase=session.phase;
  const visiblePhase=phase==='paused'?session.previous:phase;
  const number=visiblePhase==='rest'?Math.ceil((phase==='paused'?session.remaining:Math.max(0,session.deadline-Date.now()))/1000):session.rep;
  const primary={count:'카운트 멈추고 기록',target:'계획대로 세트 확정',answer:'실제 기록 확정',rest:'휴식 끝 · 다음 세트 시작',ready:'세트 시작',paused:'재개'}[phase];
  root.innerHTML='<div class="eyebrow">'+labels[phase]+'</div><h1>'+exercises[set.exercise][0]+'</h1><p>'+weightLabel(set.exercise,set.weight)+' · '+set.number+'세트 · 목표 '+set.reps+'회</p>'+
   (phase==='answer'?adjuster('weight',draft.weight,set.exercise,'actual')+adjuster('reps',draft.reps,set.exercise,'actual'):
   '<div class="counter card"><strong id="counter">'+number+'</strong><small>'+(visiblePhase==='rest'?'남은 시간 · 초':'반복')+'</small></div>')+
   '<div class="actions">'+button('primary',primary,'accent')+(phase==='target'?button('editActual','실제 기록 수정'):'')+
   (['count','rest'].includes(phase)?button('pause','일시정지'):'')+button('unlock','오디오 활성화')+button('stop','운동 중단')+'</div>';
  return;
 }
 if(page==='today'){
  const plan=plans[editPlan];
  const item=plan.sets[editSet];
  const proposal=recommend(data.history,plan.exercise);
  root.innerHTML='<div class="eyebrow">오늘 운동</div><h1>루틴을 고르세요</h1><div class="chips">'+Object.keys(routines).map(name=>button('routine:'+name,name,name===routine?'selected':'')).join('')+'</div>'+
   '<section class="card routine">'+plans.map((p,i)=>'<div><label><input type="checkbox" data-enable="'+i+'" '+(p.enabled?'checked':'')+'> '+exercises[p.exercise][0]+'</label>'+
   '<select aria-label="종목 교체" data-replace="'+i+'">'+replacements(p.exercise).map(key=>'<option value="'+key+'" '+(key===p.exercise?'selected':'')+'>'+exercises[key][0]+'</option>').join('')+'</select>'+button('plan:'+i,'목표',i===editPlan?'selected':'')+'</div>').join('')+'</section>'+
   '<h2>'+exercises[plan.exercise][0]+' 목표</h2><div class="chips">'+button('setCount:-1','세트 −')+'<span>'+plan.sets.length+'세트</span>'+button('setCount:1','세트 ＋')+'</div>'+
   '<div class="chips">'+plan.sets.map((_,i)=>button('set:'+i,(i+1)+'세트',i===editSet?'selected':'')).join('')+'</div>'+
   adjuster('weight',item.weight,plan.exercise,'plan')+adjuster('reps',item.reps,plan.exercise,'plan')+
   '<div class="chips">'+button('apply','남은 세트에 적용')+(proposal?button('propose',weightLabel(plan.exercise,proposal.weight)+' × '+proposal.reps+'회 적용'):'')+'</div>'+
   (proposal?'<p>'+proposal.reason+'</p>':'')+
   '<div class="options"><label>휴식 <select data-setting="rest">'+[30,60,90,120].map(n=>'<option '+(n===settings.rest?'selected':'')+'>'+n+'</option>').join('')+'</select>초</label>'+
   '<label>템포 <select data-setting="tempo">'+[2,3,4,5].map(n=>'<option '+(n===settings.tempo?'selected':'')+'>'+n+'</option>').join('')+'</select>초</label>'+
   '<label><input type="checkbox" data-setting="cues" '+(settings.cues?'checked':'')+'> 동작도 읽기</label></div>'+
   '<div class="actions">'+button('start','운동 시작','accent')+button('headphones','이어폰 버튼 확인')+'</div>';
  return;
 }
 if(page==='summary'){
  const last=data.history.at(-1);
  const keys=[...new Set(last.sets.filter(x=>x.confirmed).map(x=>x.exercise))];
  const hasWeights=keys.some(key=>exercises[key][2]!=='맨몸');
  root.innerHTML='<div class="eyebrow">'+last.date+'</div><h1>'+(last.phase==='done'?'운동 완료':'운동 중단')+'</h1>'+
   '<div class="card"><strong>'+last.sets.filter(x=>x.confirmed).length+'세트'+(hasWeights?' · '+total(last)+'kg':'')+'</strong><p>휴식 '+last.rests+'회</p></div>'+
   keys.map(key=>{const proposal=recommend(data.history,key);return '<section class="card"><h2>'+exercises[key][0]+'</h2><p>'+
   last.sets.filter(x=>x.exercise===key&&x.confirmed).map(x=>weightLabel(key,x.actualWeight)+' × '+x.actualReps+'회').join(' · ')+'</p><p>다음 권장 '+weightLabel(key,proposal.weight)+' × '+proposal.reps+'회</p><p>'+proposal.reason+'</p></section>';}).join('')+button('records','성장 기록 보기','accent');
  return;
 }
 if(page==='settings'){
  root.innerHTML='<h1>설정</h1><div class="card"><h2>음성 명령</h2><p>기능을 켜면 마이크를 사용합니다. 음성이 브라우저 음성 인식 서비스로 전송될 수 있습니다. 앱은 원본 음성을 저장하지 않습니다.</p>'+
   button('voice','음성 명령 켜기 / 끄기')+'</div><p>운동 기록은 이 브라우저에 저장됩니다. 사이트 데이터를 삭제하면 기록이 사라질 수 있습니다.</p>';
  return;
 }
 const weights=[...new Set(data.history.flatMap(s=>s.sets.filter(x=>x.confirmed&&x.exercise===filter).map(x=>x.actualWeight)))].sort((a,b)=>a-b);
 const weight=weights.includes(graphWeight)?graphWeight:weights.at(-1);
 const days=statistics(data.history,filter,weight);
 const body=exercises[filter][2]==='맨몸';
 const week=new Date();
 week.setDate(week.getDate()-(week.getDay()+6)%7);
 const weekdays=Array.from({length:7},(_,i)=>{const d=new Date(week);d.setDate(d.getDate()+i);return new Intl.DateTimeFormat('sv-SE').format(d);});
 const max=Math.max(1,...days.map(d=>body?d.totalReps:d.max));
 const edit=detail?.set;
 root.innerHTML='<h1>성장 기록</h1><label>종목 <select data-filter>'+Object.entries(exercises).map(([key,x])=>'<option value="'+key+'" '+(key===filter?'selected':'')+'>'+x[0]+'</option>').join('')+'</select></label>'+
  (!body&&weights.length?'<label>반복 비교 <select data-weight>'+weights.map(w=>'<option '+(w===weight?'selected':'')+'>'+w+'</option>').join('')+'</select>kg</label>':'')+
  '<section class="card"><h2>날짜별 '+(body?'반복':'최고 중량')+'</h2><p>'+(body?'총 '+days.reduce((n,d)=>n+d.totalReps,0)+'회':'총 운동량 '+days.reduce((n,d)=>n+d.volume,0)+'kg')+'</p>'+
  (days.length?days.map(d=>'<div class="graph">'+button('day:'+d.date,d.date)+'<meter max="'+max+'" value="'+(body?d.totalReps:d.max)+'"></meter><span>'+(body?d.totalReps+'회 · '+d.sets+'세트':d.max+'kg · '+d.reps+'회 · '+d.volume+'kg')+'</span></div>').join(''):'<p>확정된 세트가 없습니다.</p>')+'</section>'+
  '<section class="card"><h2>이번 주 완료 세트</h2><div class="week">'+weekdays.map((day,i)=>'<div>'+['월','화','수','목','금','토','일'][i]+'<strong>'+data.history.filter(s=>s.date===day).reduce((n,s)=>n+s.sets.filter(x=>x.confirmed).length,0)+'</strong></div>').join('')+'</div></section>'+
  (detail?'<section class="card"><h2>'+detail.day+' 세트 원본</h2>'+data.history.filter(s=>s.date===detail.day).flatMap(s=>s.sets).filter(x=>x.confirmed&&x.exercise===filter).map(x=>button('past:'+x.id,x.number+'세트 · '+weightLabel(x.exercise,x.actualWeight)+' × '+x.actualReps+'회')).join('')+
   (edit?adjuster('weight',edit.weight,edit.exercise,'past')+adjuster('reps',edit.reps,edit.exercise,'past')+button('savePast','수정 저장','accent'):'')+'</section>':'');
}
async function persist(next){
 const snapshot={...next,revision:data.revision+1};
 await save(snapshot);
 data=snapshot;
}
function clearTimers(){clearTimeout(timer);sequence++;}
function schedule(session,delay=0,opening=''){
 const run=sequence;
 const valid=()=>run===sequence&&data.active;
 const later=(fn,ms)=>{countDue=Date.now()+ms;timer=setTimeout(()=>{if(valid())fn();},ms);};
 async function count(){
  if(!valid())return;
  const before=data.active;
  const now=current(before);
  await dispatch({type:'tick',token:token(before)});
  if(!valid()||data.active.rep===before.rep)return;
  const rep=data.active.rep;
  const began=Date.now();
  await audio.say(rep+'회'+(data.active.cues?' · '+exercises[now.exercise][6]:''));
  if(!valid())return;
  if(rep===now.reps)await dispatch({type:'countEnd',token:token(data.active)});
  else later(count,Math.max(0,began+session.tempo*1000-Date.now()));
 }
 if(session.phase==='count'){
  if(opening)audio.say(opening).then(()=>{if(valid())later(count,delay);});
  else later(count,delay);
 }
 if(session.phase==='rest')later(()=>dispatch({type:'expire',token:token(session)}),Math.max(0,session.deadline-Date.now()));
}
async function dispatch(action){
 if(!data?.active||busy)return;
 const before=data.active;
 let next=action.type==='editActual'&&before.phase==='target'?{...before,phase:'answer',version:before.version+1}:advance(before,action);
 if(next===before)return;
 const tick=action.type==='tick';
 if(!tick){
  if(action.type==='pause')pausedDelay=Math.max(0,countDue-Date.now());
  clearTimers();
  audio.silence();
 }
 busy=true;
 try{
  const finished=['done','stopped'].includes(next.phase);
  await persist({...data,active:finished?null:next,history:finished?[...data.history,next]:data.history});
  if(finished){audio.run(false);page='summary';render(); if(next.phase==='done')audio.say('운동 완료. '+next.sets.length+'세트를 마쳤습니다.');return;}
  const set=current(next);
  if(next.phase==='answer')draft={weight:set.weight,reps:Math.max(0,before.rep)};
  render();
  if(tick)return;
  if(next.phase==='rest'&&before.phase!=='paused'){
   const remaining=next.sets.length-next.index;
   audio.say(current(before).number+'세트 완료. '+remaining+'세트 남았습니다. 휴식을 시작합니다.');
  }
  if(next.phase==='ready')audio.say(set.number+'세트 준비');
  if(next.phase==='answer')audio.say('몇 회 하셨나요?');
  if(next.phase==='count'&&next.rep===set.reps){
   setTimeout(()=>dispatch({type:'countEnd',token:token(next)}),0);
  }else{
   const opening=next.phase==='count'&&before.phase!=='paused'?exercises[set.exercise][0]+' '+weightLabel(set.exercise,set.weight)+' '+set.number+'세트':'';
   schedule(next,before.phase==='paused'?pausedDelay:0,opening);
  }
 }catch(error){
  audio.run(false);
  notify('저장 실패 · '+error.message+' 새로고침해 기록을 확인하세요.');
 }finally{busy=false;}
}
function delta(scope,field,direction){
 const plan=plans[editPlan];
 if(scope==='plan')plan.sets[editSet]=adjust(plan.sets[editSet],field,direction,plan.exercise);
 if(scope==='actual')draft=field==='reps'?{...draft,reps:Math.max(0,Math.min(999,draft.reps+direction))}:adjust(draft,field,direction,current(data.active).exercise);
 if(scope==='past')detail.set=field==='reps'?{...detail.set,reps:Math.max(0,Math.min(999,detail.set.reps+direction))}:adjust(detail.set,field,direction,detail.set.exercise);
 render();
}
document.addEventListener('click',async event=>{
 const el=event.target.closest('[data-action]');
 if(!el||!data||busy)return;
 const [action,a,b,c]=el.dataset.action.split(':');
 if(['today','records','settings'].includes(action)){
  if(data.active){if(action==='settings')notify('운동 전에 설정에서 음성 명령을 켤 수 있습니다.');return;}
  page=action;
 }else if(action==='routine')chooseRoutine(a);
 else if(action==='plan'){editPlan=Number(a);editSet=0;}
 else if(action==='set')editSet=Number(a);
 else if(action==='setCount'){
  const sets=plans[editPlan].sets;
  if(a==='1'&&sets.length<12)sets.push({...sets[0]});
  if(a==='-1'&&sets.length>1)sets.pop();
  editSet=Math.min(editSet,sets.length-1);
 }else if(action==='delta'){delta(a,b,Number(c));return;}
 else if(action==='apply'){
  const sets=plans[editPlan].sets;
  for(let i=editSet+1;i<sets.length;i++)sets[i]={...sets[editSet]};
 }else if(action==='propose'){
  const plan=plans[editPlan];
  const {weight,reps}=recommend(data.history,plan.exercise);
  plan.sets=plan.sets.map(()=>({weight,reps:Math.max(1,reps)}));
 }else if(action==='headphones')audio.check();
 else if(action==='voice')audio.voice();
 else if(action==='unlock')audio.unlock();
 else if(action==='start'){
  const included=plans.filter(p=>p.enabled);
  if(!included.length){notify('진행할 종목을 선택하세요.');return;}
  audio.unlock();
  busy=true;
  const session=createSession(included,{id:crypto.randomUUID(),date:today(),...settings});
  try{
   await persist({...data,active:session});
   audio.run(true);
   const set=current(session);
   schedule(session,0,exercises[set.exercise][0]+' '+weightLabel(set.exercise,set.weight)+' '+set.number+'세트');
  }catch(error){audio.run(false);notify('운동을 저장할 수 없습니다. '+error.message);}
  finally{busy=false;}
 }else if(action==='primary'){
  const phase=data.active.phase;
  if(phase==='paused'){audio.unlock();return dispatch({type:'resume'});}
  return dispatch(phase==='answer'?{type:'actual',...draft}:{type:'next'});
 }else if(action==='stop'){if(confirm('운동을 중단할까요? 확정 세트는 보관됩니다.'))return dispatch({type:'stop'});}
 else if(['pause','editActual'].includes(action))return dispatch({type:action});
 else if(action==='day')detail={day:a};
 else if(action==='past'){
  const row=data.history.flatMap(s=>s.sets).find(x=>x.id===a&&x.confirmed);
  detail.set={id:row.id,exercise:row.exercise,weight:row.actualWeight,reps:row.actualReps};
 }else if(action==='savePast'){
  const {id,weight,reps}=detail.set;
  busy=true;
  try{await persist({...data,history:revise(data.history,id,weight,reps)});detail.set=null;notify('수정한 기록을 저장했습니다.');}
  catch(error){notify('수정 저장 실패 · '+error.message);}
  finally{busy=false;}
 }
 render();
});
document.addEventListener('change',event=>{
 const el=event.target;
 if('enable' in el.dataset)plans[el.dataset.enable].enabled=el.checked;
 if('replace' in el.dataset){
  const plan=plans[el.dataset.replace];
  plan.exercise=el.value;
  plan.sets=plan.sets.map(s=>({...s,weight:el.value==='bench'?40:0}));
 }
 if(el.dataset.setting)settings[el.dataset.setting]=el.type==='checkbox'?el.checked:Number(el.value);
 if('filter' in el.dataset){filter=el.value;detail=null;graphWeight=null;}
 if('weight' in el.dataset)graphWeight=Number(el.value);
 render();
});
let pointer;
root.addEventListener('pointerdown',event=>{
 const tile=event.target.closest('[data-swipe]');
 if(tile)pointer={id:event.pointerId,x:event.clientX,y:event.clientY,type:tile.dataset.swipe};
});
root.addEventListener('pointercancel',()=>{pointer=null;});
root.addEventListener('pointerup',event=>{
 const start=pointer;
 pointer=null;
 if(!start||start.id!==event.pointerId)return;
 const x=event.clientX-start.x,y=event.clientY-start.y;
 if(Math.abs(x)<36||Math.abs(x)<Math.abs(y)*1.4)return;
 const [scope,field]=start.type.split(':');
 delta(scope,field,Math.sign(x));
},true);
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

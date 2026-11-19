export const exercises = {
 bench: ['벤치프레스','가슴','바벨','양손 합계',1,2.5,'수평 밀기'],
 press: ['머신 체스트 프레스','가슴','머신','표시 중량',1,5,'수평 밀기'],
 incline: ['인클라인 덤벨 프레스','가슴','덤벨','한 손',2,2,'상향 밀기'],
 inclineMachine: ['인클라인 머신 프레스','가슴','머신','표시 중량',1,5,'상향 밀기'],
 fly: ['케이블 플라이','가슴','케이블','한 손',2,2.5,'모으기'],
 pec: ['펙덱 플라이','가슴','머신','표시 중량',1,5,'모으기'],
 triceps: ['케이블 푸시다운','삼두','케이블','표시 중량',1,2.5,'팔 펴기'],
 extension: ['덤벨 트라이셉스 익스텐션','삼두','덤벨','양손 합계',1,2,'팔 펴기'],
 row: ['시티드 케이블 로우','등','케이블','표시 중량',1,5,'당기기'],
 dumbrow: ['덤벨 로우','등','덤벨','한 손',2,2,'당기기'],
 curl: ['덤벨 컬','이두','덤벨','한 손',2,2,'팔 굽히기'],
 cablecurl: ['케이블 컬','이두','케이블','표시 중량',1,2.5,'팔 굽히기'],
 squat: ['스쿼트','하체','바벨','양손 합계',1,2.5,'앉았다 일어서기'],
 body: ['맨몸 스쿼트','하체','맨몸','맨몸',1,null,'앉았다 일어서기'],
 shoulder: ['덤벨 숄더 프레스','어깨','덤벨','한 손',2,2,'머리 위로 밀기'],
 shoulderMachine: ['머신 숄더 프레스','어깨','머신','표시 중량',1,5,'머리 위로 밀기']
};
export const routines = {'가슴만':['bench','incline','fly'],'가슴·삼두':['bench','triceps'],'등·이두':['row','curl'],'하체':['squat'],'어깨':['shoulder']};
export const replacements = key => Object.keys(exercises).filter(id => exercises[id][1]===exercises[key][1] && exercises[id][6]===exercises[key][6]);
export const current = session => session?.sets[session.index];
export const token = session => session && [session.id,current(session)?.id,session.phase,session.version].join('/');
export function createSession(plans, {id,date,rest=60,tempo=3,cues=false}) {
 return {id,date,rest,tempo,cues,phase:'count',index:0,rep:0,version:0,rests:0,sets:plans.flatMap(({exercise,sets})=>sets.map(({weight,reps},i)=>({exercise,number:i+1,weight,reps}))).map((set,i)=>({...set,id:id+'/'+i}))};
}
export function advance(s, action, now=Date.now()) {
 if (!s || (action.token && action.token!==token(s)) || ['done','stopped'].includes(s.phase)) return s;
 const set=current(s);
 const change=(phase,fields={})=>({...s,...fields,phase,version:s.version+1});
 if(action.type==='stop') return change('stopped');
 if(action.type==='pause' && ['count','rest'].includes(s.phase)) return change('paused',{previous:s.phase,remaining:s.phase==='rest'?Math.max(0,s.deadline-now):null,deadline:null});
 if(action.type==='resume' && s.phase==='paused') return change(s.previous,{deadline:s.previous==='rest'?now+s.remaining:null,remaining:null});
 if(s.phase==='paused') return s;
 if(action.type==='tick' && s.phase==='count' && s.rep<set.reps) return {...s,rep:s.rep+1};
 if(action.type==='countEnd' && s.phase==='count' && s.rep===set.reps) return change('target');
 if(action.type==='expire' && s.phase==='rest' && now>=s.deadline) return change('ready',{deadline:null});
 if(action.type==='restEnd' && s.phase!=='rest') return s;
 if(action.type==='next' || action.type==='restEnd'){
  if(s.phase==='ready' || s.phase==='rest'){
   if(now<(s.guardUntil??0)) return s;
   return change('count',{rep:0,deadline:null});
  }
  if(s.phase==='count') return change('answer');
 }
 const actual=action.type==='actual' && ['count','target','answer'].includes(s.phase);
 if(!actual && !(action.type==='next' && s.phase==='target')) return s;
 const reps=actual?action.reps:set.reps;
 const weight=actual?(action.weight??set.weight):set.weight;
 if(!Number.isInteger(reps)||reps<0||reps>999||!Number.isFinite(weight)||weight<0) return s;
 const sets=s.sets.map(item=>item.id===set.id?{...item,actualReps:reps,actualWeight:weight,confirmed:true}:item);
 return s.index+1===sets.length ? change('done',{sets}) : change('rest',{sets,index:s.index+1,rests:s.rests+1,deadline:now+s.rest*1000,guardUntil:now+900});
}
export function parseVoice(input) {
 const phrase=input.replace(/[\s.!?。]/g,'');
 if(phrase==='다음') return {type:'next'};
 if(phrase==='휴식끝') return {type:'restEnd'};
 const match=phrase.match(/^(\d{1,3}|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|팔)회완료$/);
 if(match) return {type:'actual',reps:/^\d+$/.test(match[1])?Number(match[1]):({한:1,두:2,세:3,네:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,팔:8})[match[1]]};
}
export const volume = set => set.confirmed && exercises[set.exercise][2]!=='맨몸' ? set.actualWeight*set.actualReps*exercises[set.exercise][4] : 0;
export function recommend(history,key) {
 const recent=history.filter(s=>s.sets.some(x=>x.exercise===key&&x.confirmed)).slice(-2);
 if(!recent.length) return null;
 const latest=recent.at(-1);
 const sets=latest.sets.filter(x=>x.exercise===key);
 const last=sets.findLast(x=>x.confirmed);
 const comparable=sets.every(x=>x.weight===last.weight&&x.reps===last.reps&&x.confirmed)&&latest.phase==='done';
 const step=exercises[key][5];
 const success=recent.length===2&&recent.every(s=>{
  const rows=s.sets.filter(x=>x.exercise===key);
  return s.phase==='done'&&rows.length===sets.length&&rows.every(x=>x.confirmed&&x.weight===last.weight&&x.reps===last.reps&&x.actualWeight===x.weight&&x.actualReps>=x.reps);
 });
 if(comparable&&step&&success) return {weight:last.weight+step,reps:Math.max(1,last.reps-2),reason:'직전 두 세션에서 동일 목표를 달성했습니다.'};
 if(!comparable||!step) return {weight:last.actualWeight,reps:last.actualReps,reason:'증량 보류 · 마지막 확정 기록'};
 return {weight:last.weight,reps:last.reps,reason:'목표 유지 · 지난 마지막 세트 '+last.actualReps+'회'};
}
export function statistics(history,key,weight) {
 const days=new Map();
 for(const session of history) for(const set of session.sets){
  if(!set.confirmed||set.exercise!==key) continue;
  const day=days.get(session.date)??{date:session.date,max:0,reps:0,totalReps:0,volume:0,sets:0};
  day.max=Math.max(day.max,set.actualWeight);
  if(set.actualWeight===weight) day.reps=Math.max(day.reps,set.actualReps);
  day.totalReps+=set.actualReps;
  day.volume+=volume(set);
  day.sets++;
  days.set(session.date,day);
 }
 return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function revise(history,id,weight,reps){
 if(!Number.isFinite(weight)||weight<0||!Number.isInteger(reps)||reps<0||reps>999) return history;
 return history.map(s=>({...s,sets:s.sets.map(x=>x.id===id&&x.confirmed?{...x,actualWeight:weight,actualReps:reps}:x)}));
}
export function adjust(set,field,direction,exercise){
 const step=field==='weight'?exercises[exercise][5]:1;
 const min=field==='reps'?1:0;
 return step?{...set,[field]:Math.max(min,Math.min(999,Math.round((set[field]+step*direction)*100)/100))}:set;
}
export function restored(session,now){
 if(session?.phase==='rest') return advance(session,{type:'expire'},now);
 if(session?.phase==='count') return advance(session,{type:'pause'},now);
 return session;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {createSession,advance,token,restored,volume,recommend,statistics,revise,parseVoice,replacements,adjust} from './core.mjs';
import {swipeDirection,tempoPhases,tempoProfile} from './tempo.mjs';
const prepare=(id='a',date='2026-11-18',exercise='bench')=>createSession([{exercise,sets:Array.from({length:3},()=>({weight:40,reps:10}))}],{id,date});
const make=(...input)=>advance(prepare(...input),{type:'next'},0);
test('a workout snapshots the selected count voice and defaults to trainer for older settings',()=>{
 const settings={id:'voice',date:'2026-11-18',countVoice:'browser:korean-device'};
 const session=createSession([{exercise:'bench',sets:[{weight:40,reps:10}]}],settings);
 settings.countVoice='standard';
 assert.equal(session.countVoice,'browser:korean-device');
 assert.equal(make().countVoice,'trainer');
});
const pulse=(s,now=s.motion?.deadline??0)=>advance(s,{type:'tick'},now);
const count=s=>{
 while(s.phase==='count')s=pulse(s);
 return s;
};
const complete=(s,last=10)=>{
 s=advance(count(s),{type:'next'},0);
 s=advance(s,{type:'next'},1000);
 s=advance(count(s),{type:'next'},2000);
 s=advance(s,{type:'expire'},62000);
 assert.equal(s.phase,'ready');
 s=advance(s,{type:'next'},63000);
 return advance(count(s),{type:'actual',reps:last},64000);
};
test('target count never saves or starts rest without explicit input',()=>{
 const s=count(make());
 assert.equal(advance(s,{type:'expire'},15000),s);
 assert.equal(s.sets.filter(x=>x.confirmed).length,0);
 assert.equal(s.rests,0);
});
test('three sets, early and natural rest, one terminal state',()=>{
 const s=complete(make());
 assert.equal(s.rests,2);
 assert.deepEqual(s.sets.map(x=>x.actualReps),[10,10,10]);
 assert.equal(s.phase,'done');
 assert.equal(advance(s,{type:'next'}),s);
});
test('actual final repetitions yield 1120 kg',()=>{
 const s=complete(make(),8);
 assert.deepEqual(s.sets.map(x=>x.actualReps),[10,10,8]);
 assert.equal(s.sets.reduce((n,x)=>n+volume(x),0),1120);
});
test('next during count opens answer and cannot confirm',()=>{
 let s=advance(make(),{type:'next'},0);
 assert.equal(s.phase,'answer');
 assert.equal(advance(s,{type:'next'},2000),s);
 s=advance(s,parseVoice('여덟 회 완료'),2000);
 assert.equal(s.sets[0].actualReps,8);
});
test('simultaneous and stale completions cannot skip rest',()=>{
 const s=count(make());
 const rest=advance(s,{type:'next',token:token(s)},0);
 assert.equal(advance(rest,{type:'next'},30),rest);
 assert.equal(advance(rest,{type:'next',token:token(s)},3000),rest);
 assert.equal(advance(rest,{type:'actual',reps:8},3000),rest);
});
test('pause at rep three and restore remaining rest',()=>{
 let s=make();
 while(s.rep<3)s=pulse(s);
 s=restored(s,s.motion.deadline-1000);
 assert.equal(s.phase,'paused');
 assert.equal(advance(s,{type:'next'},20),s);
 s=advance(s,{type:'resume'},50);
 assert.equal(s.motion.deadline,1050);
 while(s.rep<4)s=pulse(s);
 assert.equal(s.rep,4);
 const rest=advance(count(s),{type:'next'},0);
 const paused=advance(rest,{type:'pause'},20000);
 assert.equal(paused.remaining,40000);
 assert.equal(restored(paused,90000),paused);
 assert.equal(restored(rest,50000).deadline,60000);
 assert.equal(restored(rest,60001).phase,'ready');
 assert.equal(advance(paused,{type:'resume'},90000).deadline,130000);
});
test('stopped sessions retain confirmed sets and withhold progression',()=>{
 const rest=advance(count(make()),{type:'next'},100);
 const stopped=advance(rest,{type:'stop'},200);
 assert.equal(stopped.sets.filter(s=>s.confirmed).length,1);
 assert.match(recommend([stopped],'bench').reason,/증량 보류/);
});
test('second set changes independently',()=>{
 const s=make();
 s.sets[1]=adjust(adjust(s.sets[1],'weight',1,'bench'),'reps',-1,'bench');
 assert.deepEqual(s.sets.map(x=>[x.weight,x.reps]),[[40,10],[42.5,9],[40,10]]);
});
test('progression and edits recalculate volume and recommendation',()=>{
 const a=complete(make()), b=complete(make('b','2026-11-19'));
 assert.equal(recommend([],'bench'),null);
 assert.equal(recommend([a,b],'bench').weight,42.5);
 assert.equal(recommend([a,b],'bench').reps,8);
 const history=revise([a,b],b.sets[2].id,40,8);
 assert.deepEqual(statistics(history,'bench',40).map(d=>d.volume),[1200,1120]);
 assert.equal(recommend(history,'bench').weight,40);
 assert.equal(recommend(history,'bench').reps,10);
 assert.match(recommend(history,'bench').reason,/8회/);
 assert.equal(recommend(history,'press'),null);
});
test('daily aggregation uses actual and confirmed values only',()=>{
 const s=make();
 Object.assign(s.sets[0],{confirmed:true,actualWeight:40,actualReps:10});
 Object.assign(s.sets[1],{confirmed:true,actualWeight:42.5,actualReps:6});
 assert.deepEqual(statistics([s],'bench',40)[0],{date:s.date,max:42.5,reps:10,totalReps:16,volume:655,sets:2});
 assert.equal(volume({exercise:'incline',confirmed:true,actualWeight:10,actualReps:8}),160);
 assert.equal(volume({exercise:'body',confirmed:true,actualWeight:0,actualReps:8}),0);
});
test('replacement role and Korean commands',()=>{
 assert.deepEqual(replacements('bench'),['bench','press']);
 assert.deepEqual(parseVoice('다음'),{type:'next'});
 assert.deepEqual(parseVoice('휴식 끝'),{type:'restEnd'});
 assert.deepEqual(parseVoice('8회 완료'),{type:'actual',reps:8});
 assert.equal(parseVoice('1세트 완료. 2세트 남았습니다'),undefined);
});
test('exercise profiles order the lifts differently and snapshot overrides',()=>{
 assert.deepEqual(tempoPhases('bench').map(x=>[x.label,x.seconds]),[['내리기',3],['아래에서 멈춤',1],['밀기',1]]);
 assert.deepEqual(tempoPhases('row').map(x=>[x.label,x.seconds]),[['당기기',1],['당긴 채 멈춤',1],['팔 펴기',2]]);
 assert.notDeepEqual(tempoPhases('bench'),tempoPhases('row'));
 const seconds=[2,0,0.5,0];
 const session=createSession([{exercise:'bench',sets:[{weight:40,reps:1}],tempo:seconds},{exercise:'row',sets:[{weight:25,reps:1}]}],{id:'tempo',date:'2026-11-19'});
 seconds[0]=8;
 assert.deepEqual(session.sets.map(set=>set.tempo),[[2,0,0.5,0],[1,1,2,0]]);
 assert.equal(tempoProfile('body',[0,-1,'1',9])[0].seconds,2);
});
test('motion deadlines skip disabled holds and do not advance before the last phase ends',()=>{
 let s=createSession([{exercise:'bench',sets:[{weight:40,reps:1}],tempo:[3,0,1,0]}],{id:'tempo',date:'2026-11-19'});
 s=advance(s,{type:'next'},90);
 s=pulse(s,100);
 assert.deepEqual(s.motion,{index:0,deadline:3100});
 assert.equal(pulse(s,3099),s);
 s=pulse(s,3100);
 assert.deepEqual(s.motion,{index:1,deadline:4100});
 assert.equal(s.rep,1);
 assert.equal(pulse(s,4099),s);
 s=pulse(s,4100);
 assert.equal(s.phase,'target');
 assert.equal(s.sets[0].confirmed,undefined);
});
test('a delayed cue starts only a single phase and pause preserves its remaining time',()=>{
 let s=pulse(make(),100);
 s=pulse(s,10000);
 assert.deepEqual(s.motion,{index:1,deadline:11000});
 s=restored(s,10400);
 assert.equal(s.remaining,600);
 assert.equal(s.motion.index,1);
 s=advance(s,{type:'resume'},20000);
 assert.equal(pulse(s,20599),s);
 s=pulse(s,20600);
 assert.equal(s.motion.index,2);
 assert.equal(s.rep,1);
});
test('a left swipe increases, a right swipe decreases, and vertical swipes do nothing',()=>{
 assert.equal(swipeDirection(120,5),-1);
 assert.equal(swipeDirection(-70,10),1);
 assert.equal(swipeDirection(18,4),0);
 assert.equal(swipeDirection(55,70),0);
});
test('starting a session primes the first set and waits for a start command',()=>{
 const s=prepare();
 assert.equal(s.phase,'ready');
 assert.equal(s.rep,0);
 assert.equal(pulse(s,15000),s);
 assert.equal(advance(s,{type:'expire'},15000),s);
 assert.equal(advance(s,{type:'next'},15000).phase,'count');
});
test('rest can be lengthened during or after its timer without starting a set',()=>{
 const first=advance(count(make()),{type:'next'},1000);
 const extra=advance(first,{type:'extendRest'},3000);
 assert.equal(extra.deadline,91000);
 assert.equal(extra.rests,1);
 assert.equal(advance(extra,{type:'expire'},61000),extra);
 const ready=advance(extra,{type:'expire'},91000);
 assert.equal(ready.phase,'ready');
 assert.equal(pulse(ready,100000),ready);
 const more=advance(ready,{type:'extendRest'},101000);
 assert.equal(more.deadline,131000);
 assert.equal(more.rests,1);
 assert.equal(advance(more,{type:'next'},102000).phase,'count');
});

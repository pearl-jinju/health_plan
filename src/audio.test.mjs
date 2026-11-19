import assert from 'node:assert/strict';
import test from 'node:test';
import {coach} from './audio.mjs';

async function withBrowser(run) {
 const cues=[];
 const commands=[];
 const messages=[];
 const handlers=new Map();
 const utterances=[];
 const recognizers=[];
 let resumeCalls=0;
 let carrierPlayCalls=0;
 let speechCancelCalls=0;
 class AudioContext {
  state='suspended';
  currentTime=4;
  destination={};
  resume(){
   resumeCalls++;
   this.state='running';
   return Promise.resolve();
  }
  createOscillator(){
   const oscillator={
    frequency:{value:0},
    stops:[],
    connect(){},
    disconnect(){},
    start(when){this.started=when;},
    stop(when){this.stops.push(when);}
   };
   cues.push(oscillator);
   return oscillator;
  }
  createGain(){
   return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};
  }
 }
 const carrier={
  paused:true,
  addEventListener(){},
  play(){this.paused=false;carrierPlayCalls++;return Promise.resolve();},
  pause(){this.paused=true;}
 };
 const values={
  window:{
   AudioContext,
   SpeechRecognition:class {
    start(){recognizers.push(this);}
    abort(){this.stopped=true;}
   },
   SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
   speechSynthesis:{
    getVoices:()=>[{lang:'ko-KR'}],
    speak:utterance=>utterances.push(utterance),
    cancel:()=>{speechCancelCalls++;}
   }
  },
  document:{querySelector:()=>carrier,addEventListener(){},visibilityState:'visible'},
  navigator:{mediaSession:{setActionHandler:(type,handler)=>handlers.set(type,handler)}}
 };
 const globals=Object.entries(values).map(([name,value])=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,value});
  return [name,previous];
 });
 try{
  const audio=coach(action=>commands.push(action),()=>null,message=>messages.push(message));
  await run({
   audio,cues,commands,messages,handlers,utterances,recognizers,
   get resumeCalls(){return resumeCalls;},
   get carrierPlayCalls(){return carrierPlayCalls;},
   get speechCancelCalls(){return speechCancelCalls;}
  });
 }finally{
  for(const [name,previous] of globals){
   if(previous)Object.defineProperty(globalThis,name,previous);
   else delete globalThis[name];
  }
 }
}

test('preview unlocks cue playback without playing the media carrier',async()=>{
 await withBrowser(async browser=>{
  const result=browser.audio.preview();
  assert.equal(browser.resumeCalls,1);
  assert.equal(await result,true);
  assert.equal(browser.cues.length,1);
  assert.ok(browser.cues[0].frequency.value>0);
  assert.equal(browser.carrierPlayCalls,0);
 });
});

test('workout unlock preserves media actions and provides four distinct tempo cues',async()=>{
 await withBrowser(async browser=>{
  assert.equal(browser.audio.cue(0),false);
  browser.audio.unlock();
  browser.audio.run(true);
  assert.equal(browser.carrierPlayCalls,1);
  for(let i=0;i<4;i++)assert.equal(browser.audio.cue(i),true);
  assert.equal(new Set(browser.cues.map(cue=>cue.frequency.value)).size,4);
  assert.ok(browser.cues.every(cue=>cue.stops[0]>cue.started));
  browser.handlers.get('nexttrack')();
  browser.handlers.get('pause')();
  browser.handlers.get('play')();
  assert.deepEqual(browser.commands,[{type:'next'},{type:'pause'},{type:'resume'}]);
  browser.audio.run(false);
 });
});

test('a spoken cue can overlap a tone and silence cancels both immediately',async()=>{
 await withBrowser(async browser=>{
  browser.audio.unlock();
  browser.audio.cue(0);
  const tone=browser.cues[0];
  const speaking=browser.audio.say('1회');
  assert.equal(tone.stops.length,1);
  assert.equal(browser.utterances[0].text,'1회');
  browser.audio.silence();
  await speaking;
  assert.equal(browser.speechCancelCalls,1);
  assert.deepEqual(tone.stops,[4.12,undefined]);
 });
});

test('tempo tones allow ongoing voice recognition; spoken guidance suppresses late results',async()=>{
 await withBrowser(async browser=>{
  browser.audio.unlock();
  browser.audio.run(true);
  browser.audio.voice();
  const recognition=browser.recognizers[0];
  const result={0:{transcript:'다음'},isFinal:true};
  browser.audio.cue(0);
  assert.equal(recognition.stopped,undefined);
  recognition.onresult({resultIndex:0,results:[result]});
  assert.deepEqual(browser.commands,[{type:'next',token:null}]);
  const speaking=browser.audio.say('1회');
  assert.equal(recognition.stopped,true);
  recognition.onresult({resultIndex:0,results:[result]});
  assert.equal(browser.commands.length,1);
  browser.audio.run(false);
  await speaking;
 });
});

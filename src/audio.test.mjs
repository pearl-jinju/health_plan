import assert from 'node:assert/strict';
import test from 'node:test';
import {coach} from './audio.mjs';
import {countVoiceOptions,countVoiceProfile,countWords} from './count-voice.mjs';

const standardVoice={lang:'ko-KR',voiceURI:'ko-default',name:'한국어 표준',default:true};
const maleVoice={lang:'ko-KR',voiceURI:'ko-KR-InJoonNeural',name:'Microsoft InJoon Online (Natural) - Korean (Korea)'};

async function withBrowser(run,{voices=[standardVoice,maleVoice],clips=[]}={}) {
 const cues=[];
 const sources=[];
 const commands=[];
 const messages=[];
 const statuses=[];
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
  async decodeAudioData(bytes){return {bytes};}
  createBufferSource(){
   const source={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};
   sources.push(source);
   return source;
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
   fetch:async url=>url.pathname.endsWith('/manifest.json')?{ok:true,json:async()=>clips}:{ok:true,arrayBuffer:async()=>url.pathname.split('/').at(-1)},
   SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
   speechSynthesis:{
    getVoices:()=>voices,
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
  const audio=coach(action=>commands.push(action),()=>null,message=>messages.push(message),message=>statuses.push(message));
  await run({
   audio,cues,sources,commands,messages,statuses,handlers,utterances,recognizers,carrier,document:values.document,mediaSession:values.navigator.mediaSession,
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
test('a delivered next key works after media pauses and background next never advances',async()=>{
 await withBrowser(async browser=>{
  browser.audio.run(true);
  assert.equal(await browser.audio.unlock(),true);
  assert.equal(browser.mediaSession.playbackState,'playing');
  browser.carrier.pause();
  browser.handlers.get('nexttrack')();
  assert.deepEqual(browser.commands,[{type:'next'}]);
  assert.match(browser.statuses.at(-1),/다음 곡 신호를 받았습니다/);
  browser.document.visibilityState='hidden';
  browser.handlers.get('nexttrack')();
  assert.equal(browser.commands.length,1);
  browser.audio.run(false);
  assert.equal(browser.mediaSession.playbackState,'none');
 });
});
test('headset test distinguishes play and pause from next without advancing a workout',async()=>{
 await withBrowser(async browser=>{
  browser.audio.check();
  assert.match(browser.messages.at(-1),/다음 곡 동작/);
  browser.handlers.get('play')();
  assert.match(browser.messages.at(-1),/^재생 신호/);
  browser.handlers.get('pause')();
  assert.match(browser.messages.at(-1),/^일시정지 신호/);
  browser.handlers.get('nexttrack')();
  assert.match(browser.messages.at(-1),/^다음 곡 신호/);
  assert.equal(browser.carrier.paused,true);
  assert.deepEqual(browser.commands,[]);
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

test('rep counts use native Korean words through 99 and spoken Korean numbers up to 999',()=>{
 assert.deepEqual([1,2,3,4,10,11,20,21,99,100,112,999].map(countWords),
  ['하나','둘','셋','넷','열','열하나','스물','스물하나','아흔아홉','백','백십이','구백구십구']);
 assert.equal(countWords(0),'');
 assert.equal(countWords(2.5),'');
});

test('the count voice list includes device Korean options and chooses only identified male voices first',()=>{
 const english={lang:'en-US',voiceURI:'english-male',name:'English male'};
 const koreanFemale={lang:'ko-KR',voiceURI:'ko-female',name:'Korean female'};
 const voices=[english,koreanFemale,standardVoice,maleVoice,maleVoice];
 assert.deepEqual(countVoiceOptions(voices).map(option=>option.id),['trainer','standard','browser:ko-female','browser:ko-default','browser:ko-KR-InJoonNeural']);
 assert.equal(countVoiceOptions(voices,true)[0].label,'남성 트레이너 (AI 음성)');
 assert.equal(countVoiceProfile('trainer',voices).voice,maleVoice);
 assert.equal(countVoiceProfile('trainer',[koreanFemale,standardVoice]).voice,standardVoice);
 assert.ok(countVoiceProfile('trainer',[standardVoice]).pitch<1);
 assert.deepEqual(countVoiceProfile('browser:ko-female',voices),{voice:koreanFemale,pitch:1,rate:1});
 assert.equal(countVoiceProfile('browser:removed',voices).voice,maleVoice);
});

test('the preview uses the selected device voice and does not play the workout carrier',async()=>{
 await withBrowser(async browser=>{
  const result=browser.audio.previewCount('standard');
  const [utterance]=browser.utterances;
  assert.equal(utterance.text,'하나, 둘, 셋, 넷');
  assert.equal(utterance.voice,standardVoice);
  assert.equal(utterance.pitch,1);
  assert.equal(browser.carrierPlayCalls,0);
  utterance.onend();
  assert.equal(await result,true);
 });
});

test('the AI preview plays its own clip while workout counts preload and counts past 20 use device speech',async()=>{
 await withBrowser(async browser=>{
  assert.equal(await browser.audio.previewCount('trainer'),true);
  assert.equal(browser.sources[0].buffer.bytes,'preview.mp3');
  assert.equal(browser.carrierPlayCalls,0);
  assert.equal(browser.audio.countVoices()[0].label,'남성 트레이너 (AI 음성)');
  browser.audio.silence();
  assert.equal(browser.sources[0].stopped,true);
  await browser.audio.unlock('trainer');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await browser.audio.count(20,'trainer'),true);
  const countClip=browser.sources[1];
  assert.equal(countClip.buffer.bytes,'20.mp3');
  assert.equal(browser.audio.cue(0),true);
  assert.equal(countClip.stopped,undefined);
  countClip.onended();
  const fallback=browser.audio.count(21,'trainer','내리기');
  const [utterance]=browser.utterances;
  assert.equal(utterance.text,'스물하나. 내리기');
  assert.equal(utterance.voice,maleVoice);
  utterance.onend();
  assert.equal(await fallback,true);
 },{clips:['20.mp3','preview.mp3']});
});

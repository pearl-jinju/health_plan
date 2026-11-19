import {parseVoice} from './core.mjs';
import {countVoiceOptions,countVoiceProfile,countWords,defaultCountVoice,koreanVoices,normalizeCountVoice} from './count-voice.mjs';

const cueFrequencies=[660, 495, 880, 1100];
const countDirectory=new URL('./count/',import.meta.url);
const countPreviewFile='preview.mp3';

export function coach(dispatch, getToken, notify, mediaStatus=()=>{}) {
 const carrier=document.querySelector('audio');
 const session=navigator.mediaSession;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let enabled=false, active=false, listening=null, speaking=false, generation=0, lastSpeech=0, testTimer=null;
 let playAttempt=0, nextSupported=false;
 let context, activeCue, finishSpeech, activeCount;
 let countPreviewRun=0, countFiles=new Set(), countManifest;
 const countBuffers=new Map();
 const countRequests=new Map();
 const waiting='Chrome 미디어 재생 중 · 다음 곡 신호 대기';
 const handlers={
  play:()=>{
   if(testTimer){notify('재생 신호를 받았습니다. 이어폰에서 다음 곡 동작을 사용하세요.');return;}
   if(!active)return;
   unlockCue();
   preloadCount();
   void playCarrier('재생 신호 수신 · 시작하려면 다음 곡을 누르세요.');
   dispatch({type:'resume'});
  },
  pause:()=>{
   if(testTimer){notify('일시정지 신호를 받았습니다. 이어폰에서 다음 곡 동작을 사용하세요.');return;}
   if(!active)return;
   if(session)session.playbackState='paused';
   mediaStatus('일시정지 신호 수신 · 시작하려면 다음 곡을 누르세요.');
   dispatch({type:'pause'});
  },
  nexttrack:()=>{
   if(testTimer){
    cancelTest();
    stopCarrier();
    notify('다음 곡 신호를 받았습니다.');
    return;
   }
   if(!active)return;
   if(document.visibilityState!=='visible'){
    mediaStatus('다음 곡 신호 수신 · 앱 화면을 열고 다시 눌러주세요.');
    return;
   }
   mediaStatus('다음 곡 신호를 받았습니다.');
   dispatch({type:'next'});
  }
 };
 for(const [name,fn] of Object.entries(handlers))try{
  if(session){session.setActionHandler(name,fn);if(name==='nexttrack')nextSupported=true;}
 }catch{}
 function startListening(){
  if(!enabled||!active||speaking||activeCount||listening||!Recognition||document.hidden)return;
  const recognition=new Recognition();
  const startedWith=getToken();
  recognition.lang='ko-KR';
  recognition.interimResults=false;
  recognition.onresult=event=>{
   if(listening!==recognition||speaking||activeCount||Date.now()-lastSpeech<350)return;
   for(let i=event.resultIndex;i<event.results.length;i++){
    const result=event.results[i];
    const action=result.isFinal&&parseVoice(result[0].transcript);
    if(action){dispatch({...action,token:startedWith});break;}
   }
  };
  recognition.onerror=event=>{
   if(['not-allowed','service-not-allowed','audio-capture','network'].includes(event.error)){
    enabled=false;
    notify('음성 인식을 사용할 수 없습니다. 화면 버튼으로 계속할 수 있습니다.');
   }
  };
  recognition.onend=()=>{
   if(listening===recognition)listening=null;
   setTimeout(startListening,400);
  };
  listening=recognition;
  try{recognition.start();}catch{listening=null; enabled=false; notify('음성 인식을 시작할 수 없습니다.');}
 }
 function stopListening(){
  if(listening){const old=listening;listening=null;old.abort();}
 }
 function stopSpeech(){
  generation++;
  if(finishSpeech){
   finishSpeech();
   window.speechSynthesis.cancel();
  }
  speaking=false;
 }
 function stopCue(){
  if(!activeCue)return;
  const oscillator=activeCue;
  activeCue=null;
  oscillator.stop();
 }
 function silence(){
  stopListening();
  stopSpeech();
  stopCue();
  stopCountClip();
  countPreviewRun++;
 }
 function unlockCue(){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return Promise.resolve(false);
  try{
   context??=new AudioContext();
   return context.state==='running'?Promise.resolve(true):context.resume().then(()=>context.state==='running',()=>false);
  }catch{
   return Promise.resolve(false);
  }
 }
 function cue(index){
  const frequency=cueFrequencies[index];
  if(!frequency||context?.state!=='running')return false;
  stopCue();
  const time=context.currentTime;
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(0,time);
  gain.gain.linearRampToValueAtTime(0.18,time+0.012);
  gain.gain.linearRampToValueAtTime(0,time+0.115);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.onended=()=>{
   oscillator.disconnect();
   gain.disconnect();
   if(activeCue===oscillator)activeCue=null;
  };
  activeCue=oscillator;
  oscillator.start(time);
  oscillator.stop(time+0.12);
  return true;
 }
 function preview(){
  return unlockCue().then(ready=>{
   if(ready&&cue(0))return true;
   notify('이 브라우저에서 템포 소리를 재생할 수 없습니다.');
   return false;
  });
 }
 function loadCountFiles(){
  countManifest??=(async()=>{
   try{
    const response=await window.fetch(new URL('manifest.json',countDirectory));
    if(!response.ok)return;
    const names=await response.json();
    if(Array.isArray(names))countFiles=new Set(names.filter(name=>typeof name==='string'&&/^(?:0[1-9]|1\d|20|preview)\.mp3$/.test(name)));
   }catch{}
  })();
  return countManifest;
 }
 function loadCountBuffer(name){
  if(!context?.decodeAudioData||!countFiles.has(name))return Promise.resolve(null);
  if(!countRequests.has(name))countRequests.set(name,(async()=>{
   try{
    const response=await window.fetch(new URL(name,countDirectory));
    if(!response.ok)return null;
    const buffer=await context.decodeAudioData(await response.arrayBuffer());
    countBuffers.set(name,buffer);
    return buffer;
   }catch{return null;}
  })());
  return countRequests.get(name);
 }
 function preloadCount(){
  void loadCountFiles().then(()=>{
   for(const name of countFiles)void loadCountBuffer(name);
  });
 }
 function stopCountClip(){
  if(!activeCount)return;
  const source=activeCount;
  activeCount=null;
  source.stop();
 }
 function playCountClip(buffer,onEnd){
  if(!buffer||context?.state!=='running')return false;
  stopCountClip();
  stopListening();
  const source=context.createBufferSource();
  source.buffer=buffer;
  source.connect(context.destination);
  source.onended=()=>{
   source.disconnect();
   if(activeCount!==source)return;
   activeCount=null;
   lastSpeech=Date.now();
   onEnd?.();
   setTimeout(startListening,400);
  };
  activeCount=source;
  source.start();
  return true;
 }
 const voices=()=>window.speechSynthesis?.getVoices()??[];
 async function say(words,profile){
  stopListening();
  stopSpeech();
  const run=generation;
  speaking=true;
  const synthesis=window.speechSynthesis;
  let played=false;
  if(synthesis&&window.SpeechSynthesisUtterance){
   played=await new Promise(resolve=>{
    const utterance=new window.SpeechSynthesisUtterance(words);
    utterance.lang='ko-KR';
    const korean=profile?profile.voice:koreanVoices(voices())[0];
    if(korean)utterance.voice=korean;
    if(profile){utterance.pitch=profile.pitch;utterance.rate=profile.rate;}
    const finish=(success=false)=>{
     clearTimeout(timeout);
     utterance.onend=utterance.onerror=null;
     finishSpeech=null;
     resolve(success);
    };
    const timeout=setTimeout(()=>{
     finish();
     synthesis.cancel();
    },Math.min(5000,Math.max(1800,words.length*180)));
    finishSpeech=finish;
    utterance.onend=()=>finish(true);
    utterance.onerror=()=>finish();
    try{synthesis.speak(utterance);}catch{finish();}
   });
  }
  if(run!==generation)return false;
  speaking=false;
  lastSpeech=Date.now();
  setTimeout(startListening,400);
  return played;
 }
 function count(rep,preference,motionLabel=''){
  const words=countWords(rep);
  if(!words)return Promise.resolve(false);
  const file=String(rep).padStart(2,'0')+'.mp3';
  if(normalizeCountVoice(preference)===defaultCountVoice&&countBuffers.has(file)&&context?.state==='running'){
   stopSpeech();
   const run=generation;
   if(playCountClip(countBuffers.get(file),()=>{if(motionLabel&&run===generation)void say(motionLabel);}))return Promise.resolve(true);
  }
  return say(motionLabel?words+'. '+motionLabel:words,countVoiceProfile(preference,voices()));
 }
 async function previewCount(preference){
  const preview=++countPreviewRun;
  stopCountClip();
  stopSpeech();
  if(normalizeCountVoice(preference)===defaultCountVoice){
   const unlocked=unlockCue();
   await loadCountFiles();
   const clip=await loadCountBuffer(countPreviewFile);
   if(preview!==countPreviewRun)return false;
   if(await unlocked&&preview===countPreviewRun&&playCountClip(clip))return true;
  }
  if(preview!==countPreviewRun)return false;
  const spoken=say([1,2,3,4].map(countWords).join(', '),countVoiceProfile(preference,voices()));
  const run=generation;
  const played=await spoken;
  if(!played&&run===generation)notify('음성을 재생할 수 없습니다. 기기의 한국어 음성 설정을 확인하세요.');
  return played;
 }
 async function playCarrier(message=waiting){
  const attempt=++playAttempt;
  if(session&&window.MediaMetadata)session.metadata=new window.MediaMetadata({title:'헬스 에이전트',artist:'운동 안내'});
  mediaStatus('Chrome 미디어 연결 중…');
  try{
   if(carrier.paused){
    carrier.currentTime=0;
    await carrier.play();
   }
   if(attempt!==playAttempt)return false;
   if(session)session.playbackState='playing';
   mediaStatus(nextSupported?message:'이 브라우저에서는 다음 곡 제어를 사용할 수 없습니다.');
   return true;
  }catch{
   if(attempt!==playAttempt)return false;
   const message='미디어를 재생할 수 없습니다. 이어폰 다시 연결을 눌러주세요.';
   mediaStatus(message);
   if(testTimer)notify(message);
   return false;
  }
 }
 function stopCarrier(){
  playAttempt++;
  carrier.pause();
  if(session)session.playbackState='none';
 }
 function cancelTest(){
  clearTimeout(testTimer);
  testTimer=null;
 }
 function unlock(preference){
  unlockCue();
  if(normalizeCountVoice(preference)===defaultCountVoice)preloadCount();
  return playCarrier();
 }
 carrier.addEventListener('timeupdate',()=>{
  // Keep the connection chime out of the loop once playback reaches the quiet tail.
  if(carrier.duration>5&&carrier.currentTime>carrier.duration-1)carrier.currentTime=0.6;
 });
 carrier.addEventListener('pause',()=>{
  if(!active||!carrier.paused)return;
  playAttempt++;
  if(session)session.playbackState='paused';
  mediaStatus('미디어가 멈췄습니다. 이어폰 다시 연결을 눌러주세요.');
  dispatch({type:'pause'});
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)dispatch({type:'pause'});else startListening();});
 function hasTrainerClips(){return countFiles.has(countPreviewFile);}
 return {say,count,previewCount,countVoices:()=>countVoiceOptions(voices(),hasTrainerClips()),loadCountFiles,hasTrainerClips,silence,unlock,cue,preview,
  run(value){
   active=value;
   cancelTest();
   if(!value){silence();stopCarrier();}
   else startListening();
  },
  voice(){if(!Recognition){notify('이 브라우저는 음성 인식을 지원하지 않습니다.');return;} enabled=!enabled;if(!enabled&&listening){const old=listening;listening=null;old.abort();} if(enabled)startListening(); notify(enabled?'음성 명령이 켜졌습니다.':'음성 명령이 꺼졌습니다.');},
  check(){
   if(!nextSupported){notify('이 브라우저에서는 다음 곡 제어를 사용할 수 없습니다.');return;}
   cancelTest();
   testTimer=setTimeout(()=>{
    cancelTest();
    stopCarrier();
    notify('다음 곡 신호를 받지 못했습니다. 이어폰 제스처 설정과 Chrome 미디어 재생을 확인하세요.');
   },15000);
   notify('이어폰의 다음 곡 동작을 15초 안에 사용하세요.');
   void playCarrier();
  }
 };
}

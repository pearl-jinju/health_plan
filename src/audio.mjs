import {parseVoice} from './core.mjs';
export function coach(dispatch, getToken, notify) {
 const carrier=document.querySelector('audio');
 const session=navigator.mediaSession;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let enabled=false, active=false, listening=null, speaking=false, generation=0, lastSpeech=0, test=null;
 const handlers={
  play:()=>{if(active){carrier.play().catch(()=>{}); dispatch({type:'resume'});}},
  pause:()=>{if(active)dispatch({type:'pause'});},
  nexttrack:()=>{if(test){test();return;} if(active&&!carrier.paused&&document.visibilityState==='visible')dispatch({type:'next'});}
 };
 for(const [name,fn] of Object.entries(handlers)) try{session?.setActionHandler(name,fn);}catch{}
 function startListening(){
  if(!enabled||!active||speaking||listening||!Recognition||document.hidden)return;
  const recognition=new Recognition();
  const startedWith=getToken();
  recognition.lang='ko-KR';
  recognition.interimResults=false;
  recognition.onresult=event=>{
   if(listening!==recognition||speaking||Date.now()-lastSpeech<350)return;
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
 function silence(){
  generation++;
  if(listening){const old=listening;listening=null;old.abort();}
  window.speechSynthesis?.cancel();
  speaking=false;
 }
 async function say(words){
  silence();
  const run=generation;
  speaking=true;
  if(window.speechSynthesis&&window.SpeechSynthesisUtterance){
   await new Promise(resolve=>{
    const utterance=new SpeechSynthesisUtterance(words);
    utterance.lang='ko-KR';
    const korean=speechSynthesis.getVoices().find(x=>/^ko[-_]/i.test(x.lang));
    if(korean)utterance.voice=korean;
    const timeout=setTimeout(resolve,Math.max(4500,words.length*240));
    utterance.onend=utterance.onerror=()=>{clearTimeout(timeout);resolve();};
    speechSynthesis.speak(utterance);
   });
  }
  if(run!==generation)return;
  speaking=false;
  lastSpeech=Date.now();
  setTimeout(startListening,400);
 }
 function unlock(){
  carrier.play().catch(()=>notify('안내 오디오를 시작하려면 화면에서 오디오 활성화를 누르세요.'));
  if(session){
   if(window.MediaMetadata)session.metadata=new MediaMetadata({title:'헬스 에이전트',artist:'운동 안내'});
   session.playbackState='playing';
  }
 }
 carrier.addEventListener('pause',()=>{if(active)dispatch({type:'pause'});});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)dispatch({type:'pause'});else startListening();});
 return {say,silence,unlock,
  run(value){active=value;if(!value){silence();carrier.pause();if(session)session.playbackState='none';}else startListening();},
  voice(){if(!Recognition){notify('이 브라우저는 음성 인식을 지원하지 않습니다.');return;} enabled=!enabled;if(!enabled&&listening){const old=listening;listening=null;old.abort();} if(enabled)startListening(); notify(enabled?'음성 명령이 켜졌습니다.':'음성 명령이 꺼졌습니다.');},
  check(){unlock(); test=()=>{test=null;carrier.pause();notify('다음 곡 신호 1회 수신 · 기기 지원은 실기기 반복 시험 후 확인합니다.');};setTimeout(()=>{if(test){test=null; if(!active)carrier.pause();notify('이어폰 확인 시간이 끝났습니다.');}},12000);}
 };
}

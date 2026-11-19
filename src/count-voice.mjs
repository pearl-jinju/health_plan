export const defaultCountVoice='trainer';

const nativeUnits=['','하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉'];
const nativeTens=['','열','스물','서른','마흔','쉰','예순','일흔','여든','아흔'];
const sinoUnits=['','일','이','삼','사','오','육','칠','팔','구'];
const browserPrefix='browser:';

export function countWords(rep){
 if(!Number.isInteger(rep)||rep<1||rep>999)return '';
 const ones=rep%10;
 const tens=Math.floor(rep/10)%10;
 if(rep<100)return nativeTens[tens]+nativeUnits[ones];
 const hundreds=Math.floor(rep/100);
 return (hundreds===1?'':sinoUnits[hundreds])+'백'+(tens?tens===1?'십':sinoUnits[tens]+'십':'')+sinoUnits[ones];
}

export function normalizeCountVoice(value){
 return typeof value==='string'&&(value==='standard'||(value.startsWith(browserPrefix)&&value.length>browserPrefix.length))?value:defaultCountVoice;
}

export function koreanVoices(voices){
 return (voices??[]).filter(voice=>/^ko(?:[-_]|$)/i.test(voice.lang));
}

function voiceId(voice){
 const key=voice.voiceURI||voice.name;
 return key?browserPrefix+key:null;
}

export function countVoiceOptions(voices,hasTrainerClips=false){
 const options=[{id:defaultCountVoice,label:hasTrainerClips?'남성 트레이너 (AI 음성)':'트레이너 톤'},{id:'standard',label:'한국어 기본 음성'}];
 const seen=new Set();
 for(const voice of koreanVoices(voices)){
  const id=voiceId(voice);
  if(!id||seen.has(id))continue;
  seen.add(id);
  options.push({id,label:voice.name||'한국어 음성'});
 }
 return options;
}

function knownMale(voice){
 // SpeechSynthesisVoice has no gender field. Use explicit metadata or documented voice names.
 const label=[voice.name,voice.voiceURI].join(' ');
 return /\bmale\b|남성|\bMicrosoft (?:InJoon|Hyunsu|BongJin|GookMin|Junho)\b|\bko[-_]kr[-_](?:InJoon|Hyunsu|BongJin|GookMin|Junho)(?:MultilingualNeural|Neural|:|\b)/i.test(label);
}

export function countVoiceProfile(value,voices){
 const preference=normalizeCountVoice(value);
 const available=koreanVoices(voices);
 const preferred=available.find(voice=>voice.default)??available.find(voice=>voice.localService)??available[0];
 if(preference==='standard')return {voice:preferred,pitch:1,rate:1};
 const chosen=available.find(voice=>voiceId(voice)===preference);
 if(chosen)return {voice:chosen,pitch:1,rate:1};
 const male=available.find(voice=>voice.localService&&knownMale(voice))??available.find(knownMale);
 return {voice:male??preferred,pitch:male ? .9 : .76,rate:.94};
}

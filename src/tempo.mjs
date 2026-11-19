const press=['내리기','아래에서 멈춤','밀기','위에서 멈춤'];
const fly=['모으기','모은 채 멈춤','벌리기','벌린 채 멈춤'];
const pull=['당기기','당긴 채 멈춤','팔 펴기','시작 자세에서 멈춤'];
const curl=['팔 굽히기','굽힌 채 멈춤','팔 펴기','시작 자세에서 멈춤'];
const squat=['앉기','아래에서 멈춤','일어서기','서서 멈춤'];
const extension=['팔 펴기','편 채 멈춤','팔 굽히기','시작 자세에서 멈춤'];

const presets={
 bench:[press,[3,1,1,0]], press:[press,[2,0,1,1]],
 incline:[press,[3,0,1,0]], inclineMachine:[press,[2,0,1,0]],
 fly:[fly,[1,1,3,0]], pec:[fly,[1,1,2,0]],
 triceps:[extension,[1,1,2,0]], extension:[extension,[1,0,3,0]],
 row:[pull,[1,1,2,0]], dumbrow:[pull,[1,1,3,0]],
 curl:[curl,[1,0,3,0]], cablecurl:[curl,[1,1,2,0]],
 squat:[squat,[3,1,1,0]], body:[squat,[2,0,1,0]],
 shoulder:[press,[2,0,1,0]], shoulderMachine:[press,[2,0,1,1]]
};

const secondsOptions=[0,0.5,1,1.5,2,2.5,3,4,5,6,7,8];
export const tempoOptions=slot=>slot%2?secondsOptions:secondsOptions.slice(1);
export function tempoProfile(exercise,overrides){
 const [labels,defaults]=presets[exercise];
 return labels.map((label,slot)=>{
  const value=overrides?.[slot];
  return {label,slot,seconds:tempoOptions(slot).includes(value)?value:defaults[slot]};
 });
}
export const tempoPhases=(exercise,overrides)=>tempoProfile(exercise,overrides).filter(phase=>phase.seconds>0);
export function swipeDirection(x,y){
 return Math.abs(x)>=36&&Math.abs(x)>=Math.abs(y)*1.4?Math.sign(x):0;
}

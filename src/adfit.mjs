const approvedOrigin='https://health-agent-8y4x.onrender.com';
const sdkUrl='https://t1.kakaocdn.net/kas/static/ba.min.js';
const unit='DAN-S6hZdNixDig8UTgb';
const adWidth=300;
const adHeight=250;
const adSpace=adHeight+44;

export function fitsSummaryAd(width,remainingHeight){
 return width>=adWidth&&remainingHeight>=adSpace;
}

export function createSummaryAd(host,main){
 const doc=host.ownerDocument;
 const view=doc.defaultView;
 if(view.location.origin!==approvedOrigin)return {update(){}};
 let workout=null, attempted=false, slot=null, script=null;
 function clear(){
  script?.remove();
  script=null;
  slot=null;
  host.hidden=true;
  host.classList.remove('has-creative');
  host.replaceChildren();
 }
 function hasRoom(){
  const style=view.getComputedStyle(main);
  const gap=parseFloat(style.rowGap)||0;
  const padding=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0)+
   (parseFloat(view.getComputedStyle(host.parentElement).paddingBottom)||0);
  const rows=[...main.children].map(child=>child.getBoundingClientRect().height);
  const rect=main.getBoundingClientRect();
  const available=Math.min(view.innerHeight,view.visualViewport?.height??view.innerHeight)-rect.top;
  const needed=rows.reduce((sum,height)=>sum+height,0)+Math.max(0,rows.length-1)*gap+padding;
  return fitsSummaryAd(rect.width,available-needed);
 }
 function refresh(){
  if(!workout)return;
  if(!hasRoom()){
   if(slot)clear();
   return;
  }
  if(attempted||doc.visibilityState!=='visible')return;
  attempted=true;
  slot=doc.createElement('ins');
  slot.className='kakao_ad_area';
  slot.style.display='none';
  Object.assign(slot.dataset,{
   adUnit:unit,adWidth:String(adWidth),adHeight:String(adHeight),adOnfail:'healthAdFitUnavailable'
  });
  host.append(slot);
  host.hidden=false;
  script=doc.createElement('script');
  script.src=sdkUrl;
  script.async=true;
  script.charset='utf-8';
  script.addEventListener('error',clear,{once:true});
  doc.body.append(script);
 }
 view.healthAdFitUnavailable=(failed)=>{if(failed===slot)clear();};
 const observer=new view.ResizeObserver(()=>{
  host.classList.toggle('has-creative',!host.hidden&&host.getBoundingClientRect().height>=adHeight);
 });
 observer.observe(host);
 view.addEventListener('resize',refresh);
 doc.addEventListener('visibilitychange',refresh);
 return {update(id){
  if(id!==workout){clear();workout=id;attempted=false;}
  refresh();
 }};
}

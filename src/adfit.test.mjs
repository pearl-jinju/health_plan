import assert from 'node:assert/strict';
import test from 'node:test';
import {createSummaryAd,fitsSummaryAd} from './adfit.mjs';

test('only room for the full banner and spacing permits an ad',()=>{
 assert.equal(fitsSummaryAd(299,500),false);
 assert.equal(fitsSummaryAd(320,293),false);
 assert.equal(fitsSummaryAd(300,294),true);
});
test('AdFit skips unregistered preview origins',()=>{
 const ad=createSummaryAd({ownerDocument:{defaultView:{location:{origin:'http://localhost:8765'}}}},null);
 assert.doesNotThrow(()=>ad.update('complete'));
});
test('once per eligible summary, a missing ad leaves no frame behind',()=>{
 const scripts=[];
 const children=[];
 const scope={};
 let width=350;
 const doc={
  visibilityState:'visible',
  defaultView:{
   location:{origin:'https://health-agent-8y4x.onrender.com'},
   innerHeight:800,
   getComputedStyle:()=>({rowGap:'9px',paddingTop:'12px',paddingBottom:'10px'}),
   ResizeObserver:class{observe(){}},
   addEventListener:(name,callback)=>{scope[name]=callback;}
  },
  body:{append:element=>scripts.push(element)},
  createElement:tag=>({tag,style:{},dataset:{},remove(){this.removed=true;},addEventListener(){}}),
  addEventListener(){}
 };
 const host={
  ownerDocument:doc,parentElement:{},hidden:true,
  classList:{remove(){},toggle(){}},
  append:el=>children.push(el),
  replaceChildren:()=>{children.length=0;}
 };
 const main={children:[{getBoundingClientRect:()=>({height:240})}],getBoundingClientRect:()=>({width,top:52})};
 const ad=createSummaryAd(host,main);
 ad.update(null);
 assert.equal(scripts.length,0);
 width=270;
 ad.update('workout');
 assert.equal(scripts.length,0);
 width=350;
 scope.resize();
 assert.equal(scripts.length,1);
 assert.equal(scripts[0].src,'https://t1.kakaocdn.net/kas/static/ba.min.js');
 assert.deepEqual(children[0].dataset,{adUnit:'DAN-S6hZdNixDig8UTgb',adWidth:'300',adHeight:'250',adOnfail:'healthAdFitUnavailable'});
 ad.update('workout');
 assert.equal(scripts.length,1);
 doc.defaultView.healthAdFitUnavailable(children[0]);
 assert.equal(host.hidden,true);
 assert.equal(children.length,0);
 ad.update('workout');
 assert.equal(scripts.length,1);
 ad.update(null);
 ad.update('next-workout');
 assert.equal(scripts.length,2);
 ad.update(null);
 assert.equal(host.hidden,true);
});

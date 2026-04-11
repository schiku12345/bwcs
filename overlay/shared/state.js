// BEDWARS OVERLAY — State Engine 
(function(){
'use strict';
var CH='bwo9', KEY='bwo9-state';
var TC={Red:'#ff3a3a',Blue:'#3a8aff',Green:'#3aff7a',Yellow:'#ffe033',Aqua:'#00e5ff',White:'#f0f0f0',Pink:'#ff5ec7',Gray:'#999999'};
var MODE4=['Red','Blue','Green','Yellow'];
var MODE8=['Red','Blue','Green','Yellow','Aqua','White','Pink','Gray'];
var PHASES=[
  {name:'Diamond II',icon:'diamond',duration:360},
  {name:'Emerald II',icon:'emerald',duration:360},
  {name:'Diamond III',icon:'diamond',duration:360},
  {name:'Emerald III',icon:'emerald',duration:360},
  {name:'Bed Destruction',icon:'bed',duration:360},
  {name:'Sudden Death',icon:'skull',duration:600},
  {name:'Game Over',icon:'skull',duration:600}
];
function makeTeams(c){return c.map(function(col){return{color:col,players:[{name:'',dead:false},{name:'',dead:false},{name:'',dead:false},{name:'',dead:false}],eliminated:false,hasBed:true};});}

function mkDef(){return{
  gameNumber:1, gameStage:'', mapName:'',
  teamMode:8, teams:makeTeams(MODE8),
  scores:{Red:0,Blue:0,Green:0,Yellow:0,Aqua:0,White:0,Pink:0,Gray:0},
  playerStats:{},
  pointRules:{kills:1,deaths:0,finals:2,bedbreaks:3},
  timerRunning:false, timerStartTime:null, timerOffset:0, timerStarted:false,
  // Layout px (1920×1080)
  mainPanelLeft:60, mainPanelBottom:80, mainPanelW:900, mainPanelScale:1.0,
  sbLeft:null, sbTop:null, sbW:240, sbH:380, sbScale:1.0,
  tpLeft:null, tpTop:null, tpW:340, tpH:180, tpScale:1.0,
  chatLeft:20, chatTop:200, chatW:320, chatH:400, chatScale:1.0,
  showTimer:true, showTeams:true, showScoreboard:true, showTournInfo:true, showChat:false,
  overlayMode:'starting',
  cycleInterval:8, autoCycle:true, transition:'slide',
  tournCards:[{id:'tc0',title:'Welcome!',body:'Ranked Bedwars Championship',imageUrl:''}],
  tournCardInterval:10,
  mapPool:[], selectedMap:'', mapTransition:'slot',
  phaseIcons:{diamond:'',emerald:'',bed:'',skull:'',bedgone:''},
  theme:'blue', customAccent:'#4488ff', customAccent2:'#00e5ff',
  // Background animation for fullscreen screens
  bgAnimation:'particles',  // 'particles'|'hexagons'|'waves'|'grid'|'circles'|'none'
  // Custom bg images (URLs)
  startingBgImageUrl:'', brbBgImageUrl:'',
  // Starting Soon
  startingLogoUrl:'', startingAnimation:'pulse',
  startingEventName:'All Stars S9 — Day 1',
  startingSubtext:'Starting Soon',
  // Countdown timer (counts DOWN from startingCountdownFrom seconds, 0 = count up)
  startingTimerRunning:false, startingTimerStart:null, startingTimerOffset:0,
  startingCountdownFrom:0,  // 0 = count up; >0 = count down from this many seconds
  startingTextAnim:'shimmer',
  // BRB
  brbLogoUrl:'', brbAnimation:'float',
  brbEventName:'', brbSubtext:'Be Right Back',
  brbTextAnim:'fade',
  // Chat
  chatStreamUrl:'',
  // Background media (video loops + image fallback per screen)
  sharedBgVideoUrl:'',  sharedBgImageUrl:'',
  startingBgVideoUrl:'',startingBgImageUrl:'',
  brbBgVideoUrl:'',     brbBgImageUrl:'',
  sumBgVideoUrl:'',     sumBgImageUrl:'',
  mapBgVideoUrl:'',     mapBgImageUrl:'',
};}

function fmt(s){var sec=Math.max(0,Math.floor(s)),m=Math.floor(sec/60),ss=sec%60;return m+':'+(ss<10?'0':'')+ss;}
function getElapsed(st){if(!st.timerRunning||!st.timerStartTime)return st.timerOffset||0;return(st.timerOffset||0)+(Date.now()-st.timerStartTime)/1000;}
function getPhase(e){var acc=0;for(var i=0;i<PHASES.length;i++){acc+=PHASES[i].duration;if(e<acc)return{phase:PHASES[i],index:i,phaseElapsed:e-(acc-PHASES[i].duration)};}var last=PHASES[PHASES.length-1];return{phase:last,index:PHASES.length-1,phaseElapsed:last.duration};}
function getStartingElapsed(st){if(!st.startingTimerRunning||!st.startingTimerStart)return st.startingTimerOffset||0;return(st.startingTimerOffset||0)+(Date.now()-st.startingTimerStart)/1000;}
function computeTeamScore(team,pStats,rules){
  var total=0;rules=rules||{};
  (team.players||[]).forEach(function(p){var name=typeof p==='string'?p:(p&&p.name?p.name:'');if(!name.trim())return;var s=(pStats||{})[name.trim()];if(!s)return;total+=(s.kills||0)*(rules.kills||0);total+=(s.finals||0)*(rules.finals||0);total+=(s.bedbreaks||0)*(rules.bedbreaks||0);total+=(s.deaths||0)*(rules.deaths||0);});
  return Math.max(0,Math.round(total));
}
function deriveAccent2(hex){
  try{
    var r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
    var max=Math.max(r,g,b),min=Math.min(r,g,b),h,s,l=(max+min)/2;
    if(max===min){h=s=0;}else{var d=max-min;s=l>.5?d/(2-max-min):d/(max+min);switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;default:h=((r-g)/d+4)/6;break;}}
    h=(h+0.08)%1;l=Math.min(.85,l+.15);
    function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<.5)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;}
    var q=l<.5?l*(1+s):l+s-l*s,p2=2*l-q;
    return'#'+[hue2rgb(p2,q,h+1/3),hue2rgb(p2,q,h),hue2rgb(p2,q,h-1/3)].map(function(v){var x=Math.round(v*255).toString(16);return x.length===1?'0'+x:x;}).join('');
  }catch(e){return'#00e5ff';}
}
function darkenAccent(hex,amount){
  amount=amount==null?0.88:amount;
  try{var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return'#'+[r,g,b].map(function(v){var x=Math.max(0,Math.round(v*(1-amount))).toString(16);return x.length===1?'0'+x:x;}).join('');}catch(e){return'#060810';}
}
function getPlayerName(p){return typeof p==='string'?p:(p&&p.name?p.name:'');}
function isPlayerDead(p){return typeof p==='object'&&p&&p.dead===true;}

function SM(){
  this._s=this._load();this._ls=[];var self=this;
  try{this._ch=new BroadcastChannel(CH);this._ch.onmessage=function(e){if(e.data&&e.data.t==='U'){self._s=e.data.p;self._emit();}};}catch(e){this._ch=null;}
  window.addEventListener('storage',function(e){if(e.key===KEY&&e.newValue)try{self._s=JSON.parse(e.newValue);self._emit();}catch(err){}});
}
SM.prototype._load=function(){
  try{
    var raw=localStorage.getItem(KEY);
    if(raw){
      var saved=JSON.parse(raw),def=mkDef(),out={};
      for(var k in def)out[k]=def[k];
      for(var k in saved)out[k]=saved[k];
      if(out.teams)out.teams=out.teams.map(function(t){t.players=(t.players||[]).map(function(p){return typeof p==='string'?{name:p,dead:false}:p;});return t;});
      return out;
    }
  }catch(e){}
  return mkDef();
};
SM.prototype.get=function(){return this._s;};
SM.prototype.update=function(p){for(var k in p)this._s[k]=p[k];this._save();this._bcast();this._emit();};
SM.prototype.silentUpdate=function(p){for(var k in p)this._s[k]=p[k];this._save();};
SM.prototype.sub=function(fn){this._ls.push(fn);};
SM.prototype._save=function(){try{localStorage.setItem(KEY,JSON.stringify(this._s));}catch(e){}};
SM.prototype._bcast=function(){if(this._ch)try{this._ch.postMessage({t:'U',p:this._s});}catch(e){}};
SM.prototype._emit=function(){for(var i=0;i<this._ls.length;i++)try{this._ls[i](this._s);}catch(e){console.error(e);}};
SM.prototype.reset=function(){this._s=mkDef();this._save();this._bcast();this._emit();};

var mgr=new SM();
window.BWO={state:mgr,TC:TC,MODE4:MODE4,MODE8:MODE8,PHASES:PHASES,makeTeams:makeTeams,
  fmt:fmt,getElapsed:getElapsed,getPhase:getPhase,getStartingElapsed:getStartingElapsed,
  computeTeamScore:computeTeamScore,deriveAccent2:deriveAccent2,darkenAccent:darkenAccent,
  getPlayerName:getPlayerName,isPlayerDead:isPlayerDead};
window.overlayState=mgr;
})();

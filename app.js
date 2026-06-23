"use strict";
/* ===== app — 부트스트랩·뷰 라우팅·nav·tick·테마 ===== */

const COLORS=['#2F6B58','#46568A','#7A4E73','#A6603C','#4E606C'];
const DOW=['일','월','화','수','목','금','토'];
const $=s=>document.querySelector(s);

const toMin=t=>{if(!t)return 0;const[a,b]=t.split(':').map(Number);return a*60+b;};
const fromMin=m=>{m=((m%1440)+1440)%1440;return pad(Math.floor(m/60))+':'+pad(m%60);};
const nowHM=()=>{const d=new Date();return d.getHours()*60+d.getMinutes();};
const pad=n=>String(n).padStart(2,'0');
const dateStr=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtMin(m){if(!m)return '0분';const h=Math.floor(m/60),x=m%60;return (h?h+'시간':'')+(h&&x?' ':'')+(x?x+'분':(h?'':'0분'));}
function fmtClock(ms){const s=Math.max(0,Math.floor(ms/1000));const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return (h?pad(h)+':':'')+pad(m)+':'+pad(x);}
const fmtDate=s=>{if(!s)return'';const[,m,d]=s.split('-').map(Number);return m+'월 '+d+'일';};

let viewDay, notified=new Set(), drag=null, currentView=null;
const _fragCache={};

const today=()=>DB.day.weekday;
const isToday=()=>viewDay===today();
const blocksFor=d=>(d===today()?(DB.day.blocks||(DB.day.blocks=[])):DB.templates[d]||[]);
function setBlocksFor(d,arr){if(d===today())DB.day.blocks=arr;else DB.templates[d]=arr;}
function layout(d){let t=toMin(DB.dayStart[d]||'14:00');blocksFor(d).forEach(b=>{if(b.anchor){const a=toMin(b.anchor);if(a>t)t=a;}b.start=fromMin(t);b.end=fromMin(t+b.dur);t+=b.dur;});}

function applyTheme(){document.documentElement.dataset.theme=DB.settings.theme==='dark'?'dark':'light';
  const sw=$('#sw-theme');if(sw)sw.classList.toggle('on',DB.settings.theme==='dark');
  document.querySelector('meta[name=theme-color]').setAttribute('content',DB.settings.theme==='dark'?'#1E2328':'#2F6B58');}

let toT;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toT);toT=setTimeout(()=>t.classList.remove('show'),2600);}

async function show(v){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('on'));
  document.querySelector(`.nav-btn[data-go="${v}"]`).classList.add('on');
  const main=$('#main-content'),map={today:'today.html',calendar:'calendar.html',stats:'stats.html',set:'settings.html',reflect:'reflect.html'};
  try{
    if(!_fragCache[v]){const r=await fetch(map[v]);if(!r.ok)throw new Error();_fragCache[v]=await r.text();}
    main.innerHTML=_fragCache[v];
    await new Promise(requestAnimationFrame);
  }catch(e){
    main.innerHTML='<div class="help" style="padding:24px;text-align:center">화면을 불러올 수 없어요.<br>VS Code Live Server 등 로컬 서버로 실행해주세요.</div>';
    return;
  }
  currentView=v;
  if(v==='today'){
    const now=new Date();
    $('#date').textContent=`${now.getMonth()+1}월 ${now.getDate()}일 (${DOW[now.getDay()]})`;
    $('#add-study').onclick=()=>addBlock('study');
    $('#add-buffer').onclick=()=>addBlock('buffer');
    renderToday();
  }else if(v==='calendar'){renderCalendar();}
  else if(v==='stats'){renderStats();}
  else if(v==='set'){buildSettings();}
  else if(v==='reflect'){renderReflect();}
  window.scrollTo(0,0);
}
document.querySelectorAll('.nav-btn').forEach(b=>b.onclick=()=>show(b.dataset.go));

// 시각에 따라 바뀌는 유일한 표시 = 지금 진행 중인 블록. 그 id가 바뀔 때만 재렌더.
let _lastLiveKey=undefined;
function liveKey(){
  if(!(currentView==='today'&&isToday()))return null;
  const hm=nowHM();
  for(const b of blocksFor(today())){if(b.type==='study'&&toMin(b.start)<=hm&&hm<toMin(b.end))return b.id;}
  return 0;
}
function tick(){if(!DB)return;layout(today());
  if(DB.settings.alerts){const hm=nowHM(),ds=DB.day.date;
    blocksFor(today()).forEach(b=>{if(b.type!=='study')return;if(toMin(b.start)===hm){const k=ds+':'+b.id;if(!notified.has(k)){notified.add(k);fireAlert(b);}}});}
  if(currentView==='today'&&isToday()&&!drag){
    const ae=document.activeElement;
    if(ae&&(ae.tagName==='INPUT'||ae.tagName==='SELECT'))return;  // 입력 중엔 포커스 보호 — 재렌더 보류
    const lk=liveKey();
    if(lk!==_lastLiveKey){_lastLiveKey=lk;renderToday();}  // live 블록 전환 때만 풀렌더
  }}

function fireAlert(b){const title=(b.label||'다음 블록')+' 시작',body=b.scope||(b.start+'–'+b.end);let shown=false;
  if('Notification'in window&&Notification.permission==='granted'){try{new Notification(title,{body});shown=true;}catch(e){}}
  if(!shown)toast('⏰ '+title+(b.scope?' · '+b.scope:''));}

async function init(){
  DB=load();
  if(!DB)DB=buildDefault();else if(DB.version===2)DB=migrateV2(DB);else if(DB.version!==3)DB=buildDefault();
  const now=new Date(),ds=dateStr(now);
  if(DB.day.date!==ds){
    // §8: temp(=오늘의 3) blocks belong only to the day that made them — strip before the date rolls over,
    // otherwise they'd silently become a permanent fixture of that weekday's template forever.
    const prevWd=DB.day.weekday;
    if(DB.templates[prevWd])DB.templates[prevWd]=DB.templates[prevWd].filter(b=>!b.temp);
    DB.day={date:ds,weekday:now.getDay(),done:{},carryover:DB.day.carryover||[],ritualDone:false,blocks:[]};
  }
  // migrate: day.blocks not yet in saved data → pull today's temp blocks out of template
  if(!Array.isArray(DB.day.blocks)){
    DB.day.blocks=[];
    const wd=DB.day.weekday;
    if(DB.templates[wd]){
      const temps=DB.templates[wd].filter(b=>b.temp);
      DB.day.blocks=temps.map(b=>{const nb={...b};delete nb.temp;return nb;});
      DB.templates[wd]=DB.templates[wd].filter(b=>!b.temp);
    }
  }
  if(typeof DB.day.ritualDone==='undefined')DB.day.ritualDone=false;
  if(typeof DB.seq!=='number')DB.seq=10000;
  if(!Array.isArray(DB.learnings))DB.learnings=[];
  // confidence score제 마이그레이션: 기존 배움에 score(0~1)·lastEvolved 주입
  DB.learnings.forEach(l=>{if(typeof l.score==='undefined')l.score=(l.confidence==='confirmed'?0.7:0.45);if(typeof l.lastEvolved==='undefined')l.lastEvolved=null;});
  if(typeof DB.weeklyRule==='undefined')DB.weeklyRule=null;
  if(!DB.settings.firstIntent)DB.settings.firstIntent='';
  if(typeof DB.day.planMode==='undefined')DB.day.planMode='free';
  if(!DB.calendar)DB.calendar={events:[]};
  if(!Array.isArray(DB.calendar.events))DB.calendar.events=[];
  if(!DB.coldstart)DB.coldstart={done:false,vision:null,identity:null,motivation:null,challenge:null,completedAt:null};
  if(!DB.subjectAliases)DB.subjectAliases={};
  checkCalendarAlerts();
  // §5 legacy data fix: old entries predate the measured/slot/ts fields.
  // checkbox-path entries always had minutes===planned exactly; anything else was a real focus measurement.
  // Ambiguous ties (minutes===planned by coincidence) default to measured:false — safer than polluting accuracy stats.
  (DB.log||[]).forEach(e=>{
    if(typeof e.measured==='undefined')e.measured=(e.minutes!==e.planned);
    if(typeof e.focusMode==='undefined')e.focusMode=!!e.measured;
    if(typeof e.weekday==='undefined')e.weekday=null;
    if(typeof e.slot==='undefined')e.slot=null;
    if(typeof e.ts==='undefined')e.ts=0;
    if(typeof e.actualStart==='undefined')e.actualStart=null;
  });
  if(DB.focus){if(DB.focus.date!==DB.day.date)DB.focus=null;else if(DB.focus.runningSince)DB.focus.runningSince=null;}
  // migrate: add subject field to blocks (defaults to trimmed label)
  const _ms=b=>{if(typeof b.subject==='undefined')b.subject=(b.label||'').trim();};
  Object.values(DB.templates||{}).forEach(arr=>arr.forEach(_ms));
  (DB.day.blocks||[]).forEach(_ms);
  // migrate: trim existing log subjects
  (DB.log||[]).forEach(e=>{if(e.subject)e.subject=e.subject.trim();});
  viewDay=today();
  applyTheme();
  $('#sheetBack').onclick=closeSheet;
  $('#fx-play').onclick=fxToggle;$('#fx-int').onclick=fxInterrupt;$('#fx-done').onclick=fxDone;$('#fx-close').onclick=fxExit;
  $('#rit-close').onclick=()=>closeRitual(false);
  // 디바운스 저장이 미반영된 상태로 앱이 닫히거나 백그라운드로 가는 걸 방지 — 즉시 영속화.
  window.addEventListener('pagehide',flushSave);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();});
  flushSave();setInterval(tick,20000);
  await show('today');
  if(!DB.coldstart.done)openColdstart();
}

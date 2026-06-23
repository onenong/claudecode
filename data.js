"use strict";
/* ===== data — 단일 데이터 소스 ===== */
// localStorage 접근은 여기서만. 다른 파일에서 직접 store·KEY·DB 접근·재정의 금지.
// buildDefault·migrateV2·load·save 가 DB의 유일한 진입점.

const store=(function(){let mem={},ok=false;
  try{localStorage.setItem('__t','1');localStorage.removeItem('__t');ok=true;}catch(e){ok=false;}
  return{get(k){try{return ok?localStorage.getItem(k):(k in mem?mem[k]:null);}catch(e){return k in mem?mem[k]:null;}},
    set(k,v){try{if(ok)localStorage.setItem(k,v);else mem[k]=v;}catch(e){mem[k]=v;}}};})();

const KEY='hk_planner_v3';
let DB=null;

function buildDefault(){
  const seq={n:1};
  const mk=arr=>arr.map(s=>Object.assign({id:seq.n++},s));
  const wd=()=>mk([
    {type:'study',dur:90,label:'영어',scope:'단어 + 독해',color:'#2F6B58'},
    {type:'buffer',dur:15},
    {type:'study',dur:90,label:'수학',scope:'문제풀이',color:'#46568A'},
    {type:'buffer',dur:15},
    {type:'study',dur:60,label:'정리',scope:'이월 처리',color:'#A6603C'}]);
  const we=()=>mk([
    {type:'study',dur:90,label:'복습',scope:'약한 부분',color:'#7A4E73'},
    {type:'buffer',dur:15},
    {type:'study',dur:75,label:'이월 처리',scope:'밀린 범위',color:'#A6603C'}]);
  const templates={},dayStart={};
  for(let i=0;i<7;i++){const w=(i===0||i===6);templates[i]=w?we():wd();dayStart[i]=w?'10:00':'14:00';}
  const now=new Date();
  return{version:3,seq:seq.n,
    settings:{theme:(window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light',alerts:false,firstIntent:''},
    presets:[
      {name:'영어',color:'#2F6B58',scopes:['단어','독해','문법','듣기']},
      {name:'수학',color:'#46568A',scopes:['개념','문제풀이','오답노트']},
      {name:'국어',color:'#7A4E73',scopes:['비문학','문학','문법']},
      {name:'복습',color:'#4E606C',scopes:[]},
      {name:'정리',color:'#A6603C',scopes:['이월 처리']}],
    dayStart,templates,
    day:{date:dateStr(now),weekday:now.getDay(),done:{},carryover:[],ritualDone:false,blocks:[],planMode:'free'},
    learnings:[],weeklyRule:null,rules:[],
    calendar:{events:[]},
    subjectAliases:{},
    coldstart:{done:false,vision:null,identity:null,motivation:null,challenge:null,completedAt:null},
    log:[],focus:null};
}

function migrateV2(old){
  try{const nd=buildDefault();
    nd.settings=old.settings||nd.settings;nd.log=old.log||[];
    if(old.day)nd.day=old.day;
    if(old.templates){nd.templates={};nd.dayStart={};
      for(let d=0;d<7;d++){const arr=(old.templates[d]||[]).slice().sort((a,b)=>toMin(a.start)-toMin(b.start));
        nd.dayStart[d]=arr.length?arr[0].start:(d===0||d===6?'10:00':'14:00');
        nd.templates[d]=arr.map(b=>({id:b.id,type:b.type,dur:Math.max(5,toMin(b.end)-toMin(b.start)),label:b.label||'',scope:b.scope||'',color:b.color||COLORS[0]}));
      }}
    let mx=1000;Object.values(nd.templates).forEach(a=>a.forEach(b=>{if(b.id>mx)mx=b.id;}));
    nd.seq=mx+1;nd.focus=null;return nd;
  }catch(e){return buildDefault();}
}

const load=()=>{try{const r=store.get(KEY);if(r)return JSON.parse(r);}catch(e){}return null;};
// 디바운스 저장 — 드래그·연속 토글 같은 버스트를 합쳐 한 번만 기록한다.
// 렌더(renderToday)는 더 이상 저장을 트리거하지 않으므로 실제 상태변경 때만 호출됨.
// 앱이 백그라운드로 가거나 닫힐 때 flushSave()로 즉시 영속화(app.js에서 등록).
let _saveTimer=null;
function save(){if(_saveTimer)return;_saveTimer=setTimeout(()=>{_saveTimer=null;flushSave();},600);}
function flushSave(){if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}store.set(KEY,JSON.stringify(DB));}

function addLearning(fields) {
  if (!Array.isArray(DB.learnings)) DB.learnings = [];
  const l = {
    id:           DB.seq++,
    chapter:      fields.chapter      || 'time',
    text:         fields.text         || '',
    since:        fields.since        || DB.day.date,
    confidence:   fields.confidence   || 'tentative',
    score:        fields.score != null ? fields.score : (fields.confidence === 'confirmed' ? 0.7 : 0.45),
    status:       fields.status       || 'active',
    supersededBy: fields.supersededBy || null,
    supersededAt: fields.supersededAt || null,
    lastEvolved:  null
  };
  DB.learnings.push(l);
  save();
  return l;
}

function supersedeLearning(id) {
  const l = (DB.learnings || []).find(x => x.id === id);
  if (!l) return null;
  l.status = 'superseded';
  l.supersededAt = DB.day.date;
  save();
  return l;
}

function setWeeklyRule(fields) {
  DB.weeklyRule = { text: fields.text, setAt: fields.setAt || DB.day.date, active: fields.active !== false };
  save();
  return DB.weeklyRule;
}

function addRule(fields) {
  if (!Array.isArray(DB.rules)) DB.rules = [];
  const r = {
    id:     DB.seq++,
    text:   fields.text   || '',
    setAt:  fields.setAt  || DB.day.date,
    active: fields.active !== false,
    scope:  fields.scope  || {},
    effect: fields.effect || { type: 'prefer' }
  };
  DB.rules.push(r);
  save();
  return r;
}

function deleteRule(id) {
  if (Array.isArray(DB.rules)) DB.rules = DB.rules.filter(r => r.id !== id);
  save();
}

function toggleRule(id) {
  const r = (DB.rules || []).find(x => x.id === id);
  if (r) { r.active = !r.active; save(); }
  return r;
}

function addCalendarEvent(fields) {
  if (!DB.calendar) DB.calendar = { events: [] };
  if (!Array.isArray(DB.calendar.events)) DB.calendar.events = [];
  const ev = {
    id: DB.seq++,
    date: fields.date,
    title: fields.title || '',
    category: fields.category || 'etc',
    alertDaysBefore: Array.isArray(fields.alertDaysBefore) ? fields.alertDaysBefore : (typeof fields.alertDaysBefore === 'number' && fields.alertDaysBefore > 0 ? [fields.alertDaysBefore] : [])
  };
  DB.calendar.events.push(ev);
  save();
  return ev;
}

function deleteCalendarEvent(id) {
  if (!DB.calendar || !Array.isArray(DB.calendar.events)) return;
  DB.calendar.events = DB.calendar.events.filter(e => e.id !== id);
  save();
}

// 과목 이름 정규화 — trim + 별칭 맵 조회(대소문자 무시). 기록 시점에 한 번 통과시켜
// "math"/"수학1" 분산이 집계를 쪼개지 않게 한다. 별칭은 settings의 과목 정리에서 등록.
function canonSubject(name) {
  const t = (name || '').trim();
  if (!t) return t;
  return (DB.subjectAliases && DB.subjectAliases[t.toLowerCase()]) || t;
}

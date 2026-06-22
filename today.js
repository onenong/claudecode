"use strict";

/* ===== sheets ===== */
function openSheet(title){$('#sheetTitle').textContent=title;const b=$('#sheetBody');b.innerHTML='';$('#sheetBack').classList.add('on');$('#sheet').classList.add('on');return b;}
function closeSheet(){$('#sheetBack').classList.remove('on');$('#sheet').classList.remove('on');}
function openSubjectSheet(b){
  const body=openSheet('과목 선택');
  DB.presets.forEach(p=>{const o=document.createElement('button');o.className='opt';
    o.innerHTML=`<span class="dot" style="background:${p.color}"></span>${esc(p.name)}`;
    o.onclick=()=>{const prev=b.subject||b.label||'';b.subject=p.name;b.color=p.color;if(!b.label||b.label===prev)b.label=p.name;save();closeSheet();renderToday();
      if(p.scopes&&p.scopes.length)setTimeout(()=>openScopeSheet(b),270);};
    body.appendChild(o);});
  const c=document.createElement('button');c.className='opt add';c.textContent='✏️ 직접 입력';
  c.onclick=()=>{const n=prompt('과목 이름(짧게)',b.subject||b.label||'');if(n!==null){const t=n.trim();const prev=b.subject||b.label||'';b.subject=t;if(!b.label||b.label===prev)b.label=t;save();renderToday();}closeSheet();};
  body.appendChild(c);
}
function openScopeSheet(b){
  const body=openSheet('범위 선택'+(b.label?' · '+b.label:''));
  const p=DB.presets.find(x=>x.name===b.label);
  const w=document.createElement('div');w.className='chips-wrap';
  ((p&&p.scopes)||[]).forEach(s=>{const c=document.createElement('button');c.className='dchip'+(b.scope===s?' sel':'');c.textContent=s;
    c.onclick=()=>{b.scope=s;save();closeSheet();renderToday();};w.appendChild(c);});
  if(w.children.length)body.appendChild(w);
  const cu=document.createElement('button');cu.className='opt add';cu.textContent='✏️ 직접 입력';
  cu.onclick=()=>{const n=prompt('범위',b.scope||'');if(n!==null){b.scope=n.trim();save();renderToday();}closeSheet();};
  body.appendChild(cu);
  const cl=document.createElement('button');cl.className='opt add';cl.textContent='비우기';
  cl.onclick=()=>{b.scope='';save();closeSheet();renderToday();};body.appendChild(cl);
}
function openDurationSheet(b){
  const body=openSheet('블록 길이 선택');
  const w=document.createElement('div');w.className='chips-wrap';
  [10,15,20,30,45,60,75,90,120].forEach(m=>{const c=document.createElement('button');c.className='dchip'+(b.dur===m?' sel':'');c.textContent=m+'분';
    c.onclick=()=>{b.dur=m;save();closeSheet();layout(viewDay);renderToday();};w.appendChild(c);});
  body.appendChild(w);
  const cu=document.createElement('button');cu.className='opt add';cu.textContent='✏️ 직접 입력(분)';
  cu.onclick=()=>{const n=prompt('몇 분?',b.dur);if(n!==null){const v=parseInt(n,10);if(v>0){b.dur=v;save();layout(viewDay);renderToday();}}closeSheet();};
  body.appendChild(cu);
}

/* ===== today ===== */
function renderChips(){
  const c=$('#chips');c.innerHTML='';
  for(let i=1;i<=7;i++){const d=i%7;const chip=document.createElement('button');
    chip.className='chip'+(d===viewDay?' sel':'');chip.innerHTML=DOW[d]+(d===today()?'<span class="td"></span>':'');
    chip.onclick=()=>{viewDay=d;renderToday();};c.appendChild(chip);}
  $('#editnote').innerHTML=isToday()?'':`<div class="editnote">${DOW[viewDay]}요일 시간표 편집 중 — 체크·알림은 오늘만 작동해요</div>`;
}
function renderDayStart(){
  const w=$('#dayStartWrap');w.innerHTML='';
  if(isToday()&&DB.day.planMode==='free'){w.style.display='none';return;}
  w.style.display='';
  const lab=document.createElement('span');lab.className='ds-lab';lab.textContent='하루 시작';
  const inp=document.createElement('input');inp.type='time';inp.className='ds-input';inp.value=DB.dayStart[viewDay]||'14:00';
  const applyDS=()=>{
    if(!inp.value||inp.value===(DB.dayStart[viewDay]||'14:00'))return;
    DB.dayStart[viewDay]=inp.value;layout(viewDay);renderToday();
  };
  inp.onchange=applyDS;inp.onblur=applyDS;
  w.append(lab,inp);
}
function renderToday(){
  layout(viewDay);renderChips();renderDayStart();maybeShowRitualBanner();
  const spine=$('#spine');spine.innerHTML='';
  const isFree=isToday()&&DB.day.planMode==='free';
  if(!isFree){
    // day-start marker (reference line in timeline)
    const mrow=document.createElement('div');mrow.className='row';
    const mrail=document.createElement('div');mrail.className='rail';
    const mdot=document.createElement('div');mdot.className='dot';
    mdot.style.cssText='width:8px;height:8px;left:7px;top:17px;border-color:var(--soft);background:var(--canvas);opacity:.45';
    const mtime=document.createElement('span');mtime.className='time mono';mtime.style.opacity='.4';
    mtime.textContent=DB.dayStart[viewDay]||'14:00';
    mrail.append(mdot,mtime);
    const mlabel=document.createElement('div');mlabel.className='ds-marker-label';mlabel.textContent='하루 시작';
    mrow.append(mrail,mlabel);spine.appendChild(mrow);
  }
  const blocks=blocksFor(viewDay);
  if(!blocks.length){
    const help=document.createElement('div');help.className='help';help.style.cssText='padding:8px 0 8px 65px';
    help.textContent=(isToday()&&!DB.day.ritualDone)?'의도 설정을 마치면 블록이 여기 생겨요.':'블록이 없어요. 아래에서 추가해보세요.';
    spine.appendChild(help);
  }else{blocks.forEach(b=>spine.appendChild(b.type==='buffer'?bufferRow(b):blockRow(b)));}
  renderTray();attachDragAll();save();
}
function blockRow(b){
  const interactive=isToday();
  const done=interactive&&!!DB.day.done[b.id];
  const live=interactive&&toMin(b.start)<=nowHM()&&nowHM()<toMin(b.end);
  const row=document.createElement('div');row.className='row';row.dataset.id=b.id;
  const rail=document.createElement('div');rail.className='rail';
  const dotEl=document.createElement('div');dotEl.className='dot';dotEl.style.borderColor=b.color;
  const timeBtn=document.createElement('button');timeBtn.className='time mono'+(b.anchor?' anchored':'');
  timeBtn.textContent=b.start;timeBtn.onclick=()=>openAnchorSheet(b);
  rail.appendChild(dotEl);
  if(!(isToday()&&DB.day.planMode==='free'))rail.appendChild(timeBtn);
  const card=document.createElement('div');card.className='card'+(done?' done':'')+(live&&!done?' now':'');card.style.setProperty('--bar',b.color);
  const top=document.createElement('div');top.className='top';
  const ck=document.createElement('div');ck.className='check'+(done?' on':'')+(interactive?'':' ghost');ck.textContent=done?'✓':'';
  if(interactive)ck.onclick=()=>{setDone(b,!DB.day.done[b.id]);renderToday();};
  const body=document.createElement('div');body.className='body';
  const lbl=document.createElement('button');lbl.className='label-btn'+(b.label?'':' empty');lbl.textContent=b.label||'과목 선택';lbl.onclick=()=>openSubjectSheet(b);
  const scp=document.createElement('button');scp.className='scope-btn'+(b.scope?'':' empty');scp.textContent=b.scope||'+ 범위';scp.onclick=()=>openScopeSheet(b);
  body.append(lbl,scp);top.append(ck,body);
  const meta=document.createElement('div');meta.className='meta';
  const dur=document.createElement('button');dur.className='dur-chip';dur.textContent='⏱ '+b.dur+'분';dur.onclick=()=>openDurationSheet(b);
  meta.appendChild(dur);
  if(b.subject&&b.subject!==b.label){const sj=document.createElement('button');sj.className='dur-chip';sj.style.opacity='.7';sj.textContent=b.subject;sj.onclick=()=>openSubjectSheet(b);meta.appendChild(sj);}
  if(b.temp){const tp=document.createElement('span');tp.className='top3-pill';tp.textContent='오늘의 3';meta.appendChild(tp);}
  if(live&&!done){const p=document.createElement('span');p.className='now-pill';p.textContent='지금';meta.appendChild(p);}
  const grip=document.createElement('span');grip.className='grip';grip.textContent='⠿';meta.appendChild(grip);
  const act=document.createElement('div');act.className='actrow';
  if(interactive){const active=DB.focus&&DB.focus.blockId===b.id;
    const foc=document.createElement('button');foc.className='iconbtn focus-btn'+(active?' resume':'');
    foc.textContent=active?('▶ 이어서 '+fmtClock(elapsedMs())):'▶ 집중';foc.onclick=()=>enterFocus(b);act.appendChild(foc);}
  const carry=document.createElement('button');carry.className='iconbtn carry';carry.textContent='↩ 이월';carry.onclick=()=>doCarry(b);
  const del=document.createElement('button');del.className='iconbtn';del.textContent='삭제';
  del.onclick=()=>{setBlocksFor(viewDay,blocksFor(viewDay).filter(x=>x.id!==b.id));layout(viewDay);renderToday();};
  act.append(carry,del);
  card.append(top,meta,act);
  const w=document.createElement('div');w.appendChild(card);row.append(rail,w);return row;
}
function bufferRow(b){
  const row=document.createElement('div');row.className='row';row.dataset.id=b.id;
  const rail=document.createElement('div');rail.className='rail';
  const bDot=document.createElement('div');bDot.className='dot';
  bDot.style.cssText='width:8px;height:8px;left:7px;top:19px;border-color:var(--line)';
  rail.appendChild(bDot);
  if(!(isToday()&&DB.day.planMode==='free')){
    const bTime=document.createElement('span');bTime.className='time mono';
    bTime.style.cssText='padding-top:14px;opacity:.7';bTime.textContent=b.start;
    rail.appendChild(bTime);
  }
  const w=document.createElement('div');w.style.alignSelf='center';
  const buf=document.createElement('div');buf.className='buffer';
  const lab=document.createElement('button');lab.className='bl';lab.textContent='여유 '+b.dur+'분';lab.onclick=()=>openDurationSheet(b);
  const line=document.createElement('div');line.className='line';
  const x=document.createElement('span');x.className='x';x.textContent='✕';
  x.onclick=()=>{setBlocksFor(viewDay,blocksFor(viewDay).filter(z=>z.id!==b.id));layout(viewDay);renderToday();};
  buf.append(lab,line,x);w.appendChild(buf);row.append(rail,w);return row;
}
function deriveSlot(startHHMM){const h=toMin(startHHMM)/60;return h<12?'morning':(h<18?'afternoon':'evening');}
function logRecord(b,o){const ds=DB.day.date;const i=DB.log.findIndex(e=>e.date===ds&&e.ref===b.id);if(i>=0)DB.log.splice(i,1);
  DB.log.push({date:ds,ref:b.id,subject:(b.subject||b.label||'무제').trim(),minutes:o.minutes,planned:(o.planned!=null?o.planned:null),
    color:b.color,interruptions:o.interruptions||0,measured:!!o.measured,focusMode:!!o.measured,weekday:DB.day.weekday,slot:deriveSlot(b.start),ts:Date.now(),actualStart:o.actualStart||null});}
function setDone(b,val){const id=b.id,ds=DB.day.date;
  if(val){DB.day.done[id]=true;logRecord(b,{minutes:b.dur,planned:b.dur,interruptions:0,measured:false});}
  else{delete DB.day.done[id];const i=DB.log.findIndex(e=>e.date===ds&&e.ref===id);if(i>=0)DB.log.splice(i,1);if(DB.focus&&DB.focus.blockId===id)DB.focus=null;}}
function addBlock(type){
  const nb=type==='buffer'?{id:DB.seq++,type:'buffer',dur:15}
    :{id:DB.seq++,type:'study',dur:60,label:'',subject:'',scope:'',color:COLORS[blocksFor(viewDay).length%COLORS.length],anchor:null};
  blocksFor(viewDay).push(nb);layout(viewDay);renderToday();
  if(type==='study')setTimeout(()=>openSubjectSheet(nb),120);
}
function doCarry(b){if(!isToday()){toast('이월은 오늘 시간표에서만 돼요');return;}
  const r=prompt('이월함으로 보낼 남은 범위를 적어주세요.',b.scope?('남은: '+b.scope):'');if(r===null)return;
  if(r.trim())DB.day.carryover.push({id:DB.seq++,text:r.trim(),from:b.label||'?',done:false,addedDate:DB.day.date});setDone(b,true);renderToday();}
function renderTray(){
  const wrap=$('#trayWrap');if(!isToday()){wrap.innerHTML='';return;}
  wrap.innerHTML=`<div class="tray"><h2>↩ 이월함</h2><div class="sub">시간 안에 못 끝낸 범위는 여기로. 하루 끝 "정리" 블록에서 처리해요.</div><div id="clist"></div><button class="clearc" id="clearc">완료된 항목 정리</button></div>`;
  const c=$('#clist');
  if(!DB.day.carryover.length)c.innerHTML='<div class="empty">아직 이월된 게 없어요. 깔끔하네요.</div>';
  else DB.day.carryover.forEach(it=>{const row=document.createElement('div');row.className='citem'+(it.done?' done':'');
    const ck=document.createElement('div');ck.className='ck'+(it.done?' on':'');ck.textContent=it.done?'✓':'';ck.onclick=()=>{it.done=!it.done;renderToday();};
    const tx=document.createElement('div');tx.className='txt';tx.textContent=it.text;const fr=document.createElement('div');fr.className='from';fr.textContent=it.from;
    row.append(ck,tx,fr);c.appendChild(row);});
  $('#clearc').onclick=()=>{DB.day.carryover=DB.day.carryover.filter(x=>!x.done);renderToday();};
}

function openAnchorSheet(b){
  const body=openSheet('시계 고정');
  const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:12px';
  const lbl=document.createElement('span');lbl.className='ds-lab';lbl.textContent='고정 시각';
  const inp=document.createElement('input');inp.type='time';inp.className='ds-input';inp.value=b.anchor||b.start;
  row.append(lbl,inp);body.appendChild(row);
  const setBtn=document.createElement('button');setBtn.className='opt';
  setBtn.innerHTML='<span style="font-size:15px;flex:0 0 auto">📌</span> 이 시각에 고정';
  setBtn.onclick=()=>{
    // 앞 블록이 끝나는 시각 계산 — 그 이후에만 고정 가능
    let t=toMin(DB.dayStart[viewDay]||'14:00');
    for(const blk of blocksFor(viewDay)){
      if(blk.id===b.id)break;
      if(blk.anchor){const a=toMin(blk.anchor);if(a>t)t=a;}
      t+=blk.dur;
    }
    if(toMin(inp.value)<t){toast('앞 블록이 '+fromMin(t)+'까지 있어요. '+fromMin(t)+' 이후로 고정해보세요.');return;}
    b.anchor=inp.value;save();closeSheet();layout(viewDay);renderToday();
  };
  body.appendChild(setBtn);
  if(b.anchor){
    const clrBtn=document.createElement('button');clrBtn.className='opt add';clrBtn.textContent='고정 해제 — 자동 배치로';
    clrBtn.onclick=()=>{delete b.anchor;save();closeSheet();layout(viewDay);renderToday();};
    body.appendChild(clrBtn);
  }
}
function loadTemplate(d){
  DB.day.blocks=DB.templates[d].map(b=>({id:DB.seq++,type:b.type,dur:b.dur,label:b.label||'',subject:b.subject||b.label||'',scope:b.scope||'',color:b.color||COLORS[0],anchor:null}));
  layout(today());save();closeRitual(true);
  toast(DOW[d]+'요일 템플릿을 불러왔어요 — 드래그로 순서 바꿔도 돼요');
}

/* ===== drag reorder ===== */
function attachDragAll(){
  [...$('#spine').querySelectorAll('.row[data-id]')].forEach(row=>{
    const handle=row.querySelector('.card,.buffer');if(!handle)return;
    handle.addEventListener('pointerdown',ev=>onDown(ev,row));
  });
}
function onDown(ev,row){
  if(ev.button!=null&&ev.button!==0)return;
  if(ev.target.closest('button,input,select,.check,.x'))return;
  const startY=ev.clientY,startX=ev.clientX;let held=false;
  const timer=setTimeout(()=>{held=true;beginDrag(row,ev.clientY);},170);
  function mv(e){if(!held){if(Math.abs(e.clientY-startY)>8||Math.abs(e.clientX-startX)>8){clearTimeout(timer);fin();}return;}e.preventDefault();moveDrag(e.clientY);}
  function up(){clearTimeout(timer);if(held)endDrag();fin();}
  function fin(){document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);}
  document.addEventListener('pointermove',mv,{passive:false});
  document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
}
function beginDrag(row,pointerY){
  const spine=$('#spine');
  const rows=[...spine.querySelectorAll('.row[data-id]')];
  const fromIdx=rows.indexOf(row);
  const geom=rows.map(r=>{const c=r.getBoundingClientRect();return{top:c.top,height:c.height,mid:c.top+c.height/2};});
  drag={row,id:+row.dataset.id,fromIdx,baseY:pointerY,geom,rows,targetIdx:fromIdx};
  row.classList.add('dragging');
  document.body.classList.add('dragging-active');
  rows.forEach(r=>{if(r!==row)r.style.transition='transform 0.15s ease';});
  if(navigator.vibrate)navigator.vibrate(8);
  moveDrag(pointerY);
}
function moveDrag(pointerY){
  if(!drag)return;
  drag.row.style.transform='translateY('+(pointerY-drag.baseY)+'px)';
  const rowH=drag.geom[drag.fromIdx].height;
  // count non-dragged rows whose midpoint is above the pointer → insertion index
  const targetIdx=drag.geom.filter((g,i)=>i!==drag.fromIdx&&g.mid<pointerY).length;
  drag.targetIdx=targetIdx;
  drag.rows.forEach((r,i)=>{
    if(i===drag.fromIdx)return;
    const j=i<drag.fromIdx?i:i-1; // index in the array-without-dragged-item
    let offset=0;
    if(j>=targetIdx&&i<drag.fromIdx)offset=rowH;      // shift down: make room above original position
    else if(j<targetIdx&&i>drag.fromIdx)offset=-rowH; // shift up: fill gap below original position
    r.style.transform='translateY('+offset+'px)';
  });
}
function endDrag(){
  const arr=blocksFor(viewDay),from=arr.findIndex(b=>b.id===drag.id);
  let to=drag.targetIdx;
  if(from>=0){const[m]=arr.splice(from,1);to=Math.max(0,Math.min(arr.length,to));arr.splice(to,0,m);}
  cleanupDrag();layout(viewDay);renderToday();save();
}
function cleanupDrag(){
  if(!drag)return;
  drag.rows.forEach(r=>{r.style.transition='';r.style.transform='';});
  drag.row.classList.remove('dragging');
  document.body.classList.remove('dragging-active');
  drag=null;
}

/* ===== focus ===== */
let fxInterval=null,fxBlock=null;
function elapsedMs(){const f=DB.focus;if(!f)return 0;return f.accumMs+(f.runningSince?(Date.now()-f.runningSince):0);}
function enterFocus(b){
  if(!isToday()){toast('집중은 오늘 시간표에서 시작해요');return;}
  layout(today());
  if(DB.focus&&DB.focus.blockId!==b.id){if(!confirm('다른 블록의 집중 세션이 진행 중이에요. 그건 기록 없이 버리고 새로 시작할까요?'))return;DB.focus=null;}
  if(!DB.focus)DB.focus={blockId:b.id,date:DB.day.date,accumMs:0,runningSince:Date.now(),interruptions:0,actualStart:Date.now()};
  else if(!DB.focus.runningSince)DB.focus.runningSince=Date.now();
  save();openFocusUI(b);
}
function openFocusUI(b){fxBlock=b;$('#fx-subj').textContent=b.label||'무제';$('#fx-scope').textContent=b.scope||'';
  $('#fx-plan').textContent=DB.day.planMode==='free'?(b.dur+'분 예정'):(b.start+'–'+b.end);$('#fx-hint').textContent='멈추면 시간도 멈춰요 · 완료를 눌러야 기록돼요';
  $('#focus').classList.add('on');renderFocus();clearInterval(fxInterval);fxInterval=setInterval(renderFocus,1000);}
function closeFocusUI(){$('#focus').classList.remove('on');clearInterval(fxInterval);fxInterval=null;fxBlock=null;}
function renderFocus(){const f=DB.focus,b=fxBlock;if(!f||!b)return;
  const el=elapsedMs(),planned=Math.max(1,b.dur),pms=planned*60000,over=el>pms;
  $('#fx-timer').textContent=fmtClock(el);const est=$('#fx-est');est.classList.toggle('over',over);
  est.textContent=over?('예상 '+planned+'분 · +'+Math.round((el-pms)/60000)+'분 초과'):('예상 '+planned+'분 · 남은 '+Math.max(0,Math.ceil((pms-el)/60000))+'분');
  const fill=$('#fx-fill');fill.style.width=Math.min(100,el/pms*100)+'%';fill.classList.toggle('over',over);
  $('#fx-play').textContent=f.runningSince?'⏸':'▶';$('#fx-intn').textContent=f.interruptions?(' '+f.interruptions):'';}
function fxToggle(){const f=DB.focus;if(!f)return;if(f.runningSince){f.accumMs+=Date.now()-f.runningSince;f.runningSince=null;}else f.runningSince=Date.now();save();renderFocus();}
function fxInterrupt(){if(!DB.focus)return;DB.focus.interruptions++;save();renderFocus();toast('방해 기록됨');}
function fxExit(){const f=DB.focus;if(f&&f.runningSince){f.accumMs+=Date.now()-f.runningSince;f.runningSince=null;}save();closeFocusUI();renderToday();}
function fxDone(){const f=DB.focus,b=fxBlock;if(!f||!b)return;
  if(f.runningSince){f.accumMs+=Date.now()-f.runningSince;f.runningSince=null;}
  const actual=Math.max(1,Math.round(f.accumMs/60000)),planned=Math.max(0,b.dur),intr=f.interruptions;
  logRecord(b,{minutes:actual,planned,interruptions:intr,measured:true,actualStart:f.actualStart||null});DB.day.done[b.id]=true;DB.focus=null;
  closeFocusUI();renderToday();save();toast('기록됨 · 실제 '+fmtMin(actual)+(intr?(' · 방해 '+intr):''));}

/* ===== ritual ===== */
let ritualState=null;
function maybeShowRitualBanner(){
  const el=$('#ritualBanner');if(!el)return;
  if(isToday()&&!DB.day.ritualDone){
    el.innerHTML=`<div class="rit-banner">
      <div class="rb-txt"><b>오늘의 의도를 정해볼까요?</b><p>다 쏟아내고, 셋만 골라서 예상 시간을 정해요. 1분이면 돼요.</p></div>
      <div class="rb-act"><button class="btn primary" id="rb-start">시작</button><button class="btn" id="rb-skip">생략</button></div>
    </div>`;
    $('#rb-start').onclick=openRitual;
    $('#rb-skip').onclick=()=>{DB.day.ritualDone=true;save();maybeShowRitualBanner();};
  }else{el.innerHTML='';}
}
function ritualPrefillFromCarryover(){
  const todayDate=DB.day.date;
  return (DB.day.carryover||[]).filter(c=>!c.done).map(c=>{
    const d=c.addedDate?Math.floor((new Date(todayDate)-new Date(c.addedDate))/86400000):0;
    return {text:c.text,fromCarry:true,carryId:c.id,predictMin:null,staleDays:Math.max(0,d),subject:''};
  });
}
function openRitual(){
  ritualState={screen:'dump',dump:ritualPrefillFromCarryover(),picked:[]};
  $('#ritual').classList.add('on');renderRitualScreen();
}
function closeRitual(markDone){
  $('#ritual').classList.remove('on');ritualState=null;
  if(markDone){DB.day.ritualDone=true;save();}
  renderToday();
}
function renderRitualScreen(){
  $('#rit-step').textContent=ritualState.screen==='dump'?'1 · 브레인덤프':ritualState.screen==='pick'?'2 · 오늘 지킬 3개':'3 · 계획 방식';
  if(ritualState.screen==='dump')renderDumpBody();else if(ritualState.screen==='pick')renderPickBody();else renderModeBody();
}
function renderDumpBody(){
  const body=$('#rit-body');
  body.innerHTML=`<div class="rit-title">오늘 머릿속에 있는 거, 다 꺼내볼까요?</div>
    <div class="rit-sub">판단하지 말고 떠오르는 대로요. 나중에 셋만 고를 거예요. (이월함에 있던 건 미리 채워뒀어요)</div>
    <div class="rit-tmpl"><div class="rit-tmpl-lbl">요일 템플릿으로 시작</div><div class="rit-tmpl-btns" id="rit-tmpl-btns"></div></div>
    <div class="rit-list" id="rit-list"></div>
    <div class="rit-add"><input id="rit-newtxt" placeholder="할 일 입력하고 추가"><button class="btn" id="rit-addbtn">추가</button></div>
    <div class="rit-foot"><button class="btn primary" id="rit-next">다음 — 셋 고르기</button></div>
    <button class="rit-skip" id="rit-skip1">오늘은 생략할게요</button>`;
  // template loader buttons
  const tmplBtns=$('#rit-tmpl-btns');
  const curWd=new Date().getDay();
  const yest=(curWd+6)%7;
  const makeT=(d,label)=>{
    const tb=document.createElement('button');tb.className='dchip rit-tmpl-chip'+(d===yest?' primary':'');
    tb.textContent=label||DOW[d]+'요일';
    const hasTmpl=DB.templates[d]&&DB.templates[d].length>0;
    if(!hasTmpl){tb.disabled=true;tb.style.opacity='.35';}
    tb.onclick=()=>loadTemplate(d);tmplBtns.appendChild(tb);
  };
  makeT(yest,'어제처럼 ('+DOW[yest]+')');
  for(let d=0;d<7;d++){if(d!==yest)makeT(d);}
  renderDumpList();
  $('#rit-addbtn').onclick=addDumpFromInput;
  $('#rit-newtxt').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addDumpFromInput();}};
  $('#rit-next').onclick=()=>{
    if(!ritualState.dump.length){toast('할 일이 없으면 오늘은 쉬어도 돼요');closeRitual(true);return;}
    ritualState.screen='pick';renderRitualScreen();
  };
  $('#rit-skip1').onclick=()=>closeRitual(true);
}
function addDumpFromInput(){
  const inp=$('#rit-newtxt'),v=inp.value.trim();if(!v)return;
  ritualState.dump.push({text:v,fromCarry:false,carryId:null,predictMin:null,subject:''});
  inp.value='';renderDumpList();
}
function renderDumpList(){
  const list=$('#rit-list');list.innerHTML='';
  if(!ritualState.dump.length){list.innerHTML='<div class="help">아직 없어요. 아래에 적어보세요.</div>';return;}
  ritualState.dump.forEach((it,i)=>{
    const row=document.createElement('div');row.className='rit-item';
    const inp=document.createElement('input');inp.value=it.text;inp.oninput=()=>{it.text=inp.value;};
    row.appendChild(inp);
    if(it.fromCarry){
      const tag=document.createElement('span');
      tag.className='carry-tag'+(it.staleDays>=3?' stale':'');
      if(it.staleDays>=3){
        tag.textContent=it.staleDays+'일 이월';tag.title='탭하면 이월함에서 내려놔요';
        tag.onclick=()=>{
          DB.day.carryover=DB.day.carryover.filter(c=>c.id!==it.carryId);
          ritualState.dump.splice(i,1);renderDumpList();save();
          toast('"'+it.text+'" 내려놨어요');
        };
      }else{tag.textContent='이월';}
      row.appendChild(tag);
    }
    const rm=document.createElement('button');rm.className='rm';rm.textContent='✕';
    rm.onclick=()=>{ritualState.dump.splice(i,1);renderDumpList();};
    row.appendChild(rm);list.appendChild(row);
  });
}
function renderPickBody(){
  const body=$('#rit-body');
  body.innerHTML=`<div class="rit-title">오늘 다 망해도, 이 셋은 지켜요</div>
    <div class="rit-sub">최대 3개. 의무가 아니라 보호 — 셋 중 하나만 해도 충분해요.</div>
    <div class="rit-counter" id="rit-counter"></div>
    <div class="rit-list" id="rit-picklist"></div>
    <div class="rit-foot"><button class="btn primary" id="rit-commit">다음 — 계획 방식 고르기</button></div>
    <button class="rit-skip" id="rit-skip2">오늘은 생략할게요</button>`;
  renderPickList();
  $('#rit-commit').onclick=()=>{
    const chosen=ritualState.picked.map(i=>ritualState.dump[i]).filter(it=>it.predictMin);
    if(ritualState.picked.length&&chosen.length<ritualState.picked.length){toast('각 항목의 예상 시간을 골라주세요');return;}
    ritualState.screen='mode';renderRitualScreen();
  };
  $('#rit-skip2').onclick=()=>closeRitual(true);
}
function renderModeBody(){
  const body=$('#rit-body');
  body.innerHTML=`<div class="rit-title">오늘 시간 고정 일정 있어?</div>
    <div class="rit-sub">학원, 약속 등 특정 시각에 맞춰야 하는 게 있으면 알려줘요.</div>
    <div class="rit-mode-opts" id="rit-mode-opts">
      <button class="btn primary" id="rit-mode-free">없어 — 자유롭게 할게</button>
      <button class="btn" id="rit-mode-timed">있어 — 시간 맞춰야 해</button>
    </div>
    <div id="rit-timed-wrap" style="display:none;margin-top:16px">
      <div class="rit-sub" style="margin-bottom:10px">첫 블록 시작 시각을 알려줘요</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span class="ds-lab">시작</span>
        <input type="time" id="rit-ds-inp" class="ds-input" value="${DB.dayStart[today()]||'14:00'}">
      </div>
      <button class="btn primary" style="width:100%" id="rit-timed-go">시작하기</button>
    </div>
    <button class="rit-skip" id="rit-skip3">이전 방식 유지하기</button>`;
  $('#rit-mode-free').onclick=()=>commitRitual('free',null);
  $('#rit-mode-timed').onclick=()=>{$('#rit-mode-opts').style.display='none';$('#rit-timed-wrap').style.display='';};
  $('#rit-timed-go').onclick=()=>commitRitual('timed',$('#rit-ds-inp').value||'14:00');
  $('#rit-skip3').onclick=()=>commitRitual(DB.day.planMode||'free',null);
}
function renderPickList(){
  $('#rit-counter').textContent=`오늘 지킬 3개 · ${ritualState.picked.length}/3 선택`;
  const list=$('#rit-picklist');list.innerHTML='';
  ritualState.dump.forEach((it,i)=>{
    const isPicked=ritualState.picked.includes(i);
    const row=document.createElement('div');row.className='rit-pickrow'+(isPicked?' picked':'');
    const main=document.createElement('button');main.className='rit-pickmain';
    main.innerHTML=`<span class="rit-checkdot${isPicked?' on':''}">${isPicked?'✓':''}</span><span class="rit-picktxt">${esc(it.text)}</span>`;
    main.onclick=()=>togglePick(i);row.appendChild(main);
    if(isPicked){
      const pr=document.createElement('div');pr.className='rit-predict';
      [15,20,30,45,60,75,90,120].forEach(m=>{
        const c=document.createElement('button');c.className='dchip'+(it.predictMin===m?' sel':'');c.textContent=m+'분';
        c.onclick=()=>{it.predictMin=m;renderPickList();};pr.appendChild(c);
      });
      row.appendChild(pr);
      // 분석용 canonical subject 선택
      const sr=document.createElement('div');sr.className='rit-predict';sr.style.marginTop='4px';
      const sl=document.createElement('span');sl.className='ds-lab';sl.style.cssText='font-size:11px;opacity:.6;margin-right:4px';sl.textContent='과목';sr.appendChild(sl);
      DB.presets.forEach(p=>{
        const c=document.createElement('button');c.className='dchip'+(it.subject===p.name?' sel':'');c.textContent=p.name;
        c.onclick=()=>{it.subject=p.name;renderPickList();};sr.appendChild(c);
      });
      const cu=document.createElement('button');cu.className='dchip';cu.textContent='기타...';
      cu.onclick=()=>{const n=prompt('과목 이름(짧게)',it.subject||'');if(n&&n.trim()){it.subject=n.trim();renderPickList();}};
      sr.appendChild(cu);
      row.appendChild(sr);
    }
    list.appendChild(row);
  });
}
function togglePick(i){
  const idx=ritualState.picked.indexOf(i);
  if(idx>=0)ritualState.picked.splice(idx,1);
  else{if(ritualState.picked.length>=3){toast('이미 3개를 골랐어요 — 하나를 빼고 다시 골라보세요');return;}ritualState.picked.push(i);}
  renderPickList();
}
function commitRitual(planMode,dayStart){
  const chosen=ritualState.picked.map(i=>ritualState.dump[i]).filter(it=>it.predictMin);
  chosen.forEach((it,k)=>{
    DB.day.blocks.push({id:DB.seq++,type:'study',dur:it.predictMin,label:it.text,subject:(it.subject||it.text).trim(),scope:'',
      color:COLORS[(DB.day.blocks.length+k)%COLORS.length],anchor:null});
  });
  chosen.forEach(it=>{if(it.fromCarry)DB.day.carryover=DB.day.carryover.filter(c=>c.id!==it.carryId);});
  ritualState.dump.forEach((it,i)=>{
    if(!ritualState.picked.includes(i)&&!it.fromCarry)DB.day.carryover.push({id:DB.seq++,text:it.text,from:'오늘 덤프',done:false,addedDate:DB.day.date});
  });
  DB.day.planMode=planMode||'free';
  if(planMode==='timed'&&dayStart)DB.dayStart[today()]=dayStart;
  toast(chosen.length?`오늘 지킬 ${chosen.length}개가 추가됐어요 · 순서는 드래그로 옮겨도 돼요`:'오늘은 가볍게 시작해요');
  closeRitual(true);
}

"use strict";
  /* ===== settings ===== */
  function renderPresets(){
    const box=$('#presetBox');box.innerHTML='';
    DB.presets.forEach((p,i)=>{const row=document.createElement('div');row.className='preset-row';
      const dot=document.createElement('button');dot.className='pdot';dot.style.background=p.color;
      dot.onclick=()=>{const idx=(COLORS.indexOf(p.color)+1)%COLORS.length;p.color=COLORS[idx];save();renderPresets();};
      const info=document.createElement('div');info.className='pinfo';info.innerHTML=`<b>${esc(p.name)}</b><p>${p.scopes.length?esc(p.scopes.join(', ')):'범위 없음'}</p>`;
      const edit=document.createElement('button');edit.className='iconbtn';edit.textContent='편집';
      edit.onclick=()=>{const n=prompt('과목 이름',p.name);if(n===null)return;const sc=prompt('자주 쓰는 범위 (쉼표로 구분)',p.scopes.join(', '));if(sc===null)return;
        p.name=n.trim()||p.name;p.scopes=sc.split(',').map(s=>s.trim()).filter(Boolean);save();renderPresets();};
      const del=document.createElement('button');del.className='iconbtn';del.textContent='삭제';
      del.onclick=()=>{if(confirm(p.name+' 프리셋을 지울까요?')){DB.presets.splice(i,1);save();renderPresets();}};
      row.append(dot,info,edit,del);box.appendChild(row);});
  }
  function buildSettings(){
    $('#sw-theme').onclick=()=>{DB.settings.theme=DB.settings.theme==='dark'?'light':'dark';applyTheme();save();};
    const swA=$('#sw-alert');const paint=()=>swA.classList.toggle('on',!!DB.settings.alerts);paint();
    swA.onclick=async()=>{if(!DB.settings.alerts){let g=true;if('Notification'in window){try{g=(await Notification.requestPermission())==='granted';}catch(e){g=false;}if(!g)$('#alert-desc').textContent='브라우저 알림이 차단돼 화면 안 배너로 알려드려요.';}DB.settings.alerts=true;}else DB.settings.alerts=false;paint();save();};
    renderPresets();
    $('#addPreset').onclick=()=>{const n=prompt('새 과목 이름');if(n&&n.trim()){DB.presets.push({name:n.trim(),color:COLORS[DB.presets.length%COLORS.length],scopes:[]});save();renderPresets();}};
    const from=$('#cp-from'),to=$('#cp-to');from.innerHTML='';to.innerHTML='';
    for(let i=1;i<=7;i++){const d=i%7;from.add(new Option(DOW[d]+'요일',d));}
    [['mon-fri','평일(월~금)'],['sat-sun','주말(토·일)'],['all','전체']].forEach(([v,l])=>to.add(new Option(l,v)));
    for(let i=1;i<=7;i++){const d=i%7;to.add(new Option(DOW[d]+'요일',d));}
    from.value=String(today());
    $('#cp-go').onclick=()=>{const src=Number(from.value),tv=to.value;let tg=[];
      if(tv==='mon-fri')tg=[1,2,3,4,5];else if(tv==='sat-sun')tg=[6,0];else if(tv==='all')tg=[0,1,2,3,4,5,6];else tg=[Number(tv)];
      tg=tg.filter(t=>t!==src);if(!tg.length){toast('다른 요일을 골라주세요');return;}
      tg.forEach(t=>{DB.templates[t]=blocksFor(src).filter(b=>!b.temp).map(b=>Object.assign({},b,{id:DB.seq++}));DB.dayStart[t]=DB.dayStart[src];});
      save();toast(DOW[src]+'요일 → '+tg.length+'개 요일에 복사됐어요');if(tg.includes(viewDay)&&currentView==='today')renderToday();};
    $('#wipe').onclick=()=>{if(confirm('정말 전부 지울까요? 되돌릴 수 없어요.')){DB=buildDefault();viewDay=today();applyTheme();save();show('today').then(()=>toast('초기화됐어요'));}};
  }

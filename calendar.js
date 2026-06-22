"use strict";

const CAT_COLOR = { deadline:'var(--clay)', exam:'var(--amber)', meeting:'var(--pine)', etc:'var(--soft)' };
const CAT_EMOJI = { deadline:'📝', exam:'🧪', meeting:'👥', etc:'📌' };
const CAT_LABEL = { deadline:'마감', exam:'시험', meeting:'미팅', etc:'기타' };
const CAT_KEYS  = ['deadline','exam','meeting','etc'];

let _calYear = null, _calMonth = null;
let _calNotifiedDate = null;
const _calNotified = new Set();

function _ddayStr(ds) {
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(ds + 'T00:00:00');
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return 'D-day';
  return 'D-' + diff;
}

function checkCalendarAlerts() {
  if (!DB.calendar || !Array.isArray(DB.calendar.events)) return;
  const todayStr = dateStr(new Date());
  if (_calNotifiedDate !== todayStr) { _calNotified.clear(); _calNotifiedDate = todayStr; }
  DB.calendar.events.forEach(ev => {
    const days = Array.isArray(ev.alertDaysBefore) ? ev.alertDaysBefore
      : (ev.alertDaysBefore > 0 ? [ev.alertDaysBefore] : []);
    days.forEach(d => {
      const target = new Date(ev.date + 'T00:00:00');
      target.setDate(target.getDate() - d);
      if (dateStr(target) !== todayStr) return;
      const key = ev.id + ':' + d + ':' + todayStr;
      if (_calNotified.has(key)) return;
      _calNotified.add(key);
      const dds = _ddayStr(ev.date);
      const msg = '⏰ ' + ev.title + (dds ? ' ' + dds : '');
      let shown = false;
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(msg, { body: ev.date }); shown = true; } catch(e) {}
      }
      if (!shown) toast(msg);
    });
  });
}

function renderCalendar() {
  const main = document.getElementById('main-content');
  if (!main) return;
  // calendar.html 캐시 여부와 무관하게 JS에서 직접 구조 주입
  main.innerHTML =
    '<header>' +
    '<div class="kicker">Calendar</div>' +
    '<div class="cal-month-nav">' +
    '<button class="cal-nav-btn" id="calPrev"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>' +
    '<span class="cal-month-label" id="calMonthLabel"></span>' +
    '<button class="cal-nav-btn" id="calNext"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>' +
    '</div></header>' +
    '<div class="cal-grid" id="calGrid"></div>' +
    '<div class="panel" style="margin-top:4px"><h2>이번 주</h2><div id="calWeekList"></div></div>';

  const now = new Date();
  if (_calYear == null) { _calYear = now.getFullYear(); _calMonth = now.getMonth(); }
  _renderMonthLabel();
  _renderMonthGrid();
  _renderCalWeekList();
  $('#calPrev').onclick = () => {
    _calMonth--;
    if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    _renderMonthLabel(); _renderMonthGrid();
  };
  $('#calNext').onclick = () => {
    _calMonth++;
    if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    _renderMonthLabel(); _renderMonthGrid();
  };
}

function _renderMonthLabel() {
  $('#calMonthLabel').textContent = `${_calYear}년 ${_calMonth + 1}월`;
}

function _evMap() {
  const m = {};
  ((DB.calendar && DB.calendar.events) || []).forEach(e => {
    if (!m[e.date]) m[e.date] = [];
    m[e.date].push(e);
  });
  return m;
}

function _renderMonthGrid() {
  const grid = $('#calGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const todayStr = dateStr(new Date());
  const evMap = _evMap();
  const startDow = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const prevMonthLast = new Date(_calYear, _calMonth, 0).getDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  DOW.forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-head';
    h.textContent = d;
    grid.appendChild(h);
  });

  for (let i = 0; i < totalCells; i++) {
    let date, otherMonth = false;
    if (i < startDow) {
      date = new Date(_calYear, _calMonth - 1, prevMonthLast - startDow + i + 1);
      otherMonth = true;
    } else if (i >= startDow + daysInMonth) {
      date = new Date(_calYear, _calMonth + 1, i - startDow - daysInMonth + 1);
      otherMonth = true;
    } else {
      date = new Date(_calYear, _calMonth, i - startDow + 1);
    }

    const ds = dateStr(date);
    const isTodayCell = ds === todayStr;
    const isPast = ds < todayStr;

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (otherMonth ? ' other-month' : '') + (isPast && !otherMonth ? ' past' : '');

    const numWrap = document.createElement('div');
    numWrap.className = 'cal-num-wrap';
    if (isTodayCell) {
      const badge = document.createElement('span');
      badge.className = 'cal-today-badge';
      badge.textContent = date.getDate();
      numWrap.appendChild(badge);
    } else {
      const num = document.createElement('span');
      num.className = 'cal-date-num';
      num.textContent = date.getDate();
      numWrap.appendChild(num);
    }
    cell.appendChild(numWrap);

    const dayEvents = evMap[ds] || [];

    if (!isPast && !otherMonth && dayEvents.length) {
      const dds = _ddayStr(ds);
      if (dds) {
        const ddBadge = document.createElement('div');
        ddBadge.className = 'cal-dday-badge';
        ddBadge.style.color = CAT_COLOR[dayEvents[0].category] || 'var(--soft)';
        ddBadge.textContent = dds;
        cell.appendChild(ddBadge);
      }
    }

    if (dayEvents.length) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'cal-dots-wrap';
      dayEvents.slice(0, 3).forEach(ev => {
        const dot = document.createElement('span');
        dot.className = 'cal-ev-dot';
        dot.style.background = CAT_COLOR[ev.category] || 'var(--soft)';
        dotsWrap.appendChild(dot);
      });
      cell.appendChild(dotsWrap);
    }

    cell.onclick = () => openCalSheet(ds);
    grid.appendChild(cell);
  }
}

function _renderCalWeekList() {
  const list = $('#calWeekList');
  if (!list) return;
  list.innerHTML = '';
  const now = new Date();
  const todayStr = dateStr(now);
  const endStr = dateStr(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

  const events = ((DB.calendar && DB.calendar.events) || [])
    .filter(e => e.date >= todayStr && e.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!events.length) {
    list.innerHTML = '<div class="help" style="padding:4px 0">이번 주 고정 일정 없어요</div>';
    return;
  }
  events.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'cal-week-ev';
    const d = new Date(ev.date + 'T00:00:00');
    const dds = _ddayStr(ev.date);

    const dateEl = document.createElement('span');
    dateEl.className = 'cal-week-date mono';
    dateEl.textContent = DOW[d.getDay()] + '요일';

    const titleEl = document.createElement('span');
    titleEl.className = 'cal-week-title';
    titleEl.innerHTML = `<span style="margin-right:4px">${CAT_EMOJI[ev.category] || '📌'}</span>${esc(ev.title)}`;

    row.append(dateEl, titleEl);

    if (dds) {
      const ddEl = document.createElement('span');
      ddEl.className = 'cal-week-dday';
      ddEl.style.color = CAT_COLOR[ev.category] || 'var(--soft)';
      ddEl.textContent = dds;
      row.appendChild(ddEl);
    }

    list.appendChild(row);
  });
}

function openCalSheet(ds) {
  const d = new Date(ds + 'T00:00:00');
  const body = openSheet(`${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`);

  const existing = ((DB.calendar && DB.calendar.events) || []).filter(e => e.date === ds);
  if (existing.length) {
    const hdr = document.createElement('div');
    hdr.className = 'cal-sheet-hdr';
    hdr.textContent = '일정';
    body.appendChild(hdr);
    existing.forEach(ev => {
      const row = document.createElement('div');
      row.className = 'cal-sheet-ev';
      const info = document.createElement('div');
      info.className = 'cal-sheet-ev-info';
      const dot = document.createElement('span');
      dot.className = 'cal-sheet-dot';
      dot.style.background = CAT_COLOR[ev.category] || 'var(--soft)';
      const txt = document.createElement('span');
      txt.textContent = `${CAT_EMOJI[ev.category] || '📌'} ${ev.title}`;
      info.append(dot, txt);
      const del = document.createElement('button');
      del.className = 'cal-sheet-del';
      del.textContent = '삭제';
      del.onclick = () => {
        deleteCalendarEvent(ev.id);
        closeSheet();
        _renderMonthGrid();
        _renderCalWeekList();
      };
      row.append(info, del);
      body.appendChild(row);
    });
    const divider = document.createElement('div');
    divider.className = 'cal-sheet-divider';
    body.appendChild(divider);
  }

  const addHdr = document.createElement('div');
  addHdr.className = 'cal-sheet-hdr';
  addHdr.textContent = '새 일정 추가';
  body.appendChild(addHdr);

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = '제목 입력';
  inp.className = 'cal-sheet-inp';
  body.appendChild(inp);

  // Category chips
  const catWrap = document.createElement('div');
  catWrap.className = 'chips-wrap';
  catWrap.style.marginBottom = '10px';
  let selCat = 'etc';
  CAT_KEYS.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'dchip' + (cat === selCat ? ' sel' : '');
    chip.textContent = `${CAT_EMOJI[cat]} ${CAT_LABEL[cat]}`;
    chip.onclick = () => {
      selCat = cat;
      catWrap.querySelectorAll('.dchip').forEach(c => c.classList.remove('sel'));
      chip.classList.add('sel');
    };
    catWrap.appendChild(chip);
  });
  body.appendChild(catWrap);

  // Alert selector
  const alertHdr = document.createElement('div');
  alertHdr.className = 'cal-sheet-hdr';
  alertHdr.textContent = '알림';
  body.appendChild(alertHdr);

  const alertWrap = document.createElement('div');
  alertWrap.className = 'chips-wrap';
  alertWrap.style.marginBottom = '12px';
  const selAlerts = new Set();
  [{v:1,l:'1일 전'},{v:3,l:'3일 전'},{v:7,l:'7일 전'},{v:14,l:'14일 전'}].forEach(opt => {
    const chip = document.createElement('button');
    chip.className = 'dchip';
    chip.textContent = opt.l;
    chip.onclick = () => {
      if (selAlerts.has(opt.v)) { selAlerts.delete(opt.v); chip.classList.remove('sel'); }
      else { selAlerts.add(opt.v); chip.classList.add('sel'); }
    };
    alertWrap.appendChild(chip);
  });
  body.appendChild(alertWrap);

  const confirm = document.createElement('button');
  confirm.className = 'btn primary';
  confirm.style.cssText = 'width:100%;margin-top:4px';
  confirm.textContent = '추가';
  confirm.onclick = () => {
    const t = inp.value.trim();
    if (!t) { toast('제목을 입력해주세요'); return; }
    addCalendarEvent({ date: ds, title: t, category: selCat, alertDaysBefore: Array.from(selAlerts) });
    closeSheet();
    _renderMonthGrid();
    _renderCalWeekList();
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); confirm.click(); } };
  body.appendChild(confirm);
}

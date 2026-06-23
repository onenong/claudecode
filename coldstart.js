"use strict";

let _csStep = 1;
const _csAnswers = { vision: '', identity: '', motivation: '', challenge: '' };
// 칩 선택 단계(identity·motivation)의 선택 상태·기타입력 — 뒤로/앞으로 이동 간 유지.
const _csChipSel = { identity: new Set(), motivation: new Set() };
const _csCustom  = { identity: '', motivation: '' };

const _CS_STEPS = [
  { key: 'vision',     title: '어디로 가고 싶어?',           sub: '목표가 아니라 방향으로. 5년 뒤, 10년 뒤, 혹은 지금.',             placeholder: '예: 이해하고 즐기는 공부를 하고 싶어', btn: '다음' },
  { key: 'identity',   title: '공부할 때 넌 어떤 사람이야?', sub: '고르거나 직접 적어도 돼. 여러 개 골라도 괜찮아. 필수 아니야.',     btn: '다음', multi: true,
    chips: ['빨리 이해하는 편', '꾸준히 하는 편', '집중력이 강한 편', '마감에 강한 편', '차분한 편', '몰입하면 깊게 파는 편'] },
  { key: 'motivation', title: '왜 공부해?',                  sub: '가장 가까운 걸 고르거나 직접 적어도 돼. 패스해도 괜찮아.',         btn: '다음', multi: false,
    chips: ['이해하는 게 즐거워서', '성적·입시', '더 나은 내가 되려고', '불안을 줄이려고', '습관이라서'] },
  { key: 'challenge',  title: '지금 제일 힘든 부분은?',      sub: '없어도 괜찮아. 있으면 더 맞춤 코칭을 해줄 수 있어.',              placeholder: '예: 저녁에 집중이 안 돼, 암기가 약해', btn: '시작하기' }
];

function openColdstart() {
  _csStep = 1;
  _CS_STEPS.forEach(s => { _csAnswers[s.key] = ''; });
  _csChipSel.identity.clear(); _csChipSel.motivation.clear();
  _csCustom.identity = ''; _csCustom.motivation = '';
  document.getElementById('coldstart').classList.add('on');
  _renderCsStep();
}

// 단계 입력을 _csAnswers에 반영. 칩 단계는 선택 칩 + 기타입력을 합쳐 저장.
function _saveCsStep(step, val) {
  val = (val || '').trim();
  if (step.chips) {
    _csCustom[step.key] = val;
    _csAnswers[step.key] = [...(_csChipSel[step.key]), val].filter(Boolean).join(', ');
  } else {
    _csAnswers[step.key] = val;
  }
}

function _closeColdstart() {
  document.getElementById('coldstart').classList.remove('on');
}

function _renderCsStep() {
  const top  = document.getElementById('cs-top');
  const body = document.getElementById('cs-body');
  if (_csStep > 4) { _renderCsFinale(top, body); return; }

  const step = _CS_STEPS[_csStep - 1];

  // ── top bar ──
  top.innerHTML = '';
  if (_csStep > 1) {
    const back = document.createElement('button');
    back.className = 'rit-close'; back.textContent = '← 뒤로'; back.style.fontSize = '13px';
    back.onclick = () => { _csStep--; _renderCsStep(); };
    top.appendChild(back);
  } else { top.appendChild(document.createElement('span')); }
  const lbl = document.createElement('span');
  lbl.className = 'rit-step mono'; lbl.textContent = _csStep + ' / 4';
  top.appendChild(lbl);

  // ── body ──
  body.innerHTML = '';

  // progress dots
  const prog = document.createElement('div'); prog.className = 'cs-progress';
  for (let i = 1; i <= 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'cs-prog-dot' + (i <= _csStep ? ' done' : '');
    prog.appendChild(dot);
  }
  body.appendChild(prog);

  const title = document.createElement('div'); title.className = 'rit-title'; title.textContent = step.title; body.appendChild(title);
  const sub   = document.createElement('div'); sub.className   = 'rit-sub';   sub.textContent   = step.sub;   body.appendChild(sub);

  // 칩 선택(identity·motivation) — 토글, multi 여부에 따라 단일/복수
  if (step.chips) {
    const cw = document.createElement('div'); cw.className = 'chips-wrap'; cw.style.marginBottom = '14px';
    const sel = _csChipSel[step.key];
    step.chips.forEach(txt => {
      const chip = document.createElement('button');
      chip.className = 'dchip' + (sel.has(txt) ? ' sel' : ''); chip.textContent = txt;
      chip.onclick = () => {
        if (sel.has(txt)) { sel.delete(txt); chip.classList.remove('sel'); }
        else {
          if (!step.multi) { sel.clear(); cw.querySelectorAll('.dchip').forEach(c => c.classList.remove('sel')); }
          sel.add(txt); chip.classList.add('sel');
        }
      };
      cw.appendChild(chip);
    });
    body.appendChild(cw);
  }

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = step.chips ? '기타 — 직접 적어도 돼 (선택)' : step.placeholder;
  inp.className = 'cal-sheet-inp'; inp.style.marginBottom = '20px';
  inp.value = step.chips ? (_csCustom[step.key] || '') : (_csAnswers[step.key] || '');
  body.appendChild(inp);
  if (!step.chips) setTimeout(() => inp.focus(), 120);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn primary'; nextBtn.style.cssText = 'width:100%';
  nextBtn.textContent = step.btn;
  nextBtn.onclick = () => { _saveCsStep(step, inp.value); _csStep++; _renderCsStep(); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); nextBtn.click(); } };
  body.appendChild(nextBtn);

  const skip = document.createElement('button');
  skip.className = 'rit-skip'; skip.textContent = '패스';
  skip.onclick = () => {
    if (step.chips) { _csChipSel[step.key].clear(); _csCustom[step.key] = ''; }
    _csAnswers[step.key] = ''; _csStep++; _renderCsStep();
  };
  body.appendChild(skip);
}

function _renderCsFinale(top, body) {
  top.innerHTML = '';
  const back = document.createElement('button');
  back.className = 'rit-close'; back.textContent = '← 뒤로'; back.style.fontSize = '13px';
  back.onclick = () => { _csStep = 4; _renderCsStep(); };
  top.appendChild(back);

  body.innerHTML = '';
  const title = document.createElement('div'); title.className = 'cs-finale-title'; title.textContent = '너를 이제 안 것 같아 :)'; body.appendChild(title);
  const sub   = document.createElement('div'); sub.className   = 'cs-finale-sub';   sub.textContent   = '하루하루 함께 배워가자.';   body.appendChild(sub);

  const startBtn = document.createElement('button');
  startBtn.className = 'btn primary'; startBtn.style.cssText = 'width:100%;font-size:15px;padding:14px';
  startBtn.textContent = '오늘 시작';
  startBtn.onclick = _commitColdstart;
  body.appendChild(startBtn);
}

function _commitColdstart() {
  DB.coldstart.done        = true;
  DB.coldstart.vision      = _csAnswers.vision      || null;
  DB.coldstart.identity    = _csAnswers.identity    || null;
  DB.coldstart.motivation  = _csAnswers.motivation  || null;
  DB.coldstart.challenge   = _csAnswers.challenge   || null;
  DB.coldstart.completedAt = DB.day.date;

  if (_csAnswers.identity) {
    addLearning({ chapter: 'strength', text: '지금까지는 ' + _csAnswers.identity,
      since: DB.day.date, confidence: 'tentative', status: 'active' });
  }
  if (_csAnswers.challenge) {
    addLearning({ chapter: _csChapter(_csAnswers.challenge),
      text: '지금까지는 ' + _csAnswers.challenge + ' 어려움을 느낀다',
      since: DB.day.date, confidence: 'tentative', status: 'active' });
  }

  save();
  _closeColdstart();
}

function _csChapter(text) {
  if (/저녁|새벽|아침|밤|시간대/.test(text)) return 'rhythm';
  if (/집중|산만|방해|유튜브|핸드폰|폰/.test(text)) return 'focus';
  if (/예상|계획|시간 감각|늘어|더 걸/.test(text)) return 'time';
  return 'focus';
}

function getColdstartHints(db) {
  if (!db || !db.coldstart || !db.coldstart.challenge) return [];
  const ch = db.coldstart.challenge;
  const hints = [];
  if (/저녁|밤|새벽/.test(ch)) {
    hints.push({ type: 'schedule', subject: null,
      text: '처음 설정에서 저녁 집중이 어렵다고 했어. 시간대 패턴이 쌓이면 더 자세히 살펴볼 수 있어.',
      signal: {} });
  }
  if (/집중|산만|방해/.test(ch)) {
    hints.push({ type: 'execution', subject: null,
      text: '처음 설정에서 집중이 어렵다고 했어. 집중 세션에서 방해 기록을 남길수록 패턴이 보여.',
      signal: {} });
  }
  return hints;
}

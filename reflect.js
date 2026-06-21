"use strict";
/* ===== reflect — 주간 회고 4단계 ===== */

let reflectState = null;

function renderReflect() {
  const now  = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i); days.push(dateStr(d));
  }
  const { signals, candidates } = analyzeWeek(DB.log, { start: days[0], end: days[days.length - 1] });
  const supersessions = checkSupersession(DB.learnings || [], signals);

  reflectState = {
    step:         1,
    weekDays:     days,
    weekLog:      DB.log.filter(e => days.includes(e.date)),
    signals,
    candidates,
    supersessions,
    weekLearning: null,
    weekRule:     null,
    supersededId: null   // 갱신 후 신규 배움에 supersededBy 연결용
  };
  renderReflStep();
}

function renderReflStep() {
  const root = $('#reflect-wrap'); if (!root) return;
  root.innerHTML = '';
  const NAMES = ['', '마주보기', '이월함 비우기', '배움 한 줄', '한 가지만 바꾸기'];

  if (reflectState.step <= 4) {
    const ind = document.createElement('div'); ind.className = 'refl-ind';
    ind.innerHTML = `<span class="refl-ind-num">${reflectState.step}/4</span>` +
                    `<span class="refl-ind-name">${NAMES[reflectState.step]}</span>`;
    root.appendChild(ind);
  }

  const step = reflectState.step;
  if      (step === 1) refl1(root);
  else if (step === 2) refl2(root);
  else if (step === 3) refl3(root);
  else if (step === 4) refl4(root);
  else                  reflFinish(root);
}

// ── 공통 헬퍼 ────────────────────────────────────
function rBtn(text, cls, onclick) {
  const el = document.createElement('button');
  el.className = cls; el.textContent = text; el.onclick = onclick; return el;
}
function reflNext(root, label, fn) { root.appendChild(rBtn(label, 'btn primary refl-next', fn)); }
function reflSkip(root, fn)        { root.appendChild(rBtn('건너뛰기', 'refl-skip-step', fn)); }

// ── 1단계: 마주보기 ──────────────────────────────
function refl1(root) {
  const { weekLog } = reflectState;
  const focused = weekLog.filter(e => e.focusMode === true);
  const logDays = new Set(weekLog.map(e => e.date));
  const avgInt  = focused.length
    ? Math.round(focused.reduce((s, e) => s + (e.interruptions || 0), 0) / focused.length * 10) / 10
    : 0;
  const biases  = getAllSubjectBiases(DB.log, 14);

  const biasDir = b => {
    if (b.direction === 'over')
      return b.trend === 'converging' ? '더 걸리는 편 · 정확해지는 중' : '늘 더 걸리는 편';
    if (b.direction === 'under')
      return b.trend === 'converging' ? '일찍 끝나는 편 · 정확해지는 중' : '일찍 끝나는 편';
    return b.trend === 'converging' ? '정확해지는 중' : '예상이 거의 정확해';
  };

  const biasLines = biases.map(b => {
    const ratio = b.avgRatio != null ? ` · ${Math.round(b.avgRatio * 10) / 10}배` : '';
    return `${esc(b.subject)} → ${biasDir(b)}${ratio}`;
  });
  const biasBody = biasLines.length
    ? biasLines.join('<br>')
    : '아직 과목별 패턴이 없어요 (집중모드 3회↑ 필요)';

  const panels = [
    { title: '시간관리',
      body: logDays.size
        ? `7일 중 ${logDays.size}일 의도 설정했어`
        : '이번 주 블록 기록이 없어요' },
    { title: '수행',
      body: focused.length
        ? `집중 세션 ${focused.length}회${avgInt > 0 ? ' · 평균 방해 ' + avgInt + '회' : ''}`
        : '이번 주 집중모드 기록이 없어요' },
    { title: '자기이해', body: biasBody }
  ];

  const wrap = document.createElement('div'); wrap.className = 'refl-panels';
  panels.forEach(p => {
    const el = document.createElement('div'); el.className = 'refl-panel';
    el.innerHTML = `<div class="refl-panel-title">${p.title}</div>` +
                   `<div class="refl-panel-body">${p.body}</div>`;
    wrap.appendChild(el);
  });
  root.appendChild(wrap);
  reflNext(root, '다음 — 이월함 비우기', () => { reflectState.step = 2; renderReflStep(); });
}

// ── 2단계: 이월함 비우기 ─────────────────────────
function refl2(root) {
  const hasItems = () => (DB.day.carryover || []).filter(c => !c.done).length > 0;

  if (!hasItems()) {
    const msg = document.createElement('div'); msg.className = 'refl-empty';
    msg.textContent = '이번 주 이월 없었어. 깔끔하네.';
    root.appendChild(msg);
    reflNext(root, '다음 — 배움 한 줄', () => { reflectState.step = 3; renderReflStep(); });
    return;
  }

  const list   = document.createElement('div'); list.className = 'refl-carry-list';
  const footer = document.createElement('div'); footer.className = 'refl-footer';
  root.append(list, footer);

  const refresh = () => {
    const items = (DB.day.carryover || []).filter(c => !c.done);
    list.innerHTML = ''; footer.innerHTML = '';

    if (!items.length) {
      list.innerHTML = '<div class="refl-carry-done">이월함 비워짐 ✓</div>';
      reflNext(footer, '다음 — 배움 한 줄', () => { reflectState.step = 3; renderReflStep(); });
      save(); return;
    }

    items.forEach(it => {
      const row = document.createElement('div'); row.className = 'refl-carry-item';
      row.innerHTML = `<div class="refl-carry-txt">${esc(it.text)}${it.from ? `<span class="from"> · ${esc(it.from)}</span>` : ''}</div>`;
      const acts = document.createElement('div'); acts.className = 'refl-carry-acts';
      acts.appendChild(rBtn('다음 주로', 'iconbtn', () => {
        it.addedDate = DB.day.date; save(); toast('"' + it.text + '" 다음 주로'); refresh();
      }));
      acts.appendChild(rBtn('버리기', 'iconbtn', () => {
        DB.day.carryover = DB.day.carryover.filter(c => c.id !== it.id);
        save(); toast('"' + it.text + '" 내려놨어요'); refresh();
      }));
      acts.appendChild(rBtn('쪼개기', 'iconbtn', () => {
        const n = prompt('새 항목으로 쪼갤게요. 줄바꿈으로 여러 개 입력해요.', it.text);
        if (n === null) return;
        const parts = n.split('\n').map(s => s.trim()).filter(Boolean);
        if (!parts.length) return;
        DB.day.carryover = DB.day.carryover.filter(c => c.id !== it.id);
        parts.forEach(p => DB.day.carryover.push({
          id: DB.seq++, text: p, from: it.from || '이월함', done: false, addedDate: DB.day.date
        }));
        save(); refresh();
      }));
      row.appendChild(acts); list.appendChild(row);
    });
    reflSkip(footer, () => { reflectState.step = 3; renderReflStep(); });
  };
  refresh();
}

// ── 3단계 내부 헬퍼 ──────────────────────────────

function _candChapter(type) {
  return ({
    execution:          'focus',
    schedule:           'rhythm',
    estimation:         'time',
    planning:           'time',
    strength_candidate: 'strength',
    rhythm:             'rhythm',
    question:           'focus'
  })[type] || 'focus';
}

function _candBasis(cand) {
  const s   = cand.subject || '';
  const sig = cand.signal  || {};
  const wk  = sig.spanWeeks ? `${Math.max(1, Math.round(sig.spanWeeks))}주` : '최근';
  switch (cand.type) {
    case 'estimation':
      return sig.direction === 'over'
        ? `${s} ${wk} 연속 예상보다 오래 걸렸어`
        : `${s} ${wk} 연속 예상보다 일찍 끝났어`;
    case 'execution':
      return `${s}: 방해 평균 ${Math.round((sig.avgInt || 0) * 10) / 10}회 / 세션`;
    case 'schedule':
      return s ? `${s}: 저녁 오버런 반복 패턴` : '특정 시간대에 방해 집중';
    case 'planning':
      return `${s}: scope 넓은 날 집중 길어짐`;
    case 'strength_candidate': {
      const cnt = sig.consecutiveCount;
      return sig.direction === 'accurate'
        ? `${s} ${cnt ? cnt + '회' : wk} 연속 예상 ≈ 실제`
        : `${s} ${wk} 연속 예상보다 일찍 끝났어`;
    }
    case 'rhythm':
      return `${s}: 자연적 시간대 패턴 ${wk}`;
    default: return '';
  }
}

function _candTemplate(cand) {
  const s   = cand.subject || '';
  const dir = (cand.signal || {}).direction;
  switch (cand.type) {
    case 'estimation':
      return dir === 'over'
        ? `지금까지는 ${s}이 생각보다 더 걸렸다`
        : `지금까지는 ${s}을 넉넉히 잡는 경향이 있었다`;
    case 'execution':  return `지금까지는 ${s} 할 때 방해가 자주 생겼다`;
    case 'schedule':   return s
      ? `지금까지는 저녁에 ${s}이 늦어지는 경향이 있었다`
      : `지금까지는 특정 시간대에 집중이 잘 안 됐다`;
    case 'planning':   return `지금까지는 ${s} 블록에 너무 많이 담으려 했다`;
    case 'strength_candidate':
      return dir === 'accurate'
        ? `지금까지는 ${s} 예상이 점점 정확해지고 있다`
        : `지금까지는 ${s}이 손에 익어 일찍 끝났다`;
    case 'rhythm': {
      const hr    = (cand.signal || {}).preferredHour;
      const hrLab = hr != null ? _hrLabel(hr) : '';
      return s ? `지금까지는 ${s}을(를) ${hrLab}에 하는 편이었다` : '지금까지는 특정 시간대에 많이 했다';
    }
    default: return '지금까지는 ';
  }
}

// ── 3단계: 배움 한 줄 ────────────────────────────
function refl3(root) {
  const { candidates, supersessions } = reflectState;

  const title = document.createElement('div'); title.className = 'refl-section-title';
  title.textContent = '이번 주, 자신에 대해 발견한 게 있다면 한 줄로.';
  root.appendChild(title);

  // ── 갱신 알림 ──
  supersessions.forEach(sup => {
    if ((DB.learnings || []).find(l => l.id === sup.learningId && l.status === 'superseded')) return;
    const isStrength = sup.learning.chapter === 'strength';

    const box = document.createElement('div'); box.className = 'refl-supersede-box';
    box.innerHTML =
      `<div class="refl-sup-text">"${esc(sup.learning.text)}"</div>` +
      `<div class="refl-sup-reason">${isStrength
        ? '어느 장으로 옮길까?'
        : '이 항목, 더 이상 안 맞는 것 같아 — 갱신할까?'}</div>`;

    const acts = document.createElement('div'); acts.className = 'refl-sup-acts';

    if (isStrength) {
      const chSel2 = document.createElement('select'); chSel2.className = 'ds-input';
      [['time','1장 · 시간 감각'],['rhythm','2장 · 리듬'],['focus','3장 · 집중']].forEach(([v, l]) => {
        const o = document.createElement('option'); o.value = v; o.textContent = l; chSel2.appendChild(o);
      });
      acts.appendChild(chSel2);
      acts.appendChild(rBtn('옮기기', 'dchip', () => {
        sup.learning.chapter = chSel2.value; save();
        box.classList.add('refl-sup-done');
        box.querySelector('.refl-sup-reason').textContent =
          chSel2.options[chSel2.selectedIndex].text + '으로 이동됨';
      }));
    } else {
      acts.appendChild(rBtn('갱신하기', 'dchip', () => {
        supersedeLearning(sup.learningId);
        reflectState.supersededId = sup.learningId;
        box.classList.add('refl-sup-done');
        box.querySelector('.refl-sup-reason').textContent = '갱신 완료 — 새 배움을 아래에 기록해주세요.';
        const oSig = sup.opposingSignal;
        if (oSig && oSig.subject) {
          inp.value   = oSig.direction === 'over'
            ? `지금까지는 ${oSig.subject}이 생각보다 더 걸렸다`
            : `지금까지는 ${oSig.subject}이 손에 익어 일찍 끝났다`;
          chSel.value = oSig.direction === 'over' ? 'time' : 'strength';
        }
        inp.focus();
      }));
      acts.appendChild(rBtn('그대로 두기', 'refl-skip-step', () => {
        box.classList.add('refl-sup-done');
        box.querySelector('.refl-sup-reason').textContent = '그대로 유지';
      }));
    }
    box.appendChild(acts);
    root.appendChild(box);
  });

  // ── 코치 후보 카드 ──
  if (candidates.length) {
    const hint = document.createElement('div'); hint.className = 'refl-hint';
    hint.textContent = '데이터에서 보인 것들 — 하나 선택하거나 아래에 직접 써도 돼요.';
    root.appendChild(hint);

    candidates.forEach(c => {
      if (c.type === 'question') {
        const card = document.createElement('div'); card.className = 'refl-cand refl-cand-q';
        const basis = _candBasis(c);
        card.innerHTML =
          (basis ? `<div class="refl-cand-basis">${esc(basis)}</div>` : '') +
          `<div class="refl-cand-text">${esc(c.text)}</div>`;
        const optRow = document.createElement('div'); optRow.className = 'refl-q-opts';
        c.options.forEach(opt => {
          optRow.appendChild(rBtn(opt, 'dchip', () => {
            const resolvedDir = c.onSelect[opt];
            const resolved = {
              type:    resolvedDir === 'under' ? 'strength_candidate' : 'estimation',
              subject: c.subject,
              signal:  { ...c.signal, direction: resolvedDir }
            };
            inp.value   = _candTemplate(resolved);
            chSel.value = _candChapter(resolved.type);
            card.style.opacity = '0.5';
            optRow.innerHTML = `<span class="refl-q-answer">${esc(opt)}</span>`;
            inp.focus();
          }));
        });
        card.appendChild(optRow);
        root.appendChild(card);
      } else {
        const card = rBtn('', 'refl-cand', () => {
          inp.value   = _candTemplate(c);
          chSel.value = _candChapter(c.type);
          const isConf = (c.signal || {}).spanWeeks >= 5;
          if (isConf) { conf = 'confirmed'; cConf.classList.add('sel'); cTent.classList.remove('sel'); }
          else        { conf = 'tentative'; cTent.classList.add('sel'); cConf.classList.remove('sel'); }
          inp.focus();
        });
        const basis   = _candBasis(c);
        const recLine = c.recommendation
          ? `<div class="refl-cand-basis">${esc(c.recommendation)}</div>` : '';
        card.innerHTML =
          (basis ? `<div class="refl-cand-basis">${esc(basis)}</div>` : '') +
          `<div class="refl-cand-text">→ ${esc(c.text)}</div>` +
          recLine;
        root.appendChild(card);
      }
    });
  } else {
    const noSig = document.createElement('div'); noSig.className = 'refl-hint';
    noSig.textContent = '이번 주 특별히 짚을 거 없어. 잘 가고 있어.';
    root.appendChild(noSig);
  }

  // ── 장(章) 선택 ──
  const chRow = document.createElement('div'); chRow.className = 'refl-row';
  const chLab = document.createElement('span'); chLab.className = 'ds-lab'; chLab.textContent = '장(章)';
  const chSel = document.createElement('select'); chSel.className = 'ds-input';
  [['time','1장 · 시간 감각'],['rhythm','2장 · 리듬'],['focus','3장 · 집중'],['strength','4장 · 강점']].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; chSel.appendChild(o);
  });
  chRow.append(chLab, chSel);
  root.appendChild(chRow);

  // ── 입력창 ──
  const inp = document.createElement('textarea'); inp.className = 'refl-inp';
  inp.placeholder = '지금까지는 ___했다'; inp.rows = 3;
  root.appendChild(inp);

  // ── 확신도 ──
  const confRow = document.createElement('div'); confRow.className = 'refl-row';
  const confLab = document.createElement('span'); confLab.className = 'ds-lab'; confLab.textContent = '확신도';
  let conf = 'tentative';
  const cTent = rBtn('잠정',   'dchip sel', () => { conf = 'tentative'; cTent.classList.add('sel'); cConf.classList.remove('sel'); });
  const cConf = rBtn('확인됨', 'dchip',     () => { conf = 'confirmed'; cConf.classList.add('sel'); cTent.classList.remove('sel'); });
  confRow.append(confLab, cTent, cConf);
  root.appendChild(confRow);

  // ── 저장 ──
  root.appendChild(rBtn('설명서에 기록하고 다음으로', 'btn primary refl-next', () => {
    const txt = inp.value.trim(); if (!txt) { toast('배움 내용을 입력해주세요'); return; }
    reflectState.weekLearning = addLearning({
      chapter: chSel.value, text: txt, since: DB.day.date,
      confidence: conf, status: 'active',
      supersededBy: reflectState.supersededId || null
    });
    reflectState.supersededId = null;
    reflectState.step = 4; renderReflStep();
  }));
  reflSkip(root, () => { reflectState.step = 4; renderReflStep(); });
}

// ── 4단계: 한 가지만 바꾸기 ─────────────────────
function refl4(root) {
  const title = document.createElement('div'); title.className = 'refl-section-title';
  title.textContent = '다음 주에 딱 하나만 바꿔볼까요?';
  root.appendChild(title);
  const sub = document.createElement('div'); sub.className = 'refl-hint';
  sub.textContent = '"~할 때 → ~해보기" 형식이 잘 맞아요. 권유예요, 의무가 아니에요.';
  root.appendChild(sub);

  if (DB.weeklyRule) {
    const cur = document.createElement('div'); cur.className = 'refl-cur-rule';
    cur.innerHTML = `<span class="refl-cur-lbl">지난 주 실천</span>${esc(DB.weeklyRule.text)}`;
    root.appendChild(cur);
  }

  const inp = document.createElement('textarea'); inp.className = 'refl-inp'; inp.rows = 2;
  inp.placeholder = '~할 때 → ~해보기';

  // 코치 추천 우선, 없으면 배움 기반 제안
  const topRec = reflectState.candidates.find(c => c.recommendation && c.type !== 'question');
  if (topRec) {
    const s = topRec.subject || '';
    inp.value = s ? `${s} 할 때 → ${topRec.recommendation}` : topRec.recommendation;
  } else if (reflectState.weekLearning) {
    const l = reflectState.weekLearning;
    if (l.chapter === 'time' && l.text.includes('더 걸')) {
      inp.value = l.text.replace('지금까지는 ', '').replace('했다', '면 → 예상 시간을 1.5배로 잡아보기');
    } else if (l.chapter === 'focus') {
      inp.value = '방해가 생길 것 같으면 → 시작 전에 폰을 다른 곳에 두기';
    }
  }
  root.appendChild(inp);

  root.appendChild(rBtn('할게', 'btn primary refl-next', () => {
    const txt = inp.value.trim();
    if (txt) reflectState.weekRule = setWeeklyRule({ text: txt });
    reflectState.step = 5; renderReflStep();
  }));
  root.appendChild(rBtn('이번 주는 건너뛸게', 'refl-skip-step', () => {
    reflectState.step = 5; renderReflStep();
  }));
}

// ── 마무리 ────────────────────────────────────────
function reflFinish(root) {
  const wrap = document.createElement('div'); wrap.className = 'refl-finish';

  if (reflectState.weekLearning) {
    const el = document.createElement('div'); el.className = 'refl-record';
    el.innerHTML = `<div class="refl-rec-lbl">이번 주 발견</div><div class="refl-rec-txt">${esc(reflectState.weekLearning.text)}</div>`;
    wrap.appendChild(el);
  }
  if (reflectState.weekRule) {
    const el = document.createElement('div'); el.className = 'refl-record';
    el.innerHTML = `<div class="refl-rec-lbl">다음 주 실천</div><div class="refl-rec-txt">${esc(reflectState.weekRule.text)}</div>`;
    wrap.appendChild(el);
  }

  const intentWrap = document.createElement('div'); intentWrap.className = 'refl-intent-wrap';
  const renderIntent = () => {
    intentWrap.innerHTML = '';
    if (DB.settings.firstIntent) {
      const box = document.createElement('div'); box.className = 'refl-intent-box';
      box.innerHTML = `<div class="refl-int-lbl">네가 처음 말한 것</div><div class="refl-int-txt">${esc(DB.settings.firstIntent)}</div>`;
      intentWrap.appendChild(box);
      intentWrap.appendChild(rBtn('수정', 'iconbtn', () => {
        const n = prompt('첫 한 마디를 수정해요.', DB.settings.firstIntent);
        if (n !== null) { DB.settings.firstIntent = n.trim(); save(); renderIntent(); }
      }));
    } else {
      const setWrap = document.createElement('div'); setWrap.className = 'refl-intent-set';
      const hint = document.createElement('div'); hint.className = 'refl-hint';
      hint.textContent = '내가 왜 공부하는지, 한 줄로 써볼까요?';
      const inp2 = document.createElement('input'); inp2.type = 'text';
      inp2.className = 'refl-intent-inp'; inp2.placeholder = '공부하는 이유 한 줄...';
      const saveBtn = rBtn('저장', 'btn', () => {
        const v = inp2.value.trim();
        if (v) { DB.settings.firstIntent = v; save(); renderIntent(); toast('저장됐어'); }
      });
      inp2.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveBtn.onclick(); } };
      setWrap.append(hint, inp2, saveBtn);
      intentWrap.appendChild(setWrap);
    }
  };
  renderIntent();
  wrap.appendChild(intentWrap);

  const done = document.createElement('div'); done.className = 'refl-done';
  done.textContent = '다음 주 준비됐어 ✓';
  wrap.appendChild(done);
  root.appendChild(wrap);
}

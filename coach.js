"use strict";
/* ===== coach — 신호 → 해석후보 → 추천 규칙 엔진 ===== */
// 순수 함수. DOM·window 접근 금지. data.js 통해서만 읽고 씀.
// accuracy.js(getInterruptionPattern, getActualTimePattern)가 먼저 로드되어야 함.

/**
 * analyzeWeek(log, weekRange)
 *
 * @param {Array}        log       - DB.log 전체
 * @param {Object|Array} weekRange - {start:'YYYY-MM-DD', end:'YYYY-MM-DD'} 또는 날짜 배열
 * @returns {{ signals: Array, candidates: Array }}
 *
 * signals: 내부 패턴 데이터 (checkSupersession / getLearningCandidates가 소비)
 * candidates: UI 표시용 해석 후보
 *   { type, subject, text, recommendation?, options?, onSelect?, strengthFlag?, signal }
 */
// 신호별 발동 임계 — 처방형(되돌리기 쉬움)은 민감하게, 정체성형(강점)은 보수적으로.
// minDistinctDays: 같은 날 몰아친 세션을 "패턴"으로 오판하지 않기 위한 최소 서로 다른 날짜 수.
const SIGNAL_TH = {
  prescriptive:      { minDistinctDays: 2 },              // over/under 진입, estimation·schedule·execution
  strength_under:    { recent: 5, hit: 4, minDistinctDays: 3 },
  strength_accurate: { consec: 3, minDistinctDays: 3 }
};

function _distinctDays(sessions) {
  return new Set((sessions || []).map(e => e.date)).size;
}

function analyzeWeek(log, weekRange) {
  const startDate = Array.isArray(weekRange) ? weekRange[0]                    : weekRange.start;
  const endDate   = Array.isArray(weekRange) ? weekRange[weekRange.length - 1] : weekRange.end;

  // focusMode=true 블록만 분석
  const measured = (log || []).filter(e => e.focusMode === true && e.planned > 0 && e.minutes > 0);

  if (measured.length < 4) return { signals: [], candidates: [] };

  const weekSessions   = measured.filter(e => e.date >= startDate && e.date <= endDate);
  const activeSubjects = [...new Set(weekSessions.map(e => e.subject))];

  const signals = [];
  const raw     = [];

  // scope 상위 50% 기준: 전체 measured의 scope 글자수 중간값
  const scopeLengths = measured.map(e => (e.scope || '').length).sort((a, b) => a - b);
  const scopeMedian  = scopeLengths.length ? scopeLengths[Math.floor(scopeLengths.length / 2)] : 0;

  // ── 과목별 패턴 분석 ──────────────────────────────────────────────────────
  activeSubjects.forEach(subj => {
    const all = measured
      .filter(e => e.subject === subj)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0) || a.date.localeCompare(b.date));

    if (all.length < 3) return;   // 과목당 3회 미만 → 분석 제외

    const r4 = all.slice(-4).map(e => ({
      ...e,
      isOver:     e.minutes > e.planned * 1.1,
      isUnder:    e.minutes < e.planned * 0.9,
      isAccurate: Math.abs(e.minutes - e.planned) / e.planned <= 0.1
    }));

    const overSess  = r4.filter(e => e.isOver);
    const underSess = r4.filter(e => e.isUnder);

    // ── 넘음 패턴 (최근 4회 중 3회+, 서로 다른 2일 이상) ─────────────────────
    if (overSess.length >= 3 && _distinctDays(overSess) >= SIGNAL_TH.prescriptive.minDistinctDays) {
      const avgInt = _avg(overSess.map(e => e.interruptions || 0));
      const spanWk = _spanWeeks(overSess);

      // 저녁(actualStart 기준 18시+)에만 넘음
      const eveningOver    = overSess.filter(e => e.actualStart && new Date(e.actualStart).getHours() >= 18).length;
      const nonEveningOver = overSess.filter(e => !e.actualStart || new Date(e.actualStart).getHours() < 18).length;
      const isEveningOnly  = eveningOver >= 2 && nonEveningOver === 0;

      // scope 상위 50%인 날에만 넘음
      const highScopeOver = overSess.filter(e => (e.scope || '').length > scopeMedian).length;
      const isScopeBig    = scopeMedian > 0 && highScopeOver >= Math.ceil(overSess.length / 2);

      // 연속 집중 구간(longestStreakMin) — 짧으면 조각남(자주 끊김)
      const streaks   = overSess.map(e => e.longestStreakMin).filter(v => v != null);
      const avgStreak = streaks.length ? Math.round(streaks.reduce((a, c) => a + c, 0) / streaks.length) : null;
      const fragmented = avgStreak != null && avgStreak < 15;

      const sig = { subject: subj, direction: 'over', avgInt, isEveningOnly, isScopeBig, spanWeeks: spanWk, avgStreak };
      signals.push(sig);

      // 끊김 많음 또는 조각남 → execution (longestStreak이 짧으면 "방해 횟수"가 아니라 "조각남"으로 표현)
      if (avgInt >= 2 || fragmented) {
        raw.push({ type: 'execution', subject: subj,
          text: fragmented
            ? `${subj}: 한 번에 오래 못 가고 자주 끊긴다 (평균 ${avgStreak}분)`
            : `${subj}: 과목은 맞는데 방해로 늘어진다`,
          recommendation: fragmented
            ? '한 번 앉으면 20분은 안 끊기게 — 폰 알림 끄고 시작해볼까?'
            : '집중 시작할 때 폰을 다른 방에 두는 건 어때?',
          signal: sig });
      }
      // 저녁에만 넘음 → schedule
      if (isEveningOnly) {
        raw.push({ type: 'schedule', subject: subj,
          text: `${subj}: 저녁엔 같은 일이 느려진다`,
          recommendation: `${subj}을(를) 오전으로 당겨보는 건 어때?`,
          signal: sig });
      }
      // scope 큰 날에만 넘음 → planning
      if (isScopeBig) {
        raw.push({ type: 'planning', subject: subj,
          text: `${subj}: 한 블록에 너무 많이 담는다`,
          recommendation: '블록 하나엔 한 가지만 담아보는 건 어때?',
          signal: sig });
      }
      // 끊김 거의 없음 + 저녁·scope 조건 없음 → estimation
      if (avgInt <= 1 && !isEveningOnly && !isScopeBig) {
        raw.push({ type: 'estimation', subject: subj,
          text: `${subj}: 이 과목 시간 감각이 짧다, 늘 더 걸린다`,
          recommendation: `${subj} 예상 시간을 × 1.2로 늘려보는 건 어때?`,
          signal: sig });
      }

    // ── 남음 패턴 (최근 4회 중 3회+, 서로 다른 2일 이상) ─────────────────────
    } else if (underSess.length >= 3 && _distinctDays(underSess) >= SIGNAL_TH.prescriptive.minDistinctDays) {
      const avgInt = _avg(underSess.map(e => e.interruptions || 0));
      const spanWk = _spanWeeks(underSess);
      const sig    = { subject: subj, direction: 'under', avgInt, spanWeeks: spanWk };
      signals.push(sig);

      if (avgInt <= 1) {
        // estimation(처방)은 빠르게. strength(정체성)는 보수적으로 — 5중4 + 서로 다른 3일.
        const under5 = all.slice(-SIGNAL_TH.strength_under.recent).filter(e => e.minutes < e.planned * 0.9);
        if (under5.length >= SIGNAL_TH.strength_under.hit &&
            _distinctDays(under5) >= SIGNAL_TH.strength_under.minDistinctDays) {
          raw.push({ type: 'strength_candidate', subject: subj,
            text: `${subj}: 이 과목 손에 익었다`,
            recommendation: null, strengthFlag: true, signal: sig });
        }
        raw.push({ type: 'estimation', subject: subj,
          text: `${subj}: 시간을 넉넉히 잡는 습관이 있다`,
          recommendation: `${subj} 블록 시간을 × 0.8로 줄여보는 건 어때?`,
          signal: sig });
      } else {
        // 일찍 끝 + 끊김 많음 → 단정 금지, 질문 반환
        raw.push({ type: 'question', subject: subj,
          text: `${subj}: 일찍 끝났는데 끊김도 많았어 — 다 끝낸 거야, 아니면 접은 거야?`,
          options: ['다 끝냈어', '집중이 안 돼서 접었어'],
          onSelect: { '다 끝냈어': 'under', '집중이 안 돼서 접었어': 'over' },
          signal: sig });
      }

    // ── 맞음 패턴 (연속 3회+) ────────────────────────────────────────────────
    } else {
      let consecutive = 0;
      for (let i = all.length - 1; i >= 0; i--) {
        const e = all[i];
        if (Math.abs(e.minutes - e.planned) / e.planned <= 0.1) consecutive++;
        else break;
      }
      if (consecutive >= SIGNAL_TH.strength_accurate.consec &&
          _distinctDays(all.slice(-consecutive)) >= SIGNAL_TH.strength_accurate.minDistinctDays) {
        const spanWk = _spanWeeks(all.slice(-consecutive));
        const sig = { subject: subj, direction: 'accurate', consecutiveCount: consecutive, spanWeeks: spanWk };
        signals.push(sig);
        raw.push({ type: 'strength_candidate', subject: subj,
          text: `${subj}: 이 과목 추정이 정확해지고 있다`,
          recommendation: null, strengthFlag: true, signal: sig });
      }
    }
  });

  // ── 방해 독립 패턴 (getInterruptionPattern 사용) ──────────────────────────
  const intPat = getInterruptionPattern(log, 28);
  if (intPat.worstSlot && intPat.worstSlot.avg >= 2 && intPat.worstSlot.hour != null) {
    const { dayOfWeek, hour } = intPat.worstSlot;
    // 동일 (요일+시간) 슬롯에서 3주+ 발생 여부 확인
    const slotSess = (log || []).filter(e =>
      e.focusMode === true &&
      e.actualStart &&
      (e.weekday != null ? e.weekday : new Date(e.date + 'T00:00').getDay()) === dayOfWeek &&
      new Date(e.actualStart).getHours() === hour &&
      (e.interruptions || 0) >= 2
    );
    const wkSpread = new Set(slotSess.map(e => _isoWeek(e.date))).size;
    if (wkSpread >= 3) {
      const _dow = ['일', '월', '화', '수', '목', '금', '토'];
      const label = `${_dow[dayOfWeek]}요일 ${_hrLabel(hour)}`;
      const sig   = { type: 'interruption_pattern', dayOfWeek, hour, spanWeeks: wkSpread };
      signals.push(sig);
      raw.push({ type: 'schedule', subject: null,
        text: `${label}에 자주 끊긴다`,
        recommendation: '그 시간 방해 방지 루틴을 만들거나 다른 시간으로 옮기는 건 어때?',
        signal: sig });
    }
  }

  // ── 모드 A 자연 패턴 (getActualTimePattern 사용) ─────────────────────────
  activeSubjects.forEach(subj => {
    const pat = getActualTimePattern(log, subj, 28);
    if (pat.preferredHour == null) return;
    // 해당 시간대 세션이 3주+ 분포하는지 확인
    const rhythmSess = (log || []).filter(e =>
      e.subject === subj &&
      e.actualStart &&
      new Date(e.actualStart).getHours() === pat.preferredHour
    );
    const wkSpread = new Set(rhythmSess.map(e => _isoWeek(e.date))).size;
    if (wkSpread < 3) return;
    const hrLab = _hrLabel(pat.preferredHour);
    const sig   = { subject: subj, direction: 'rhythm', preferredHour: pat.preferredHour, spanWeeks: wkSpread };
    signals.push(sig);
    raw.push({ type: 'rhythm', subject: subj,
      text: `너는 실제로 ${subj}을(를) ${hrLab}에 하는 편이다`,
      recommendation: null,   // 관찰만, 처방 없음
      signal: sig });
  });

  // ── 메모·난이도 기반 신호 ─────────────────────────────────────────────────
  const memoPat = getMemoPatterns(log, 28);

  // hard 3회+ + accurate 패턴 동시 → insight
  activeSubjects.forEach(subj => {
    const hardCount = (log||[]).filter(e=>e.subject===subj&&e.difficulty==='hard').length;
    if (hardCount < 3) return;
    const accSig = signals.find(s=>s.subject===subj&&s.direction==='accurate');
    if (!accSig) return;
    raw.push({ type:'insight', subject:subj,
      text:`체감은 힘든데 ${subj} 시간은 잘 맞아. 익숙해지는 중일 수 있어.`,
      signal:accSig });
  });

  // 키워드 3회+ → memo_pattern
  memoPat.keywords.slice(0, 3).forEach(kw => {
    const slotCounts={};
    // 키워드가 조사붙은/구절 형태라 raw 메모와 정확히 안 맞을 수 있어 선두 토큰으로 느슨하게 매칭
    const kwHead=kw.word.split(' ')[0];
    (log||[]).filter(e=>e.memo&&e.memo.includes(kwHead)).forEach(e=>{if(e.slot)slotCounts[e.slot]=(slotCounts[e.slot]||0)+1;});
    const domSlot=Object.entries(slotCounts).sort((a,b)=>b[1]-a[1])[0];
    const slotLbl=domSlot&&domSlot[1]>=2?{morning:'오전',afternoon:'오후',evening:'저녁'}[domSlot[0]]:null;
    raw.push({ type:'memo_pattern', subject:kw.subjects[0]||null,
      text:`"${kw.word}"가 자주 보여.`+(slotLbl?' '+slotLbl+'에 특히 많네.':''),
      signal:{type:'memo_pattern',word:kw.word} });
  });

  // easy + 실제 < 예상×0.9 → estimation
  activeSubjects.forEach(subj => {
    const easySess=(log||[]).filter(e=>e.subject===subj&&e.difficulty==='easy'&&e.planned>0&&e.minutes<e.planned*0.9);
    if (easySess.length < 2) return;
    if (raw.some(r=>r.type==='estimation'&&r.subject===subj)) return;
    raw.push({ type:'estimation', subject:subj,
      text:`${subj}: 쉽고 빨리 끝나는 패턴. 난이도 조절해볼까?`,
      signal:{subject:subj,direction:'easy_under'} });
  });

  return { signals, candidates: _selectCandidates(raw) };
}

/**
 * checkSupersession(learnings, newSignals)
 *
 * active 학습 항목 중 newSignals와 반대 방향인 것을 감지.
 * 5주+ 지속된 경우에만 반환 (확정은 사용자가 reflect에서 승인).
 * chapter='strength' 항목은 supersede ❌ → type:'chapter_move'로 반환.
 *
 * @returns {{ learningId, learning, type, reason, opposingSignal }[]}
 */
function checkSupersession(learnings, newSignals) {
  const active   = (learnings || []).filter(l => l.status !== 'superseded');
  const strength = active.filter(l => l.chapter === 'strength');
  const other    = active.filter(l => l.chapter !== 'strength');
  const result   = [];

  // 비-강점 항목: 지속 반대 패턴(주 임계, 강한 반대는 단축) 또는 확신 약화(score<0.3) → 재평가 후보
  other.forEach(learning => {
    const opposing = newSignals.find(s => _isOpposing(learning, s));
    const weekMet  = !!opposing && (opposing.spanWeeks || 0) >= _neededWeeks(learning, opposing);
    const lowScore = (learning.score != null && learning.score < 0.3);
    if (!weekMet && !lowScore) return;
    result.push({
      learningId:     learning.id,
      learning,
      type:           'supersession',
      reason:         weekMet
        ? `최근 ${Math.round((opposing && opposing.spanWeeks) || 0)}주간 반대 패턴 관찰됨`
        : '이 항목에 대한 확신이 약해졌어',
      opposingSignal: opposing || null
    });
  });

  // 강점 항목: 'over' 신호 5주+ → chapter 이동 후보 (supersede 아님)
  strength.forEach(learning => {
    const opposing = newSignals.find(s =>
      s.direction === 'over' &&
      s.subject &&
      (learning.text || '').includes(s.subject)
    );
    if (!opposing || (opposing.spanWeeks || 0) < 5) return;
    result.push({
      learningId:     learning.id,
      learning,
      type:           'chapter_move',
      reason:         `${opposing.subject} 최근 어려워진 패턴 — 강점 장 이동 검토`,
      opposingSignal: opposing
    });
  });

  return result;
}

/**
 * getLearningCandidates(signals)
 *
 * accurate / under 방향 신호 3주+ → 강점 장 학습 후보.
 * confidence: 3~4주 → 'tentative' / 5주+ → 'confirmed'
 *
 * @returns {{ chapter, subject, text, confidence, since }[]}
 */
function getLearningCandidates(signals) {
  return (signals || [])
    .filter(s => (s.direction === 'accurate' || s.direction === 'under') && (s.spanWeeks || 0) >= 3)
    .map(s => ({
      chapter:    'strength',
      subject:    s.subject,
      text:       s.direction === 'accurate'
        ? `${s.subject}: 이 과목 추정이 정확해지고 있다`
        : `${s.subject}: 이 과목 손에 익었다`,
      confidence: (s.spanWeeks || 0) >= 5 ? 'confirmed' : 'tentative',
      score:      (s.spanWeeks || 0) >= 5 ? 0.7 : 0.45,
      since:      null   // 저장 시 reflect.js가 오늘 날짜 기입
    }));
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function _spanWeeks(sessions) {
  // 관찰이 걸쳐 있는 서로 다른 ISO 주 수(기간이 아니라 분포). 같은 주 몰림을 과대평가하지 않는다.
  // 기존: (마지막-처음)/7일. 월·수·다음주월 3세션이 1.1을 반환해 "3주 패턴" 임계를 영영 못 넘던 문제 해소.
  if (!sessions || !sessions.length) return 0;
  return new Set(sessions.map(e => _isoWeek(e.date))).size;
}

function _avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function _isoWeek(dateStr) {
  const d   = new Date(dateStr + 'T00:00');
  const thu = new Date(d);
  thu.setDate(d.getDate() + (4 - (d.getDay() || 7)));
  const year = thu.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const wn   = Math.ceil(((thu - jan4) / 86400000 + jan4.getDay() + 1) / 7);
  return `${year}-W${String(wn).padStart(2, '0')}`;
}

function _hrLabel(hour) {
  if (hour >= 5  && hour < 12) return '오전';
  if (hour >= 12 && hour < 18) return '오후';
  if (hour >= 18 && hour < 24) return '저녁';
  return '새벽';
}

// 최대 3개, 서로 다른 type으로 선별. 질문 우선.
function _selectCandidates(all) {
  if (!all.length) return [];
  const usedTypes = new Set();
  const result    = [];

  // 1순위: 질문 (사용자 입력 필요)
  for (const c of all) {
    if (result.length >= 3) break;
    if (c.type === 'question') result.push(c);
  }
  // 2순위: 나머지 — type당 1개
  for (const c of all) {
    if (result.length >= 3) break;
    if (c.type === 'question' || usedTypes.has(c.type)) continue;
    usedTypes.add(c.type);
    result.push(c);
  }

  return result;
}

// 학습 텍스트와 신호 방향의 모순 감지 (키워드 기반)
function _isOpposing(learning, signal) {
  if (!signal.subject) return false;
  if (signal.direction === 'accurate' || signal.direction === 'interruption_pattern' || signal.direction === 'rhythm') return false;
  const lText = learning.text || '';
  if (!lText.includes(signal.subject)) return false;

  if (signal.direction === 'over') {
    return ['손에 익', '넉넉히', '일찍 끝', '정확해지'].some(kw => lText.includes(kw));
  }
  if (signal.direction === 'under') {
    return ['시간 감각이 짧', '늘 더 걸', '방해로 늘', '느려진다'].some(kw => lText.includes(kw));
  }
  return false;
}

// _isOpposing의 거울 — 신호가 학습을 "지지"하면 true (같은 방향 재확인).
function _supports(learning, signal) {
  if (!signal.subject) return false;
  const t = learning.text || '';
  if (!t.includes(signal.subject)) return false;
  if (signal.direction === 'over')
    return ['시간 감각이 짧', '늘 더 걸', '방해로 늘', '느려진다', '더 걸렸'].some(k => t.includes(k));
  if (signal.direction === 'under' || signal.direction === 'accurate')
    return ['손에 익', '넉넉히', '일찍 끝', '정확해지'].some(k => t.includes(k));
  if (signal.direction === 'rhythm')
    return t.includes('하는 편') || t.includes('하는 편이');
  return false;
}

// 반대 패턴이 supersession을 부르기까지 필요한 주 수. 강한 반대(잦은 방해)는 1주 단축.
function _neededWeeks(learning, opposing) {
  const base   = learning.confidence === 'confirmed' ? 5 : 3;
  const strong = (opposing.avgInt || 0) >= 3;
  return strong ? Math.max(2, base - 1) : base;
}

/**
 * evolveConfidence(learnings, signals)
 *
 * reflect 진입 때 1회 호출. active 학습의 confidence score(0~1)를 이번 주 신호로 갱신.
 *  - 지지 신호: +0.12 (3주+ 분산이면 +0.18)
 *  - 반대 신호: -0.22 (강한 반대면 -0.34)
 * score ≥ 0.7 → '확인됨', < 0.7 → '잠정'. < 0.3은 checkSupersession이 재평가로 surfacing.
 * lastEvolved(ISO주)로 같은 주 중복 가산을 막고, 이번 주 막 생성된 항목은 다음 주부터 평가.
 *
 * @returns {{ promoted: Array, changed: boolean }}  promoted = 이번에 확인됨으로 승급된 항목
 */
function evolveConfidence(learnings, signals) {
  const wk = _isoWeek(dateStr(new Date()));
  const promoted = [];
  let changed = false;
  (learnings || []).filter(l => l.status !== 'superseded').forEach(l => {
    if (l.score == null) l.score = (l.confidence === 'confirmed' ? 0.7 : 0.45);
    if (l.lastEvolved === wk) return;                 // 이번 주 이미 반영
    changed = true;
    if (_isoWeek(l.since) === wk) { l.lastEvolved = wk; return; }  // 이번 주 생성분은 다음 주부터

    const support = (signals || []).find(s => _supports(l, s));
    const oppose  = (signals || []).find(s => _isOpposing(l, s));
    const before  = l.score;
    if (support) l.score = Math.min(1, l.score + ((support.spanWeeks || 0) >= 3 ? 0.18 : 0.12));
    if (oppose)  l.score = Math.max(0, l.score - ((oppose.avgInt || 0) >= 3 ? 0.34 : 0.22));
    l.lastEvolved = wk;

    const newLabel = l.score >= 0.7 ? 'confirmed' : 'tentative';
    if (newLabel !== l.confidence) {
      if (newLabel === 'confirmed' && before < 0.7) promoted.push(l);
      l.confidence = newLabel;
    }
  });
  return { promoted, changed };
}

/**
 * getMemoPatterns(log, days=28)
 * 메모 키워드·난이도 패턴 집계.
 */
function getMemoPatterns(log, days) {
  days = days || 28;
  const cutoff = dateStr(new Date(Date.now() - days * 24 * 3600 * 1000));
  const STOP = ['이','가','을','를','은','는','에','도','고','의','그','있어','했어','같아','것','거','됐어'];

  const diffBuckets = { hard:{count:0,subjects:[],_ratio:0}, normal:{count:0,subjects:[],_ratio:0}, easy:{count:0,subjects:[],_ratio:0} };
  (log||[]).filter(e=>e.date>=cutoff&&e.difficulty).forEach(e=>{
    const b=diffBuckets[e.difficulty];if(!b)return;
    b.count++;
    if(e.subject&&!b.subjects.includes(e.subject))b.subjects.push(e.subject);
    if(e.planned>0)b._ratio+=e.minutes/e.planned;
  });
  const byDifficulty={};
  ['hard','normal','easy'].forEach(k=>{const b=diffBuckets[k];byDifficulty[k]={count:b.count,subjects:b.subjects,avgRatio:b.count?b._ratio/b.count:null};});

  // 조사 스트리핑(형태소기 없이 규칙 기반): "수학이"·"수학을"·"수학은" → "수학"으로 합침.
  // 결과가 2자 미만이면 원형 유지(짧은 단어 보호). 1회만 벗겨 과도한 절단 방지.
  const JOSA = /(으로|로서|로써|에서|에게|한테|까지|부터|이라|라고|이나|마저|조차|밖에|처럼|만큼|보다|이며|이고|이|가|을|를|은|는|에|도|와|과|의|만|랑|이랑)$/;
  const norm = w => {
    w = (w||'').replace(/[.,!?~…·"'’”“()\[\]{}<>:;]/g,'').trim();
    if(w.length<2) return w;
    const m = w.replace(JOSA,'');
    return (m.length>=2 && m!==w) ? m : w;
  };
  const wordMap={};
  const bump=(key,e)=>{
    if(!wordMap[key])wordMap[key]={count:0,subjects:new Set(),difficulties:[]};
    wordMap[key].count++;
    if(e.subject)wordMap[key].subjects.add(e.subject);
    if(e.difficulty)wordMap[key].difficulties.push(e.difficulty);
  };
  (log||[]).filter(e=>e.date>=cutoff&&e.memo).forEach(e=>{
    const toks=(e.memo||'').split(/\s+/).map(norm).filter(Boolean);
    toks.forEach((w,i)=>{
      if(w.length>=2 && !STOP.includes(w)){
        bump(w,e);
        // 다음 토큰이 단독으론 버려질 짧은말/조사성이면 "집중 안" 같은 구절로 살림(부정 표현 보존)
        const nxt=toks[i+1];
        if(nxt && nxt.length>=1 && (nxt.length<2 || STOP.includes(nxt))) bump(w+' '+nxt,e);
      }
    });
  });
  const keywords=Object.entries(wordMap).filter(([,v])=>v.count>=3)
    .sort((a,b)=>b[1].count-a[1].count)
    .map(([word,v])=>{
      const dc={};v.difficulties.forEach(d=>dc[d]=(dc[d]||0)+1);
      const top=Object.entries(dc).sort((a,b)=>b[1]-a[1])[0];
      return{word,count:v.count,subjects:[...v.subjects],difficulty:top?top[0]:null};
    });

  return{byDifficulty,keywords};
}

// ── 하위 호환 래퍼 (기존 computeCoachSignals 호출부 유지) ───────────────────
function computeCoachSignals(db) {
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const toDS = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const end   = toDS(now);
  const start = toDS(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const { signals, candidates } = analyzeWeek(db.log || [], { start, end });
  const recommendations = candidates.length ? candidates : getColdstartHints(db);
  return { signals, recommendations };
}

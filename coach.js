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

    // ── 넘음 패턴 (최근 4회 중 3회+) ────────────────────────────────────────
    if (overSess.length >= 3) {
      const avgInt = _avg(overSess.map(e => e.interruptions || 0));
      const spanWk = _spanWeeks(overSess);

      // 저녁(actualStart 기준 18시+)에만 넘음
      const eveningOver    = overSess.filter(e => e.actualStart && new Date(e.actualStart).getHours() >= 18).length;
      const nonEveningOver = overSess.filter(e => !e.actualStart || new Date(e.actualStart).getHours() < 18).length;
      const isEveningOnly  = eveningOver >= 2 && nonEveningOver === 0;

      // scope 상위 50%인 날에만 넘음
      const highScopeOver = overSess.filter(e => (e.scope || '').length > scopeMedian).length;
      const isScopeBig    = scopeMedian > 0 && highScopeOver >= Math.ceil(overSess.length / 2);

      const sig = { subject: subj, direction: 'over', avgInt, isEveningOnly, isScopeBig, spanWeeks: spanWk };
      signals.push(sig);

      // 끊김 많음 → execution
      if (avgInt >= 2) {
        raw.push({ type: 'execution', subject: subj,
          text: `${subj}: 과목은 맞는데 방해로 늘어진다`,
          recommendation: '집중 시작할 때 폰을 다른 방에 두는 건 어때?',
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

    // ── 남음 패턴 (최근 4회 중 3회+) ────────────────────────────────────────
    } else if (underSess.length >= 3) {
      const avgInt = _avg(underSess.map(e => e.interruptions || 0));
      const spanWk = _spanWeeks(underSess);
      const sig    = { subject: subj, direction: 'under', avgInt, spanWeeks: spanWk };
      signals.push(sig);

      if (avgInt <= 1) {
        // 끊김 없이 꾸준히 일찍 끝남 → 두 후보 동시
        raw.push({ type: 'strength_candidate', subject: subj,
          text: `${subj}: 이 과목 손에 익었다`,
          recommendation: null, strengthFlag: true, signal: sig });
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
      if (consecutive >= 3) {
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

  // 비-강점 항목: tentative→3주+ / confirmed→5주+ 반대 패턴 → supersession 후보
  other.forEach(learning => {
    const opposing = newSignals.find(s => _isOpposing(learning, s));
    const needed = learning.confidence === 'confirmed' ? 5 : 3;
    if (!opposing || (opposing.spanWeeks || 0) < needed) return;
    result.push({
      learningId:     learning.id,
      learning,
      type:           'supersession',
      reason:         `최근 ${Math.round(opposing.spanWeeks)}주간 반대 패턴 관찰됨`,
      opposingSignal: opposing
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
      since:      null   // 저장 시 reflect.js가 오늘 날짜 기입
    }));
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function _spanWeeks(sessions) {
  if (!sessions || sessions.length < 2) return 0;
  const dates = sessions.map(e => e.date).sort();
  return (new Date(dates[dates.length - 1]) - new Date(dates[0])) / (7 * 24 * 3600 * 1000);
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

// ── 하위 호환 래퍼 (기존 computeCoachSignals 호출부 유지) ───────────────────
function computeCoachSignals(db) {
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const toDS = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const end   = toDS(now);
  const start = toDS(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const { signals, candidates } = analyzeWeek(db.log || [], { start, end });
  return { signals, recommendations: candidates };
}

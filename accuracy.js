"use strict";
/* ===== accuracy — 과목별 추정 편향·수렴 계산 (순수 함수, DOM 접근 없음) ===== */

// [표시 규칙 — stats.js에서 지킬 것]
// 전역 정확도 % 헤드라인 ❌
// 과목별 방향만: "수학 → 늘 더 걸리는 편" "영어 → 정확해지는 중"
// avgRatio는 "1.2배" 형태로만, 크게 안 띄움
// 빨강·하향 화살표 ❌. 방향은 중립 표현으로.
// sampleCount < 3인 과목: 표시 ❌ (침묵)
// direction: 'converging'일 때만 긍정 강조 가능

function _accCutoff(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// 공통 필터: focusMode=true + planned>0 + 날짜 컷오프
// planned===minutes && focusMode===false 체크박스 가짜 데이터는
// focusMode===true 조건으로 이미 제거됨.
function _focusSessions(log, days) {
  const cutoff = days != null ? _accCutoff(days) : null;
  return (log || []).filter(e =>
    e.focusMode === true &&
    e.planned > 0 &&
    (!cutoff || e.date >= cutoff)
  );
}

/**
 * 한 과목의 세션 배열 → bias 객체 (순수, 스캔 없음). getSubjectBias·getAllSubjectBiases 공용.
 * sampleCount < 3이면 direction='insufficient' (표시 안 함).
 */
function _computeBias(subject, sessions) {
  const n = sessions.length;
  if (n < 3) return { subject, direction: 'insufficient', avgRatio: null, sampleCount: n, trend: null };

  const sorted = sessions.slice().sort(
    (a, b) => (a.ts || 0) - (b.ts || 0) || a.date.localeCompare(b.date)
  );
  const ratios   = sorted.map(e => e.minutes / e.planned);
  const avgRatio = ratios.reduce((s, v) => s + v, 0) / ratios.length;
  const direction = avgRatio > 1.1 ? 'over' : avgRatio < 0.9 ? 'under' : 'accurate';

  let trend = null;
  if (ratios.length >= 4) {
    const half     = Math.floor(ratios.length / 2);
    const errs     = ratios.map(r => Math.abs(r - 1));
    const firstErr = errs.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const lastErr  = errs.slice(half).reduce((s, v) => s + v, 0) / (ratios.length - half);
    trend = lastErr < firstErr * 0.85 ? 'converging'
          : lastErr > firstErr * 1.15 ? 'diverging'
          : 'stable';
  }
  return { subject, direction, avgRatio, sampleCount: n, trend };
}

/**
 * focusMode 세션을 과목별로 1회 스캔 그룹핑. days=null이면 전체 기간.
 * (과목 수만큼 _focusSessions를 반복 호출하던 O(과목×로그)를 O(로그)로 줄임)
 */
function _focusWindowGroups(log, days) {
  const cutoff = days != null ? _accCutoff(days) : null;
  const groups = {};
  (log || []).forEach(e => {
    if (e.focusMode !== true || !(e.planned > 0)) return;
    if (cutoff && e.date < cutoff) return;
    (groups[e.subject] || (groups[e.subject] = [])).push(e);
  });
  return groups;
}

// 전체 기간 그룹핑 메모 — 측정 기록이 바뀔 때(window.__focusVer)만 재계산.
// convergence가 과목마다 호출돼도 스캔은 ver당 1회로 수렴.
let _allGroupsCache = { ver: -1, groups: null };
function _focusGroupsAll(log) {
  const ver = (typeof window !== 'undefined' && window.__focusVer) || 0;
  if (_allGroupsCache.ver === ver && _allGroupsCache.groups) return _allGroupsCache.groups;
  const groups = _focusWindowGroups(log, null);
  _allGroupsCache = { ver, groups };
  return groups;
}

/**
 * getSubjectBias(log, subject, days=14)
 * 특정 과목의 예상 대비 실제 방향. sampleCount < 3이면 direction='insufficient'.
 */
function getSubjectBias(log, subject, days = 14) {
  return _computeBias(subject, _focusWindowGroups(log, days)[subject] || []);
}

/**
 * getAllSubjectBiases(log, days=14)
 * 모든 과목 bias 배열. 1회 스캔 그룹핑 + 일자 메모. insufficient(3회 미만) 제외.
 */
let _biasCache = { key: null, value: null };
function getAllSubjectBiases(log, days = 14) {
  const ver = (typeof window !== 'undefined' && window.__focusVer) || 0;
  const key = ver + '|' + days;
  if (_biasCache.key === key) return _biasCache.value;
  const groups = _focusWindowGroups(log, days);
  const out = Object.keys(groups)
    .map(s => _computeBias(s, groups[s]))
    .filter(b => b.direction !== 'insufficient');
  _biasCache = { key, value: out };
  return out;
}

/**
 * getConvergenceData(log, subject, weeks=8)
 *
 * 주차별 avgRatio 배열 — "예상선·실제선이 끌어안는 그림" 그래프용.
 * 반환: [{ week: 'YYYY-Www', avgRatio, sampleCount } | null]
 * sampleCount < 2인 주차는 null.
 */
function getConvergenceData(log, subject, weeks = 8) {
  return _convergenceFromSessions(_focusGroupsAll(log)[subject] || [], weeks);
}

function _convergenceFromSessions(sessions, weeks = 8) {
  if (!sessions.length) return [];

  const p = n => String(n).padStart(2, '0');
  const isoWeek = d => {
    const thu = new Date(d);
    thu.setDate(d.getDate() + (4 - (d.getDay() || 7)));
    const year = thu.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const wn = Math.ceil(((thu - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    return `${year}-W${p(wn)}`;
  };

  const buckets = {};
  sessions.forEach(e => {
    const wk = isoWeek(new Date(e.date + 'T00:00'));
    (buckets[wk] = buckets[wk] || []).push(e.minutes / e.planned);
  });

  return Object.keys(buckets).sort().slice(-weeks).map(wk => {
    const arr = buckets[wk];
    if (arr.length < 2) return null;
    return {
      week: wk,
      avgRatio: arr.reduce((s, v) => s + v, 0) / arr.length,
      sampleCount: arr.length
    };
  });
}

/**
 * getInterruptionPattern(log, days=28)
 *
 * 반환: {
 *   byDayOfWeek: { 0~6: avgInterruptions },
 *   byHour:      { 0~23: avgInterruptions },   // actualStart 있는 세션만
 *   worstSlot:   { dayOfWeek, hour, avg }
 * }
 */
function getInterruptionPattern(log, days = 28) {
  const sessions = _focusSessions(log, days);

  const dowSum  = {}, dowCnt  = {};
  const hrSum   = {}, hrCnt   = {};
  const pairSum = {}, pairCnt = {};

  sessions.forEach(e => {
    const int = e.interruptions || 0;
    const wd  = e.weekday != null ? e.weekday : new Date(e.date + 'T00:00').getDay();
    dowSum[wd] = (dowSum[wd] || 0) + int;
    dowCnt[wd] = (dowCnt[wd] || 0) + 1;

    if (e.actualStart) {
      const hr = new Date(e.actualStart).getHours();
      hrSum[hr]  = (hrSum[hr]  || 0) + int;
      hrCnt[hr]  = (hrCnt[hr]  || 0) + 1;
      const pk = `${wd}:${hr}`;
      pairSum[pk] = (pairSum[pk] || 0) + int;
      pairCnt[pk] = (pairCnt[pk] || 0) + 1;
    }
  });

  const byDayOfWeek = {};
  for (let i = 0; i < 7; i++) { if (dowCnt[i]) byDayOfWeek[i] = dowSum[i] / dowCnt[i]; }

  const byHour = {};
  Object.keys(hrCnt).forEach(h => { byHour[+h] = hrSum[h] / hrCnt[h]; });

  let worstSlot = null, worstAvg = -1;
  Object.entries(pairCnt).forEach(([pk, cnt]) => {
    if (cnt < 2) return;
    const avg = pairSum[pk] / cnt;
    if (avg > worstAvg) {
      worstAvg = avg;
      const [wd, hr] = pk.split(':').map(Number);
      worstSlot = { dayOfWeek: wd, hour: hr, avg };
    }
  });
  if (!worstSlot) {
    Object.entries(byDayOfWeek).forEach(([wd, avg]) => {
      if (avg > worstAvg) { worstAvg = avg; worstSlot = { dayOfWeek: +wd, hour: null, avg }; }
    });
  }

  return { byDayOfWeek, byHour, worstSlot };
}

/**
 * getActualTimePattern(log, subject, days=28)
 *
 * 모드 A에서 쌓인 actualStart로 자연스러운 공부 시간대 패턴 감지.
 * 강제 없이 관찰만. coach.js에서 사용.
 * 반환: { subject, preferredHour: number|null, preferredDayOfWeek: number|null }
 */
function getActualTimePattern(log, subject, days = 28) {
  const cutoff = _accCutoff(days);
  const sessions = (log || []).filter(e =>
    e.subject === subject &&
    e.actualStart &&
    e.date >= cutoff
  );

  if (!sessions.length) return { subject, preferredHour: null, preferredDayOfWeek: null };

  const hrCnt = {}, dowCnt = {};
  sessions.forEach(e => {
    const d = new Date(e.actualStart);
    const hr = d.getHours();
    const wd = d.getDay();
    hrCnt[hr]  = (hrCnt[hr]  || 0) + 1;
    dowCnt[wd] = (dowCnt[wd] || 0) + 1;
  });

  const preferredHour        = +Object.entries(hrCnt) .sort((a, b) => b[1] - a[1])[0][0];
  const preferredDayOfWeek   = +Object.entries(dowCnt).sort((a, b) => b[1] - a[1])[0][0];

  return { subject, preferredHour, preferredDayOfWeek };
}

// ── 하위 호환 래퍼 — reflect.js가 computeAccuracy(log, rollCutoff)로 호출 ─────
function computeAccuracy(log, rollCutoff) {
  const measured = (log || []).filter(e => e.measured);
  if (!measured.length) return { totalMeasured: 0, convergence: null, biasRows: [], flags: [] };

  const roll = measured.filter(e => e.date >= rollCutoff).sort((a, b) => (a.ts || 0) - (b.ts || 0));

  let convergence = null;
  if (roll.length >= 4) {
    const tail     = roll.slice(-10);
    const errs     = tail.map(e => e.planned ? Math.abs((e.minutes - e.planned) / e.planned) * 100 : 0);
    const half     = Math.floor(errs.length / 2);
    const firstAvg = errs.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const lastAvg  = errs.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, errs.length - half);
    convergence = { errs, improving: half >= 2 && lastAvg < firstAvg * 0.85 };
  }

  const bySubj = {};
  roll.forEach(e => { if (!e.planned) return; (bySubj[e.subject] = bySubj[e.subject] || []).push(e); });
  const biasRows = Object.entries(bySubj)
    .filter(([, a]) => a.length >= 3)
    .map(([name, a]) => ({
      name, color: a[a.length - 1].color,
      avgPct: a.reduce((s, e) => s + (e.minutes - e.planned) / e.planned, 0) / a.length * 100,
      count: a.length
    }));

  const bySubjInt = {};
  roll.forEach(e => {
    const o = (bySubjInt[e.subject] = bySubjInt[e.subject] || { tot: 0, int: 0, slots: [] });
    o.tot++;
    if (e.interruptions > 0) { o.int++; if (e.slot) o.slots.push(e.slot); }
  });
  const flags = [];
  Object.entries(bySubjInt).forEach(([name, o]) => {
    if (o.tot < 3 || o.int / o.tot < 0.6) return;
    const counts = {};
    o.slots.forEach(s => counts[s] = (counts[s] || 0) + 1);
    const dom = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const sl  = s => s === 'morning' ? '오전' : s === 'afternoon' ? '오후' : '저녁';
    flags.push(dom && dom[1] / o.slots.length >= 0.6
      ? `${name}은 주로 ${sl(dom[0])}에 방해가 있었어요`
      : `${name}에서 방해가 자주 있었어요`);
  });

  return { totalMeasured: measured.length, convergence, biasRows, flags };
}

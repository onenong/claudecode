"use strict";
/* ===== rules — 구조화된 주간 규칙 엔진 (순수 함수, DOM 접근 없음) ===== */
// 철학: 규칙은 보호장치지 감옥이 아니다. 위반해도 강제·차단 ❌ — 부드러운 제안만.
// 규칙 객체: { id, text, setAt, active, scope:{subject?, slot?, dayOfWeek?}, effect:{type, value?} }
//   effect.type: 'avoid' | 'prefer' | 'multiplier' | 'cap'
//   - avoid/prefer/multiplier: 해당 블록에 힌트 pill로 표시 (자동 변경 ❌)
//   - cap: 하루 누적 상한(분) — 초과 시 부드러운 관찰 한 줄 (차단 ❌)

/**
 * ruleFromCandidate(cand)
 * 회고 코치 후보 → 구조화 규칙 초안. 없으면 null. 저장은 사용자 승인 후(reflect refl4).
 */
function ruleFromCandidate(c) {
  if (!c) return null;
  const s   = c.subject || '';
  const dir = (c.signal || {}).direction;
  const sc  = s ? { subject: s } : {};
  switch (c.type) {
    case 'estimation':
      return dir === 'over'
        ? { text: (s ? s + ' ' : '') + '예상 시간 ×1.3', scope: sc, effect: { type: 'multiplier', value: 1.3 } }
        : { text: (s ? s + ' ' : '') + '예상 시간 ×0.8', scope: sc, effect: { type: 'multiplier', value: 0.8 } };
    case 'schedule':
      return { text: (s ? s + ' ' : '') + '저녁엔 피하기', scope: Object.assign({}, sc, { slot: 'evening' }), effect: { type: 'avoid' } };
    case 'execution':
      return { text: (s ? s + ' ' : '') + '시작 전 폰 다른 곳에', scope: sc, effect: { type: 'prefer' } };
    case 'planning':
      return { text: (s ? s + ' ' : '') + '블록 하나엔 한 가지만', scope: sc, effect: { type: 'prefer' } };
    default:
      return null;
  }
}

/**
 * matchRules(rules, ctx)
 * ctx = { subject, slot, dayOfWeek }. active이고 scope가 ctx에 맞는 규칙들(avoid/prefer/multiplier).
 * cap은 블록 단위가 아니라 하루 단위라 여기서 제외.
 */
function matchRules(rules, ctx) {
  return (rules || []).filter(r =>
    r.active !== false &&
    (r.effect || {}).type !== 'cap' &&
    _ruleScopeMatch(r.scope || {}, ctx || {})
  );
}

/**
 * capStatus(rules, todayTotalMin)
 * 활성 cap 규칙 중 오늘 누적이 상한에 도달/근접한 것. 없으면 null.
 * @returns {{ rule, value, reached:boolean, near:boolean } | null}
 */
function capStatus(rules, todayTotalMin) {
  const caps = (rules || []).filter(r => r.active !== false && (r.effect || {}).type === 'cap' && (r.effect.value > 0));
  if (!caps.length) return null;
  // 가장 낮은 상한 기준으로 안내
  caps.sort((a, b) => a.effect.value - b.effect.value);
  const rule = caps[0], value = rule.effect.value;
  if (todayTotalMin >= value)        return { rule, value, reached: true,  near: false };
  if (todayTotalMin >= value * 0.9)  return { rule, value, reached: false, near: true };
  return null;
}

function _ruleScopeMatch(scope, ctx) {
  if (scope.subject != null   && scope.subject   !== ctx.subject)   return false;
  if (scope.slot != null      && scope.slot      !== ctx.slot)      return false;
  if (scope.dayOfWeek != null && scope.dayOfWeek !== ctx.dayOfWeek) return false;
  return true;
}

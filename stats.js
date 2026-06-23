"use strict";
/* ===== stats ===== */

/* ── 수렴 그래프 섹션 ──────────────────────────── */
function renderConvergenceSection(log) {
  const biases = getAllSubjectBiases(log, 56);   // 8주치 데이터 대상
  if (!biases.length) return '';

  const sections = [];
  biases.forEach(b => {
    const data = getConvergenceData(log, b.subject, 8).filter(w => w !== null);
    if (data.length < 3) return;   // 3주 미만이면 그래프 생략

    const devs   = data.map(w => Math.abs(w.avgRatio - 1));
    const maxDev = Math.max(0.01, ...devs);
    const half   = Math.floor(data.length / 2);
    const firstD = devs.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const lastD  = devs.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, data.length - half);
    const converging = half >= 2 && lastD < firstD * 0.85;

    const bars = data.map((w, i) => {
      const h     = Math.max(3, Math.round(devs[i] / maxDev * 44));
      const ratio = Math.round(w.avgRatio * 10) / 10;
      return `<div class="cvbar" style="height:${h}px" title="${w.week} · ${ratio}배"></div>`;
    }).join('');

    sections.push(
      `<div style="margin-bottom:14px">` +
      `<div class="bias-name" style="font-size:12px;margin-bottom:3px">${esc(b.subject)}</div>` +
      `<div class="converge-row">${bars}</div>` +
      (converging
        ? `<div class="help" style="font-size:11px;margin-top:1px">오차가 줄고 있어요</div>`
        : '') +
      `</div>`
    );
  });

  if (!sections.length) return '';

  return `<div class="chapter" style="margin-top:4px">` +
    `<div class="chap-hd">` +
    `<span class="chap-num">수렴</span>` +
    `<span class="chap-name">예상이 실제에 가까워지는 중</span>` +
    `</div>` +
    sections.join('') +
    `</div>`;
}

/* ── 나에 대한 설명서 ─────────────────────────── */
function renderManual() {
  const root = $('#manual-wrap'); if (!root) return;
  const learnings = DB.learnings || [];
  const isEmpty   = !learnings.length;

  const chapters = [
    { key: 'time',     num: '1장', name: '시간 감각' },
    { key: 'rhythm',   num: '2장', name: '리듬' },
    { key: 'focus',    num: '3장', name: '집중' },
    { key: 'strength', num: '4장', name: '강점' }
  ];

  let h = '';

  // coldstart vision / motivation
  if (DB.coldstart && DB.coldstart.vision) {
    h += `<div class="manual-intent"><span class="intent-lbl">내 방향</span><div class="intent-txt">${esc(DB.coldstart.vision)}</div></div>`;
  }
  if (DB.coldstart && DB.coldstart.motivation) {
    h += `<div class="manual-intent"><span class="intent-lbl">현재 내 동기</span><div class="intent-txt">${esc(DB.coldstart.motivation)}</div></div>`;
  }

  // 콜드스타트 (learnings 없을 때)
  if (isEmpty) {
    h += '<div class="manual-cold">아직 너를 잘 몰라. 같이 알아가자.</div>';
  }

  // firstIntent — 항상 표시 (있을 때)
  if (DB.settings.firstIntent) {
    h += `<div class="manual-intent">` +
         `<span class="intent-lbl">네가 처음 말한 것</span>` +
         `<div class="intent-txt">${esc(DB.settings.firstIntent)}</div></div>`;
    if (isEmpty) {
      h += '<div class="manual-cold" style="margin-top:-6px;margin-bottom:16px">데이터가 쌓이면 여기서 확인하게 될 거야.</div>';
    }
  }

  // 4개 장(章)
  chapters.forEach(ch => {
    const items = learnings.filter(l => l.chapter === ch.key);
    const active = items.filter(l => l.status !== 'superseded');
    // 강점 장에는 superseded 표시 없음
    const superseded = ch.key !== 'strength'
      ? items.filter(l => l.status === 'superseded')
      : [];

    h += `<div class="chapter">` +
         `<div class="chap-hd">` +
         `<span class="chap-num">${ch.num}</span>` +
         `<span class="chap-name">${ch.name}</span>` +
         `</div>`;

    if (!active.length && !superseded.length) {
      h += '<div class="chap-empty">아직 없어요</div>';
    } else {
      active.forEach(l => {
        const isConf    = l.score != null ? l.score >= 0.7 : l.confidence === 'confirmed';
        const conf      = isConf ? 'confirmed' : 'tentative';
        const confLabel = isConf ? '확인됨' : '잠정';
        h += `<div class="learning-item active">` +
             `<div class="learning-text">${esc(l.text)}</div>` +
             `<div class="learning-meta">` +
             `<span class="confidence ${conf}">${confLabel}</span>` +
             (l.since ? `<span class="lrn-since">${fmtDate(l.since)}부터</span>` : '') +
             `</div></div>`;
      });
      superseded.forEach(l => {
        // 뒤집은 항목 연결 (supersededBy가 이 항목을 가리키는 새 배움)
        const successor = learnings.find(x => x.supersededBy === l.id && x.status !== 'superseded');
        h += `<div class="learning-item superseded">` +
             `<div class="learning-text">${esc(l.text)}</div>` +
             `<div class="learning-meta">` +
             (l.since       ? `<span class="lrn-since">${fmtDate(l.since)}~</span>` : '') +
             (l.supersededAt ? `<span class="lrn-since">${fmtDate(l.supersededAt)}</span>` : '') +
             `</div>` +
             (successor ? `<div class="superseded-note">→ ${esc(successor.text)}</div>` : '') +
             `</div>`;
      });
    }
    h += '</div>';
  });

  // 수렴 그래프 (데이터 충분할 때)
  h += renderConvergenceSection(DB.log);

  // 메모 키워드 (3회+ 단어 있을 때)
  const memoPat = getMemoPatterns(DB.log, 28);
  const kwText = memoPat.keywords.slice(0, 6).map(k=>k.word+'('+k.count+'회)').join(' · ');
  if (kwText) {
    h += `<div class="panel"><h2>자주 쓴 단어</h2><div class="help" style="margin-top:4px">${kwText}</div></div>`;
  }

  root.innerHTML = h;
}

/* ── 숫자 통계 (접히는 섹션) ──────────────────── */
function timeBucketLabel(slot) { return slot==='morning'?'오전':slot==='afternoon'?'오후':'저녁'; }

function renderAccuracyPortrait(rollCutoff) {
  const measuredAll = DB.log.filter(e => e.measured);
  if (!measuredAll.length) {
    return `<div class="panel"><h2>집중 측정 기록</h2>` +
      `<div class="help">아직 집중모드로 측정한 기록이 없어요. ` +
      `<b>▶ 집중</b>으로 시간을 재면, 여기에 당신만의 패턴이 쌓여요.</div></div>`;
  }
  const roll = measuredAll.filter(e => e.date >= rollCutoff).sort((a, b) => a.ts - b.ts);
  let h = `<div class="panel portrait"><h2>집중 측정 기록</h2>`;
  h += `<div class="cumulative">지금까지 측정한 세션 <b>${measuredAll.length}개</b>` +
       `${measuredAll.length >= 3 ? '. 패턴이 쌓이고 있어요.' : ''}</div>`;

  if (roll.length >= 4) {
    const tail   = roll.slice(-10);
    const errs   = tail.map(e => e.planned ? Math.abs((e.minutes - e.planned) / e.planned) * 100 : 0);
    const maxErr = Math.max(20, ...errs);
    h += `<div class="converge-row">` +
      tail.map((e, i) =>
        `<div class="cvbar" style="height:${Math.max(4, Math.round(errs[i] / maxErr * 44))}px" title="${esc(e.subject)}"></div>`
      ).join('') + `</div>`;
    const half     = Math.floor(errs.length / 2);
    const firstAvg = errs.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
    const lastAvg  = errs.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, errs.length - half);
    if (half >= 2 && lastAvg < firstAvg * 0.85) {
      h += `<div class="help" style="margin-top:6px">최근일수록 오차가 줄고 있어요.</div>`;
    }
  }

  const bySubj = {};
  roll.forEach(e => { if (!e.planned) return; (bySubj[e.subject] = bySubj[e.subject] || []).push(e); });
  const rows = Object.entries(bySubj).filter(([, a]) => a.length >= 3).map(([name, a]) => {
    const avgPct = a.reduce((s, e) => s + (e.minutes - e.planned) / e.planned, 0) / a.length * 100;
    return { name, color: a[a.length - 1].color, avgPct };
  });
  if (rows.length) {
    h += `<div class="bias-list">`;
    rows.forEach(r => {
      const dir  = r.avgPct > 5 ? 'over' : (r.avgPct < -5 ? 'under' : 'flat');
      const pct  = Math.round(Math.abs(r.avgPct) / 5) * 5;
      const sent = dir === 'over'  ? `보통 예상보다 ${pct}% 더 걸려요`
                 : dir === 'under' ? `보통 예상보다 ${pct}% 일찍 끝나요`
                 : '예상이 거의 정확해요';
      const half = Math.min(45, Math.round(pct / 60 * 45));
      const fill = dir === 'flat' ? '' :
        `<div class="bias-fill" style="background:${r.color};${dir === 'under' ? 'right' : 'left'}:50%;width:${half}%"></div>`;
      h += `<div class="bias-row">` +
           `<div class="bias-name"><span class="bdot" style="background:${r.color}"></span>${esc(r.name)}</div>` +
           `<div class="bias-track"><div class="bias-center"></div>${fill}</div>` +
           `<div class="bias-sent">${sent}</div></div>`;
    });
    h += `</div>`;
  } else {
    h += `<div class="help" style="margin-top:8px">같은 과목을 집중모드로 3번 이상 측정하면 그 과목의 패턴이 보여요.</div>`;
  }

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
    flags.push(dom && dom[1] / o.slots.length >= 0.6
      ? `${esc(name)}은 주로 ${timeBucketLabel(dom[0])}에 방해가 있었어요`
      : `${esc(name)}에서 방해가 자주 있었어요`);
  });
  if (flags.length) {
    h += `<div class="flag-box"><h3>방해 패턴</h3>` +
         flags.map(f => `<div class="flag-row">· ${f}</div>`).join('') + `</div>`;
  }

  h += `</div>`; return h;
}

function renderNumberStats() {
  const root = $('#stats'); if (!root) return;
  const ds  = DB.day.date, now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - 14);
  const rollCutoff = dateStr(cutoff);
  let h = renderAccuracyPortrait(rollCutoff);

  const todayLog   = DB.log.filter(e => e.date === ds);
  const todayTotal = todayLog.reduce((s, e) => s + e.minutes, 0);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); days.push(dateStr(d)); }
  const inWeek    = DB.log.filter(e => days.includes(e.date));
  const weekTotal = inWeek.reduce((s, e) => s + e.minutes, 0);

  if (weekTotal || todayTotal) {
    const subj = {};
    inWeek.forEach(e => { if (!subj[e.subject]) subj[e.subject] = { m: 0, c: e.color }; subj[e.subject].m += e.minutes; });
    const subjArr = Object.entries(subj).map(([k, v]) => ({ name: k, m: v.m, c: v.c })).sort((a, b) => b.m - a.m);
    const maxS    = Math.max(1, ...subjArr.map(s => s.m));
    const daily   = days.map(d => DB.log.filter(e => e.date === d).reduce((s, e) => s + e.minutes, 0));
    const maxD    = Math.max(1, ...daily);

    h += `<div class="panel"><h2>오늘</h2>` +
         `<div class="bignum">${todayTotal ? fmtMin(todayTotal) : '0<small>분</small>'}</div>` +
         `<div class="help" style="margin-top:6px">완료한 블록 ${todayLog.length}개</div></div>`;

    h += `<div class="panel"><h2>최근 7일 · 하루별</h2><div class="week">`;
    days.forEach((d, i) => {
      const hh = Math.round(daily[i] / maxD * 82), lab = DOW[new Date(d + 'T00:00').getDay()], t = d === ds;
      h += `<div class="wd${t ? ' today' : ''}">` +
           `<div class="col" style="height:${daily[i] ? Math.max(3, hh) : 3}px;background:${t ? 'var(--amber)' : 'var(--pine)'}"></div>` +
           `<div class="dl">${lab}</div></div>`;
    });
    h += `</div><div class="help" style="margin-top:10px">7일 합계 · ${fmtMin(weekTotal)}</div></div>`;

    h += `<div class="panel"><h2>최근 7일 · 과목별</h2>`;
    subjArr.forEach(s => {
      h += `<div class="sbar">` +
           `<div class="lab"><span>${esc(s.name)}</span><span class="v">${fmtMin(s.m)}</span></div>` +
           `<div class="track"><div class="fill" style="width:${Math.round(s.m / maxS * 100)}%;background:${s.c}"></div></div>` +
           `</div>`;
    });
    h += `</div>`;
  }
  root.innerHTML = h;
}

function renderStats() {
  renderManual();
  renderNumberStats();
}

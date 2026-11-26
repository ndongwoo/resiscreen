/** 결과 화면과 인쇄용 HTML 만들기. 모든 값은 textContent 또는 escape로 넣는다(파일 내용을 HTML로 해석하지 않음). */
import { RECHECKABLE_RULES, type Finding, type Level, type PaperResult, type PaperSource, type Report } from '../engine/report.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const LEVEL_LABEL: Record<Level, string> = { ERROR: '제출 전 반드시 수정', WARNING: '확인 권장', INFO: '참고' };

export function formLine(report: Report): string {
  const f = report.form;
  if (!f) return '적용 양식: 지원하지 않는 양식';
  return `적용 양식: ${f.year}년도 · 실적 기간 ${f.period_default.start}~${f.period_default.end} · 3~2월 항목 ${f.period_mar_feb.start}~${f.period_mar_feb.end} · 전문의 수 기준일 ${f.staff_count_date} · 평가 전년도 10/1 ${f.prev_oct1} · 평가년도 5/1 ${f.eval_may1} · 평가년도 2월 말일 ${f.feb_end} · 논문 연도 ${f.paper_year}`;
}

const STATUS_LABEL: Record<PaperResult['status'], string> = {
  matched: '일치',
  uncertain: '확신 미달(후보 확인 필요)',
  not_found: '후보 없음',
  failed: '조회 실패',
  cancelled: '취소됨',
  skipped: '조회 안 함',
};

export function sourceText(x: PaperSource | undefined): string {
  if (!x) return '-';
  const st = x.status === 'ok' ? '찾음' : x.status === 'not_found' ? '없음' : `실패(${x.error ?? '오류'})`;
  return `${st} · ${x.cache === 'hit' ? `캐시(${x.fetchedAt ?? '날짜 모름'} 조회)` : '새로 조회'}`;
}

export function paperRowsText(report: Report): string[][] {
  return (report.papers ?? []).map((p) => [String(p.row), p.journal, p.claim, STATUS_LABEL[p.status], sourceText(p.sources['crossref']), sourceText(p.sources['pubmed'])]);
}

export function versionLine(report: Report): string {
  const t = report.tool;
  return `앱 버전 ${t.app} (엔진 ${t.version}) · 규칙 파일 ${t.rulesVersion} (${t.rulesStatus}) · KCI 목록 기준일 ${t.kciAsOf}`;
}

function where(f: Finding): string {
  return f.cell ? f.cell : f.row ? `${f.row}행` : '시트 전체';
}

function sourceLine(report: Report): string[][] {
  const out: string[][] = [];
  for (const [k, label] of [
    ['crossref', 'Crossref'],
    ['pubmed', 'PubMed'],
  ] as const) {
    const x = report.biblio.bySource?.[k];
    if (!x) continue;
    const reasons = Object.entries(x.retryReasons ?? {})
      .map(([r, n]) => `${r} ${n}`)
      .join(', ');
    out.push([label, String(x.ok), String(x.notFound), String(x.error), `${x.retries}${reasons ? ` (${reasons})` : ''}`, String(x.cacheHits)]);
  }
  return out;
}

export function renderSummary(root: HTMLElement, report: Report): void {
  root.replaceChildren();
  if (!report.supported) {
    const box = el('div', 'error-box');
    box.textContent = report.findings[0]?.message ?? '지원하지 않는 파일입니다.';
    root.append(box);
  }
  const cards = el('div', 'cards');
  for (const lv of ['ERROR', 'WARNING', 'INFO'] as const) {
    const c = el('div', `stat ${lv}`);
    c.append(el('span', 'n', String(report.summary[lv])), el('span', '', `${lv} · ${LEVEL_LABEL[lv]}`));
    cards.append(c);
  }
  root.append(cards);
  const meta = el('div', 'meta');
  const b = report.biblio;
  meta.append(
    el('p', '', `파일: ${report.file.name}`),
    el('p', '', formLine(report)),
    el('p', '', versionLine(report)),
    el(
      'p',
      '',
      b.skipped
        ? '외부 서지 조회: 사용 안 함'
        : `외부 서지 조회: 논문 ${b.attempted}편 중 조회 성공 ${b.succeeded}편, 실패 ${b.failed}편${b.cancelled ? ' (취소됨: 남은 논문은 확인 불가로 표시)' : ''}`,
    ),
  );
  const rows = sourceLine(report);
  if (rows.length) {
    const t = el('table');
    const head = el('tr');
    for (const h of ['출처', '찾음', '없음', '실패', '재시도', '캐시 적중']) head.append(el('th', '', h));
    t.append(head);
    for (const r of rows) {
      const tr = el('tr');
      for (const v of r) tr.append(el('td', '', v));
      t.append(tr);
    }
    meta.append(t);
  }
  root.append(meta);
}

export interface RecheckHandler {
  enabled: boolean;
  busyRow: number | null;
  onRecheck: (row: number) => void;
}

function recheckButton(row: number, h: RecheckHandler): HTMLButtonElement {
  const b = el('button', 'btn ghost small-btn', h.busyRow === row ? '조회 중…' : '다시 조회');
  b.type = 'button';
  b.disabled = !h.enabled || h.busyRow !== null;
  b.title = '이 논문만 캐시를 무시하고 다시 조회합니다';
  b.addEventListener('click', () => h.onRecheck(row));
  return b;
}

export function renderPapers(root: HTMLElement, report: Report, h: RecheckHandler): void {
  root.replaceChildren();
  const papers = report.papers ?? [];
  if (!papers.length) return;
  root.append(el('h3', '', `논문 조회 결과 (${papers.length}편)`));
  const wrap = el('div', 'table-wrap');
  const t = el('table', 'findings');
  const head = el('tr');
  for (const x of ['행', '저널(기재)', '기재 구분', '결과', 'Crossref', 'PubMed', '']) head.append(el('th', '', x));
  t.append(head);
  paperRowsText(report).forEach((cells, i) => {
    const tr = el('tr');
    for (const c of cells) tr.append(el('td', '', c));
    const td = el('td');
    if (!report.biblio.skipped) td.append(recheckButton(papers[i]!.row, h));
    tr.append(td);
    t.append(tr);
  });
  wrap.append(t);
  root.append(wrap);
}

export function renderFindings(root: HTMLElement, report: Report, show: Set<Level>, h?: RecheckHandler): void {
  root.replaceChildren();
  const list = report.findings.filter((f) => show.has(f.level));
  if (!list.length) {
    root.append(el('p', 'empty', report.findings.length ? '선택한 단계의 결과가 없습니다.' : '점검 결과가 없습니다.'));
    return;
  }
  const bySheet = new Map<string, Finding[]>();
  for (const f of list) {
    const arr = bySheet.get(f.sheet) ?? [];
    arr.push(f);
    bySheet.set(f.sheet, arr);
  }
  for (const [sheet, fs] of bySheet) {
    const counts = (['ERROR', 'WARNING', 'INFO'] as const).map((lv) => `${lv} ${fs.filter((f) => f.level === lv).length}`).join(' · ');
    root.append(el('h3', '', `${sheet}  (${counts})`));
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'findings');
    const head = el('tr');
    for (const h of ['단계', '위치', '항목', '설명', '근거', '규칙']) head.append(el('th', '', h));
    t.append(head);
    for (const f of fs) {
      const tr = el('tr');
      const lv = el('td');
      lv.append(el('span', `lvl ${f.level}`, f.level));
      const msg = el('td', '', f.message);
      if (h && !report.biblio.skipped && f.row !== undefined && RECHECKABLE_RULES.includes(f.ruleId)) {
        msg.append(el('br'), recheckButton(f.row, h));
      }
      tr.append(lv, el('td', '', where(f)), el('td', '', f.itemCode ?? ''), msg, el('td', 'basis', f.basis), el('td', 'rule-id', f.ruleId));
      t.append(tr);
    }
    wrap.append(t);
    root.append(wrap);
  }
}

/** 인쇄용 독립 HTML(스크립트 없음, 자체 CSP로 스크립트 차단) */
export function printableHtml(report: Report): string {
  const rows = report.findings
    .map(
      (f) =>
        `<tr class="${esc(f.level)}"><td>${esc(f.level)}</td><td>${esc(f.sheet)}</td><td>${esc(where(f))}</td><td>${esc(f.itemCode ?? '')}</td><td>${esc(f.message)}</td><td class="b">${esc(f.basis)}</td><td class="r">${esc(f.ruleId)}</td></tr>`,
    )
    .join('\n');
  const src = sourceLine(report)
    .map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
    .join('');
  const b = report.biblio;
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>점검결과 - ${esc(report.file.name)}</title>
<style>
body{font:12px/1.5 'Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;color:#000;margin:16px}
h1{font-size:18px;margin:0 0 4px}.n{color:#555}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #bbb;padding:3px 6px;vertical-align:top;text-align:left}
th{background:#f0f0f0}tr.ERROR td:first-child{background:#fde2e2;font-weight:bold}tr.WARNING td:first-child{background:#fff4d6}
.b{color:#555}.r{font-family:monospace;white-space:nowrap}.s td{text-align:right}.s td:first-child{text-align:left}
tr{break-inside:avoid}
</style></head><body>
<h1>수련실태조사서 사전 점검 결과</h1>
<p class="n">이 결과는 참고용이며 공식 심사 결과가 아닙니다. 최종 판정은 학회 사무국과 수련위원이 합니다.</p>
<p>${esc(versionLine(report))}</p>
<p>${esc(formLine(report))}</p>
<p>파일: ${esc(report.file.name)} · ERROR ${report.summary.ERROR} · WARNING ${report.summary.WARNING} · INFO ${report.summary.INFO}</p>
<p>외부 서지 조회: ${b.skipped ? '사용 안 함' : `논문 ${b.attempted}편 중 성공 ${b.succeeded}, 실패 ${b.failed}${b.cancelled ? ' (취소됨)' : ''}`}</p>
${src ? `<table class="s"><tr><th>출처</th><th>찾음</th><th>없음</th><th>실패</th><th>재시도</th><th>캐시 적중</th></tr>${src}</table>` : ''}
${(report.papers ?? []).length ? `<h2>논문 조회 결과</h2><table><tr><th>행</th><th>저널(기재)</th><th>기재 구분</th><th>결과</th><th>Crossref</th><th>PubMed</th></tr>${paperRowsText(report).map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table><h2>점검 결과</h2>` : ''}
<table><tr><th>단계</th><th>시트</th><th>위치</th><th>항목</th><th>설명</th><th>근거</th><th>규칙</th></tr>
${rows}
</table>
<p class="n">${esc(versionLine(report))}</p>
</body></html>`;
}

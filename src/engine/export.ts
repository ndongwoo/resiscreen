/**
 * 결과물 생성. 원본 엑셀은 다시 저장하지 않는다(임베디드 증빙이 빠질 수 있음).
 * '점검결과' 엑셀은 요약 시트와 결과 목록 시트만 담은 새 파일이다.
 */
import ExcelJS from 'exceljs';
import type { Report } from './report.ts';

const NOTICE = '이 결과는 참고용이며 공식 심사 결과가 아닙니다. 최종 판정은 사무국과 수련위원이 합니다.';

export async function reportToXlsx(report: Report): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'resiscreen';
  // 생성 시각을 고정해 같은 입력이면 같은 내용이 나오게 한다
  wb.created = new Date(0);
  wb.modified = new Date(0);

  const sum = wb.addWorksheet('요약');
  sum.columns = [{ width: 24 }, { width: 60 }];
  const rows: [string, string | number][] = [
    ['파일', report.file.name],
    ['양식 연도', report.formYear ?? '지원하지 않는 양식'],
    ...(report.form
      ? ([
          ['실적 기간', `${report.form.period_default.start} ~ ${report.form.period_default.end}`],
          ['3~2월 항목 기간', `${report.form.period_mar_feb.start} ~ ${report.form.period_mar_feb.end}`],
          ['전문의 수 기준일', report.form.staff_count_date],
          ['평가 전년도 10/1 기준일', report.form.prev_oct1],
          ['평가년도 5/1 기준일', report.form.eval_may1],
          ['평가년도 2월 말일', report.form.feb_end],
          ['논문 연도', report.form.paper_year],
        ] as [string, string | number][])
      : []),
    ['ERROR (제출 전 반드시 수정)', report.summary.ERROR],
    ['WARNING (확인 권장)', report.summary.WARNING],
    ['INFO (참고)', report.summary.INFO],
    ['외부 서지 조회', report.biblio.skipped ? '사용 안 함' : `논문 ${report.biblio.attempted}편 중 조회 성공 ${report.biblio.succeeded}, 실패 ${report.biblio.failed}${report.biblio.cancelled ? ' (취소됨)' : ''}`],
    ...(['crossref', 'pubmed'] as const).map((k): [string, string] => {
      const x = report.biblio.bySource?.[k];
      return [k === 'crossref' ? '  Crossref' : '  PubMed', x ? `찾음 ${x.ok} · 없음 ${x.notFound} · 실패 ${x.error} · 요청 ${x.requests} · 재시도 ${x.retries} · 캐시 ${x.cacheHits}` : '-'];
    }),
    ['앱 버전', `${report.tool.app} (엔진 ${report.tool.version})`],
    ['규칙 파일 버전', `${report.tool.rulesVersion} (${report.tool.rulesStatus})`],
    ['KCI 목록 기준일', report.tool.kciAsOf],
    ['안내', NOTICE],
  ];
  for (const r of rows) sum.addRow(r);
  sum.getColumn(1).font = { bold: true };
  sum.addRow([]);
  sum.addRow(['시트', 'ERROR / WARNING / INFO']).font = { bold: true };
  for (const [sheet, c] of Object.entries(report.summary.bySheet)) sum.addRow([sheet, `${c.ERROR} / ${c.WARNING} / ${c.INFO}`]);

  const list = wb.addWorksheet('점검결과');
  list.columns = [
    { header: '단계', key: 'level', width: 10 },
    { header: '시트', key: 'sheet', width: 16 },
    { header: '셀', key: 'cell', width: 10 },
    { header: '항목', key: 'item', width: 10 },
    { header: '규칙 ID', key: 'rule', width: 18 },
    { header: '설명', key: 'message', width: 70 },
    { header: '근거', key: 'basis', width: 70 },
  ];
  list.getRow(1).font = { bold: true };
  list.views = [{ state: 'frozen', ySplit: 1 }];
  for (const f of report.findings) {
    const row = list.addRow({
      level: f.level,
      sheet: f.sheet,
      cell: f.cell ?? (f.row ? `${f.row}행` : ''),
      item: f.itemCode ?? '',
      rule: f.ruleId,
      message: f.message,
      basis: f.basis,
    });
    row.alignment = { vertical: 'top', wrapText: true };
    const color = f.level === 'ERROR' ? 'FFFDE2E2' : f.level === 'WARNING' ? 'FFFFF4D6' : undefined;
    if (color) row.getCell('level').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  }
  list.autoFilter = { from: 'A1', to: 'G1' };

  // 논문별 조회 결과(출처별 결과와 캐시·조회일). 논문 제목은 넣지 않는다
  if (!report.biblio.skipped && (report.papers ?? []).length) {
    const ps = wb.addWorksheet('논문 조회');
    ps.columns = [
      { header: '행', key: 'row', width: 6 },
      { header: '저널(기재)', key: 'journal', width: 36 },
      { header: '기재 구분', key: 'claim', width: 22 },
      { header: '결과', key: 'status', width: 22 },
      { header: 'Crossref', key: 'crossref', width: 30 },
      { header: 'PubMed', key: 'pubmed', width: 30 },
    ];
    ps.getRow(1).font = { bold: true };
    const label: Record<string, string> = { matched: '일치', uncertain: '확신 미달(후보 확인 필요)', not_found: '후보 없음', failed: '조회 실패', cancelled: '취소됨', skipped: '조회 안 함' };
    const src = (x?: { status: string; error?: string; cache: string; fetchedAt?: string }) =>
      !x ? '-' : `${x.status === 'ok' ? '찾음' : x.status === 'not_found' ? '없음' : `실패(${x.error ?? '오류'})`} · ${x.cache === 'hit' ? `캐시(${x.fetchedAt ?? '날짜 모름'} 조회)` : '새로 조회'}`;
    for (const p of report.papers ?? [])
      ps.addRow({ row: p.row, journal: p.journal, claim: p.claim, status: label[p.status] ?? p.status, crossref: src(p.sources['crossref']), pubmed: src(p.sources['pubmed']) });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** 브라우저·CLI 결과 비교용 정규화 JSON(시간 값 제외) */
export function reportToStableJson(report: Report): string {
  const { timingsMs: _t, ...rest } = report;
  return JSON.stringify(rest, null, 2);
}

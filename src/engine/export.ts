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
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

/** 브라우저·CLI 결과 비교용 정규화 JSON(시간 값 제외) */
export function reportToStableJson(report: Report): string {
  const { timingsMs: _t, ...rest } = report;
  return JSON.stringify(rest, null, 2);
}

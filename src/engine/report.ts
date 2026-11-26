/** 점검 결과 모델. 이 도구는 판정하지 않는다: 문구는 '확인 필요', '불인정될 수 있음'으로 쓴다. */

export type Level = 'ERROR' | 'WARNING' | 'INFO';

export interface Finding {
  level: Level;
  ruleId: string;
  sheet: string;
  /** 셀 주소(A1) 또는 범위. 행 단위 결과면 행 번호만 있을 수 있다 */
  cell?: string;
  row?: number;
  /** '전체' 시트 항목 코드(A-2-1 등) */
  itemCode?: string;
  message: string;
  basis: string;
  /** 계산값 등 보조 정보. 환자 이름·저자 이름 같은 개인정보는 넣지 않는다 */
  detail?: Record<string, unknown>;
}

export interface SourceStats {
  ok: number;
  notFound: number;
  error: number;
  requests: number;
  retries: number;
  cacheHits: number;
  retryReasons?: Record<string, number>;
}

export interface BiblioStats {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
  cancelled?: boolean;
  /** 출처별: 찾음·없음·실패(재시도 후)·요청·재시도·캐시 적중 */
  bySource?: { crossref: SourceStats; pubmed: SourceStats };
}

/** 논문별 조회 결과(제목은 담지 않는다) */
export interface PaperResult {
  row: number;
  journal: string;
  claim: string;
  domestic: boolean;
  /** matched 일치, uncertain 확신 미달, not_found 후보 없음, failed 조회 실패, cancelled 취소, skipped 조회 안 함 */
  status: 'matched' | 'uncertain' | 'not_found' | 'failed' | 'cancelled' | 'skipped';
  sources: Record<string, string>;
  similarity?: number;
  /** 이 논문 행에 나온 규칙 ID */
  rules: string[];
}

export interface Report {
  tool: {
    name: 'resiscreen';
    /** 엔진 버전 */
    version: string;
    /** 앱 버전(git 커밋). 빌드·실행 환경이 알려 준다 */
    app: string;
    rulesStatus: string;
    /** 규칙 파일 버전과 내용 지문(rules_version · 해시 8자리) */
    rulesVersion: string;
    /** KCI 등재(후보)지 목록 기준일 */
    kciAsOf: string;
  };
  file: { name: string; size: number };
  formYear: number | null;
  supported: boolean;
  findings: Finding[];
  summary: { ERROR: number; WARNING: number; INFO: number; bySheet: Record<string, { ERROR: number; WARNING: number; INFO: number }> };
  biblio: BiblioStats;
  papers?: PaperResult[];
  timingsMs: Record<string, number>;
}

const LEVEL_ORDER: Record<Level, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

function cellSortKey(cell: string | undefined, row: number | undefined): [number, number] {
  if (cell) {
    const m = /^([A-Z]+)(\d+)/.exec(cell);
    if (m) {
      let col = 0;
      for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
      return [Number(m[2]), col];
    }
  }
  return [row ?? 0, 0];
}

/** 시트 순서(통합문서 순서) → 위치 → 단계 → 규칙 ID 순으로 정렬. 같은 입력이면 항상 같은 순서. */
export function sortFindings(findings: Finding[], sheetOrder: string[]): Finding[] {
  const idx = new Map(sheetOrder.map((s, i) => [s, i]));
  return [...findings].sort((a, b) => {
    const sa = idx.get(a.sheet) ?? -1;
    const sb = idx.get(b.sheet) ?? -1;
    if (sa !== sb) return sa - sb;
    const [ra, ca] = cellSortKey(a.cell, a.row);
    const [rb, cb] = cellSortKey(b.cell, b.row);
    if (ra !== rb) return ra - rb;
    if (ca !== cb) return ca - cb;
    if (a.level !== b.level) return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
}

export function summarize(findings: Finding[]): Report['summary'] {
  const summary: Report['summary'] = { ERROR: 0, WARNING: 0, INFO: 0, bySheet: {} };
  for (const f of findings) {
    summary[f.level]++;
    const s = (summary.bySheet[f.sheet] ??= { ERROR: 0, WARNING: 0, INFO: 0 });
    s[f.level]++;
  }
  return summary;
}

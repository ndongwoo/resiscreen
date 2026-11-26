/**
 * .xlsx 읽기: JSZip으로 압축을 풀고 필요한 XML 파트만 직접 해석한다.
 * - 수식은 계산하지 않는다. 엑셀이 저장해 둔 값(캐시)만 읽는다.
 * - 외부 링크·매크로·임베디드 파일은 실행하거나 열지 않는다. 위치와 종류만 목록화한다.
 * - 하이퍼링크 대상 URL은 기록만 하고 호출하지 않는다.
 */
import JSZip from 'jszip';
import { child, children, descendants, parseXml, textContent, type XmlElement } from './xml.ts';
import { indexToCol, parseCoord, translateFormula } from './refs.ts';

export type CellType = 'n' | 's' | 'b' | 'e' | 'empty';

export interface Cell {
  /** 'A1' 형식 */
  ref: string;
  row: number;
  col: number;
  /** 저장된 값: 수식이면 캐시값 */
  value: string | number | boolean | null;
  type: CellType;
  /** 수식 본문('=' 없음). 공유 수식 승계 셀은 전개한 수식 */
  formula?: string;
  formulaKind?: 'normal' | 'shared' | 'array' | 'dataTable';
  /** 표시 형식 코드(예: 'yyyy-mm-dd', '@', 'General') */
  numFmt: string;
  /** 표시 형식이 날짜인 숫자 셀 */
  isDate: boolean;
}

export interface Hyperlink {
  ref: string;
  /** 외부 대상(URL·파일). 호출하지 않는다 */
  target?: string;
  /** 통합문서 내부 위치(시트!셀) */
  location?: string;
}

export interface EmbeddedObject {
  kind: 'oleObject' | 'package';
  progId: string;
  /** 패키지 안 파트 경로(xl/embeddings/...) */
  part: string;
  /** 앵커 왼쪽 위 셀(1-기준). 앵커가 없으면 undefined */
  row?: number;
  col?: number;
  rowTo?: number;
  colTo?: number;
}

export interface Sheet {
  name: string;
  index: number;
  state: string;
  cells: Map<string, Cell>;
  merged: string[];
  hyperlinks: Hyperlink[];
  embedded: EmbeddedObject[];
  /** 그림·도형 개수(첨부 여부 참고용) */
  drawingObjects: number;
}

export interface Workbook {
  sheets: Sheet[];
  sheetByName: Map<string, Sheet>;
  date1904: boolean;
  /** 외부 통합문서 링크 개수(열지 않음) */
  externalLinkCount: number;
  embeddingParts: string[];
}

export class WorkbookError extends Error {
  constructor(
    message: string,
    readonly code: 'not_zip' | 'macro' | 'not_xlsx' | 'too_large' | 'zip_bomb' | 'corrupt',
  ) {
    super(message);
  }
}

export const LIMITS = {
  maxMembers: 5000,
  maxTotalUncompressed: 800 * 1024 * 1024,
  maxXmlPart: 200 * 1024 * 1024,
  maxRatio: 300,
};

/** zip 매직 바이트(PK\x03\x04) 확인 */
export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const BUILTIN_FMTS: Record<number, string> = { 0: 'General', 1: '0', 2: '0.00', 9: '0%', 10: '0.00%', 14: 'yyyy-mm-dd', 49: '@' };

export function isDateFormat(code: string): boolean {
  if (!code || code === 'General' || code === '@') return false;
  // 따옴표 문자열, 역슬래시 이스케이프, [색상]·[$-로케일] 제거. 단 [h] 같은 경과시간은 날짜로 본다
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/_.|\*./g, '')
    .replace(/\[(?![hms]+\])[^\]]*\]/gi, '');
  return /[ymdhs]/i.test(stripped) && !/^[#0.,%\s;()-]*$/.test(stripped);
}

/** 엑셀 날짜 시리얼 → 'YYYY-MM-DD' (1900 체계의 1900-02-29 버그 반영) */
export function serialToISODate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const days = Math.floor(serial);
  let ms: number;
  if (date1904) ms = Date.UTC(1904, 0, 1) + days * 86400000;
  else {
    // 1900 체계: 60 = 1900-02-29(존재하지 않는 날). 61 이상은 하루를 뺀다
    if (days === 60) return '1900-02-29';
    ms = Date.UTC(1899, 11, 31) + (days > 60 ? days - 1 : days) * 86400000;
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (baseDir ? baseDir.split('/') : []).concat(target.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path);
  if (!f) return null;
  const size = uncompressedSize(f);
  if (size !== undefined && size > LIMITS.maxXmlPart) throw new WorkbookError(`XML 파트가 너무 큽니다: ${path}`, 'zip_bomb');
  return f.async('string');
}

function uncompressedSize(f: JSZip.JSZipObject): number | undefined {
  // JSZip 3.x 내부 필드. 없으면 확인을 건너뛴다
  const d = (f as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
  return d?.uncompressedSize;
}

function compressedSize(f: JSZip.JSZipObject): number | undefined {
  const d = (f as unknown as { _data?: { compressedSize?: number } })._data;
  return d?.compressedSize;
}

async function readRels(zip: JSZip, part: string): Promise<Map<string, Rel>> {
  const slash = part.lastIndexOf('/');
  const dir = slash < 0 ? '' : part.slice(0, slash);
  const base = slash < 0 ? part : part.slice(slash + 1);
  const relPath = `${dir ? dir + '/' : ''}_rels/${base}.rels`;
  const xml = await readText(zip, relPath);
  const out = new Map<string, Rel>();
  if (!xml) return out;
  for (const r of descendants(parseXml(xml), 'Relationship')) {
    const external = r.attrs['TargetMode'] === 'External';
    const target = r.attrs['Target'] ?? '';
    out.set(r.attrs['Id'] ?? '', {
      id: r.attrs['Id'] ?? '',
      type: (r.attrs['Type'] ?? '').split('/').pop() ?? '',
      target: external ? target : resolvePath(dir, target),
      external,
    });
  }
  return out;
}

/** OOXML 문자열 이스케이프(_xHHHH_) 풀기. _x005F_는 밑줄 자체 */
export function decodeXString(s: string): string {
  if (s.indexOf('_x') < 0) return s;
  return s.replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** sharedStrings의 <si>: 일반 <t>와 서식 있는 <r><t> 연결, 루비(<rPh>) 제외 */
export function sharedStringText(si: XmlElement): string {
  let s = '';
  for (const c of si.children) {
    if (c.name === 't') s += textContent(c);
    else if (c.name === 'r') {
      const t = child(c, 't');
      if (t) s += textContent(t);
    }
  }
  return decodeXString(s);
}

interface StyleInfo {
  numFmts: string[]; // cellXfs index → 형식 코드
  isDate: boolean[];
}

function parseStyles(xml: string | null): StyleInfo {
  if (!xml) return { numFmts: [], isDate: [] };
  const root = parseXml(xml);
  const ss = child(root, 'styleSheet');
  const custom = new Map<number, string>();
  for (const nf of children(child(ss, 'numFmts'), 'numFmt'))
    custom.set(Number(nf.attrs['numFmtId']), nf.attrs['formatCode'] ?? '');
  const numFmts: string[] = [];
  const isDate: boolean[] = [];
  for (const xf of children(child(ss, 'cellXfs'), 'xf')) {
    const id = Number(xf.attrs['numFmtId'] ?? 0);
    const code = custom.get(id) ?? BUILTIN_FMTS[id] ?? (BUILTIN_DATE_FMTS.has(id) ? 'm/d/yyyy' : String(id));
    numFmts.push(code);
    isDate.push(BUILTIN_DATE_FMTS.has(id) || (custom.has(id) && isDateFormat(code)));
  }
  return { numFmts, isDate };
}

function decodeNumber(text: string): number | string {
  const n = Number(text);
  return Number.isFinite(n) ? n : text;
}

function parseSheetCells(root: XmlElement, shared: string[], styles: StyleInfo): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  const ws = child(root, 'worksheet');
  const sheetData = child(ws, 'sheetData');
  const anchors = new Map<string, { ref: string; formula: string }>();
  const followers: { cell: Cell; si: string }[] = [];
  let lastRow = 0;
  for (const rowEl of children(sheetData, 'row')) {
    const rowNum = rowEl.attrs['r'] ? Number(rowEl.attrs['r']) : lastRow + 1;
    lastRow = rowNum;
    let lastCol = 0;
    for (const c of children(rowEl, 'c')) {
      let ref = c.attrs['r'];
      let coord: { col: number; row: number };
      if (ref) coord = parseCoord(ref);
      else {
        coord = { col: lastCol + 1, row: rowNum };
        ref = undefined;
      }
      lastCol = coord.col;
      const a1 = ref ?? `${indexToCol(coord.col)}${coord.row}`;
      const t = c.attrs['t'];
      const s = Number(c.attrs['s'] ?? 0);
      const vEl = child(c, 'v');
      const fEl = child(c, 'f');
      let value: Cell['value'] = null;
      let type: CellType = 'empty';
      if (t === 'inlineStr') {
        const is = child(c, 'is');
        value = is ? sharedStringText(is) : '';
        type = 's';
      } else if (vEl) {
        const raw = textContent(vEl);
        if (t === 's') {
          value = shared[Number(raw)] ?? '';
          type = 's';
        } else if (t === 'str') {
          value = decodeXString(raw);
          type = 's';
        } else if (t === 'b') {
          value = raw === '1' || raw === 'true';
          type = 'b';
        } else if (t === 'e') {
          value = raw;
          type = 'e';
        } else if (t === 'd') {
          value = raw; // ISO 날짜 문자열
          type = 's';
        } else {
          const n = decodeNumber(raw);
          value = n;
          type = typeof n === 'number' ? 'n' : 's';
        }
      }
      const cell: Cell = {
        ref: a1,
        row: coord.row,
        col: coord.col,
        value,
        type,
        numFmt: styles.numFmts[s] ?? 'General',
        isDate: type === 'n' && (styles.isDate[s] ?? false),
      };
      if (fEl) {
        const ft = fEl.attrs['t'] ?? 'normal';
        const ftext = textContent(fEl);
        if (ft === 'shared') {
          cell.formulaKind = 'shared';
          const si = fEl.attrs['si'] ?? '';
          if (ftext) {
            cell.formula = ftext;
            anchors.set(si, { ref: a1, formula: ftext });
          } else followers.push({ cell, si });
        } else if (ft === 'array') {
          cell.formulaKind = 'array';
          cell.formula = ftext;
        } else if (ft === 'dataTable') {
          cell.formulaKind = 'dataTable';
          cell.formula = '';
        } else {
          cell.formulaKind = 'normal';
          cell.formula = ftext;
        }
      }
      if (cell.type === 'empty' && !cell.formulaKind) continue; // 서식만 있는 빈 셀
      cells.set(a1, cell);
    }
  }
  for (const { cell, si } of followers) {
    const a = anchors.get(si);
    if (!a) {
      cell.formula = '';
      continue;
    }
    try {
      cell.formula = translateFormula(a.formula, a.ref, cell.ref);
    } catch {
      cell.formula = '';
    }
  }
  return cells;
}

export interface LoadOptions {
  /** 진행 알림(시트 이름) */
  onSheet?: (name: string, index: number, total: number) => void;
}

/**
 * xlsx 바이트를 읽어 Workbook을 만든다. 형식이 맞지 않으면 WorkbookError.
 */
export async function loadWorkbook(bytes: Uint8Array, opts: LoadOptions = {}): Promise<Workbook> {
  if (!isZip(bytes)) throw new WorkbookError('xlsx(zip) 형식이 아닙니다. 엑셀에서 .xlsx로 다시 저장해 주세요.', 'not_zip');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
  } catch {
    throw new WorkbookError('파일이 손상되어 열 수 없습니다.', 'corrupt');
  }
  const names = Object.keys(zip.files);
  if (names.length > LIMITS.maxMembers) throw new WorkbookError('파일 내부 항목 수가 비정상적으로 많습니다.', 'zip_bomb');
  let total = 0;
  for (const name of names) {
    const f = zip.files[name]!;
    const u = uncompressedSize(f) ?? 0;
    const c = compressedSize(f) ?? 0;
    total += u;
    if (c > 0 && u / c > LIMITS.maxRatio && u > 10 * 1024 * 1024)
      throw new WorkbookError('압축 비율이 비정상적인 항목이 있습니다.', 'zip_bomb');
  }
  if (total > LIMITS.maxTotalUncompressed) throw new WorkbookError('압축을 풀면 크기가 허용 범위를 넘습니다.', 'zip_bomb');

  const contentTypes = (await readText(zip, '[Content_Types].xml')) ?? '';
  if (names.some((n) => /vbaProject\.bin$/i.test(n)) || /macroEnabled/i.test(contentTypes))
    throw new WorkbookError('매크로가 포함된 파일(.xlsm 등)은 받지 않습니다. .xlsx로 저장해 주세요.', 'macro');
  const wbXml = await readText(zip, 'xl/workbook.xml');
  if (!wbXml) throw new WorkbookError('엑셀 통합문서(xl/workbook.xml)가 아닙니다.', 'not_xlsx');

  const sstXml = await readText(zip, 'xl/sharedStrings.xml');
  const shared = sstXml ? children(child(parseXml(sstXml), 'sst'), 'si').map(sharedStringText) : [];
  const styles = parseStyles(await readText(zip, 'xl/styles.xml'));

  const wb = child(parseXml(wbXml), 'workbook');
  const date1904 = ['1', 'true'].includes(child(wb, 'workbookPr')?.attrs['date1904'] ?? '');
  const wbRels = await readRels(zip, 'xl/workbook.xml');
  const sheetEls = children(child(wb, 'sheets'), 'sheet');
  const sheets: Sheet[] = [];
  for (let i = 0; i < sheetEls.length; i++) {
    const s = sheetEls[i]!;
    const rel = wbRels.get(s.attrs['r:id'] ?? s.attrs['id'] ?? '');
    if (!rel || rel.type !== 'worksheet') continue; // 차트 시트 등 제외
    const name = s.attrs['name'] ?? `Sheet${i + 1}`;
    opts.onSheet?.(name, i, sheetEls.length);
    const xml = await readText(zip, rel.target);
    if (xml === null) throw new WorkbookError(`시트 파일이 없습니다: ${name}`, 'corrupt');
    const root = parseXml(xml);
    const rels = await readRels(zip, rel.target);
    const ws = child(root, 'worksheet');
    const merged = children(child(ws, 'mergeCells'), 'mergeCell').map((m) => m.attrs['ref'] ?? '');
    const hyperlinks: Hyperlink[] = children(child(ws, 'hyperlinks'), 'hyperlink').map((h) => {
      const rid = h.attrs['r:id'] ?? h.attrs['id'];
      const r = rid ? rels.get(rid) : undefined;
      return { ref: h.attrs['ref'] ?? '', target: r?.target, location: h.attrs['location'] };
    });
    // oleObject는 mc:AlternateContent의 Choice/Fallback에 두 번 나올 수 있어 shapeId로 중복 제거
    const byKey = new Map<string, EmbeddedObject>();
    for (const o of descendants(root, 'oleObject')) {
      const rid = o.attrs['r:id'] ?? o.attrs['id'] ?? '';
      const key = o.attrs['shapeId'] ?? rid;
      const anchor = child(child(o, 'objectPr'), 'anchor');
      const from = child(anchor, 'from');
      const to = child(anchor, 'to');
      const num = (el: XmlElement | undefined, n: string) => {
        const v = child(el, n);
        return v ? Number(textContent(v)) + 1 : undefined;
      };
      const rel2 = rels.get(rid);
      const item: EmbeddedObject = {
        kind: rel2?.type === 'package' ? 'package' : 'oleObject',
        progId: o.attrs['progId'] ?? '',
        part: rel2?.target ?? '',
        row: num(from, 'row'),
        col: num(from, 'col'),
        rowTo: num(to, 'row'),
        colTo: num(to, 'col'),
      };
      const prev = byKey.get(key);
      if (!prev || (prev.row === undefined && item.row !== undefined)) byKey.set(key, item);
    }
    const embedded = [...byKey.values()];
    let drawingObjects = 0;
    for (const r of rels.values()) {
      if (r.type === 'drawing' && !r.external) {
        const dx = await readText(zip, r.target);
        if (dx) {
          const droot = parseXml(dx);
          drawingObjects += descendants(droot, 'twoCellAnchor').length + descendants(droot, 'oneCellAnchor').length;
        }
      }
    }
    sheets.push({
      name,
      index: i,
      state: s.attrs['state'] ?? 'visible',
      cells: parseSheetCells(root, shared, styles),
      merged,
      hyperlinks,
      embedded,
      drawingObjects,
    });
  }
  return {
    sheets,
    sheetByName: new Map(sheets.map((s) => [s.name, s])),
    date1904,
    externalLinkCount: names.filter((n) => /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n)).length,
    embeddingParts: names.filter((n) => n.startsWith('xl/embeddings/') && !n.endsWith('/')),
  };
}

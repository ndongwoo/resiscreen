/**
 * 테스트·합성 샘플용 최소 xlsx 작성기(JSZip). 개인정보 없는 값만 넣는다.
 * 스타일 인덱스: 0 일반, 1 내장 날짜(14), 2 사용자 날짜(yyyy-mm-dd), 3 텍스트(@)
 */
import JSZip from 'jszip';

export type CellSpec =
  | string
  | number
  | boolean
  | null
  | { v?: string | number | boolean | null; f?: string; shared?: { si: number; ref?: string }; t?: 'e' | 'str'; s?: number; inline?: boolean; rich?: string[] };

export interface SheetSpec {
  name: string;
  cells: Record<string, CellSpec>;
  merged?: string[];
  oles?: { row: number; col: number; progId?: string }[];
  hyperlinks?: { ref: string; location?: string; url?: string }[];
}

export interface BookSpec {
  sheets: SheetSpec[];
  date1904?: boolean;
  macro?: boolean;
  /** 문자열을 sharedStrings로 둘지(기본 true) */
  sharedStrings?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function sortRefs(refs: string[]): string[] {
  const key = (r: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(r)!;
    let c = 0;
    for (const ch of m[1]!) c = c * 26 + ch.charCodeAt(0) - 64;
    return Number(m[2]) * 100000 + c;
  };
  return [...refs].sort((a, b) => key(a) - key(b));
}

export async function buildXlsx(spec: BookSpec): Promise<Uint8Array> {
  const zip = new JSZip();
  const sst: string[] = [];
  const sstIndex = new Map<string, number>();
  const useShared = spec.sharedStrings !== false;
  const addShared = (xml: string) => {
    if (!sstIndex.has(xml)) {
      sstIndex.set(xml, sst.length);
      sst.push(xml);
    }
    return sstIndex.get(xml)!;
  };

  const overrides: string[] = [];
  const wbSheets: string[] = [];
  const wbRels: string[] = [];
  spec.sheets.forEach((sh, i) => {
    const n = i + 1;
    const rows = new Map<number, string[]>();
    for (const ref of sortRefs(Object.keys(sh.cells))) {
      const raw = sh.cells[ref];
      const c = raw !== null && typeof raw === 'object' ? raw : { v: raw };
      const s = c.s ? ` s="${c.s}"` : '';
      let inner = '';
      let t = '';
      if (c.f !== undefined || c.shared) {
        const sharedAttr = c.shared ? ` t="shared" si="${c.shared.si}"${c.shared.ref ? ` ref="${c.shared.ref}"` : ''}` : '';
        inner += c.f ? `<f${sharedAttr}>${esc(c.f)}</f>` : `<f${sharedAttr}/>`;
        if (c.t === 'e') t = ' t="e"';
        else if (typeof c.v === 'string') t = ' t="str"';
        else if (typeof c.v === 'boolean') t = ' t="b"';
        if (c.v !== undefined && c.v !== null) inner += `<v>${esc(typeof c.v === 'boolean' ? (c.v ? '1' : '0') : String(c.v))}</v>`;
      } else if (c.rich) {
        const runs = c.rich.map((r) => `<r><rPr><b/></rPr><t xml:space="preserve">${esc(r)}</t></r>`).join('') + '<rPh sb="0" eb="1"><t>ルビ</t></rPh>';
        if (c.inline) {
          t = ' t="inlineStr"';
          inner = `<is>${runs}</is>`;
        } else {
          t = ' t="s"';
          inner = `<v>${addShared(runs)}</v>`;
        }
      } else if (c.t === 'e') {
        t = ' t="e"';
        inner = `<v>${esc(String(c.v))}</v>`;
      } else if (typeof c.v === 'string') {
        if (c.inline || !useShared) {
          t = ' t="inlineStr"';
          inner = `<is><t xml:space="preserve">${esc(c.v)}</t></is>`;
        } else {
          t = ' t="s"';
          inner = `<v>${addShared(`<t xml:space="preserve">${esc(c.v)}</t>`)}</v>`;
        }
      } else if (typeof c.v === 'number') inner = `<v>${c.v}</v>`;
      else if (typeof c.v === 'boolean') {
        t = ' t="b"';
        inner = `<v>${c.v ? 1 : 0}</v>`;
      }
      const row = Number(/\d+$/.exec(ref)![0]);
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row)!.push(`<c r="${ref}"${s}${t}>${inner}</c>`);
    }
    const sheetData = [...rows.entries()].map(([r, cs]) => `<row r="${r}">${cs.join('')}</row>`).join('');
    const merged = sh.merged?.length ? `<mergeCells count="${sh.merged.length}">${sh.merged.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const rels: string[] = [];
    let hl = '';
    if (sh.hyperlinks?.length) {
      hl =
        '<hyperlinks>' +
        sh.hyperlinks
          .map((h, k) => {
            if (h.url) {
              rels.push(`<Relationship Id="rIdH${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(h.url)}" TargetMode="External"/>`);
              return `<hyperlink ref="${h.ref}" r:id="rIdH${k}"/>`;
            }
            return `<hyperlink ref="${h.ref}" location="${esc(h.location ?? '')}"/>`;
          })
          .join('') +
        '</hyperlinks>';
    }
    let oles = '';
    if (sh.oles?.length) {
      oles =
        '<oleObjects>' +
        sh.oles
          .map((o, k) => {
            const part = `oleObject${n}_${k}.bin`;
            zip.file(`xl/embeddings/${part}`, '%PDF-1.4 synthetic');
            rels.push(`<Relationship Id="rIdO${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/${part}"/>`);
            const sid = 1025 + k;
            const anchor = `<objectPr><anchor moveWithCells="1"><from><xdr:col>${o.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${o.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></from><to><xdr:col>${o.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${o.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></to></anchor></objectPr>`;
            return `<mc:AlternateContent><mc:Choice Requires="x14"><oleObject progId="${o.progId ?? 'Acrobat Document'}" shapeId="${sid}" r:id="rIdO${k}">${anchor}</oleObject></mc:Choice><mc:Fallback><oleObject progId="${o.progId ?? 'Acrobat Document'}" shapeId="${sid}" r:id="rIdO${k}"/></mc:Fallback></mc:AlternateContent>`;
          })
          .join('') +
        '</oleObjects>';
    }
    zip.file(
      `xl/worksheets/sheet${n}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><sheetData>${sheetData}</sheetData>${merged}${hl}${oles}</worksheet>`,
    );
    if (rels.length)
      zip.file(`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
    wbSheets.push(`<sheet name="${esc(sh.name)}" sheetId="${n}" r:id="rId${n}"/>`);
    wbRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    overrides.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  });
  const k = spec.sheets.length + 1;
  wbRels.push(`<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  if (sst.length) wbRels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>`);
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${spec.date1904 ? ' date1904="1"' : ''}/><sheets>${wbSheets.join('')}</sheets></workbook>`,
  );
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="49"/></cellXfs></styleSheet>`,
  );
  if (sst.length)
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">${sst.map((s) => `<si>${s}</si>`).join('')}</sst>`);
  if (spec.macro) zip.file('xl/vbaProject.bin', 'not really');
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides.join('')}</Types>`,
  );
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  // 결정적 출력: 날짜 고정
  const date = new Date(Date.UTC(2026, 0, 1));
  zip.forEach((_p, f) => {
    f.date = date;
  });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

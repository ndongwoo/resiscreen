/**
 * 작은 XML 파서. OOXML 파트(시트·sharedStrings·rels 등)만 읽는다.
 * - DOMParser는 Web Worker와 Node에 없으므로 직접 구현한다.
 * - DTD·외부 엔티티를 해석하지 않는다(XXE 없음). 미리 정의된 5개 엔티티와 숫자 참조만 푼다.
 * - 태그 이름은 접두사를 뗀 로컬 이름으로 저장한다(x:c → c).
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** 이 요소 바로 안의 텍스트(자식 요소 사이 텍스트 포함, 이어 붙임) */
  text: string;
}

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITY[body] ?? m;
  });
}

function localName(qname: string): string {
  const i = qname.indexOf(':');
  return i < 0 ? qname : qname.slice(i + 1);
}

const ATTR_RE = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(src))) {
    const raw = m[3] ?? m[4] ?? '';
    const key = m[1]!;
    // 네임스페이스 접두 속성(r:id)은 원래 이름과 로컬 이름 둘 다로 접근할 수 있게 한다.
    const value = decodeEntities(raw);
    out[key] = value;
    const ln = localName(key);
    if (ln !== key && !(ln in out)) out[ln] = value;
  }
  return out;
}

export class XmlParseError extends Error {}

/** 문자열 전체를 트리로 만든다. 반환값은 가상의 루트(name '#document')다. */
export function parseXml(input: string): XmlElement {
  // XML 1.0 줄 끝 정규화: CRLF·CR → LF (문자 참조 &#13;는 그대로 남아 CR로 풀린다)
  const xml = input.indexOf('\r') >= 0 ? input.replace(/\r\n?/g, '\n') : input;
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1]!.text += decodeEntities(xml.slice(i));
      break;
    }
    if (lt > i) stack[stack.length - 1]!.text += decodeEntities(xml.slice(i, lt));
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new XmlParseError('처리 명령이 닫히지 않았습니다');
      i = end + 2;
    } else if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new XmlParseError('주석이 닫히지 않았습니다');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new XmlParseError('CDATA가 닫히지 않았습니다');
      stack[stack.length - 1]!.text += xml.slice(lt + 9, end);
      i = end + 3;
    } else if (xml.startsWith('<!', lt)) {
      // DOCTYPE 등: 해석하지 않고 건너뛴다(내부 서브셋의 '>'는 대괄호로 처리)
      let j = lt + 2;
      let depth = 0;
      for (; j < n; j++) {
        const ch = xml[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (xml[lt + 1] === '/') {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) throw new XmlParseError('닫는 태그가 끝나지 않았습니다');
      const name = localName(xml.slice(lt + 2, end).trim());
      const top = stack.pop();
      if (!top || top.name !== name || stack.length === 0) throw new XmlParseError(`태그 짝이 맞지 않습니다: ${name}`);
      i = end + 1;
    } else {
      // 시작 태그: 속성 값 안의 '>'를 고려해 끝을 찾는다
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const ch = xml[j]!;
        if (quote) {
          if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (j >= n) throw new XmlParseError('시작 태그가 끝나지 않았습니다');
      const selfClosing = xml[j - 1] === '/';
      const body = xml.slice(lt + 1, selfClosing ? j - 1 : j);
      const sp = body.search(/\s/);
      const qname = sp < 0 ? body : body.slice(0, sp);
      const el: XmlElement = {
        name: localName(qname),
        attrs: sp < 0 ? {} : parseAttrs(body.slice(sp)),
        children: [],
        text: '',
      };
      stack[stack.length - 1]!.children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length !== 1) throw new XmlParseError('닫히지 않은 태그가 있습니다');
  return root;
}

export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : [];
}

/** 깊이 우선으로 이름이 같은 모든 하위 요소 */
export function descendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}

/** 요소 아래 모든 텍스트(재귀) */
export function textContent(el: XmlElement): string {
  let s = el.text;
  for (const c of el.children) s += textContent(c);
  return s;
}

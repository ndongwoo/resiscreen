/** 웹 설정 일관성: CSP connect-src와 엔진의 허용 호스트가 같아야 한다 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_HOSTS } from '../../src/engine/biblio/client.ts';
import { ROOT } from '../helpers/load.ts';

describe('index.html', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '';
  it('CSP connect-src는 서지 API 두 곳뿐이고 엔진 허용 목록과 같다', () => {
    const connect = /connect-src ([^;]+)/.exec(csp)![1]!.trim().split(/\s+/);
    expect(connect.sort()).toEqual(ALLOWED_HOSTS.map((h) => `https://${h}`).sort());
  });
  it('외부 스크립트·인라인 스크립트를 허용하지 않는다', () => {
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\/(?!api\.crossref\.org|eutils\.ncbi\.nlm\.nih\.gov)/);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });
  it('필수 안내 문구가 있다', () => {
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('파일은 이 컴퓨터의 브라우저 안에서만 처리되며 외부로 전송되지 않습니다.');
    expect(text).toContain('논문 확인을 위해 논문 제목(DOI가 있으면 DOI)과 입력하신 연락처 이메일만 Crossref·PubMed에 보냅니다. 병원명, 저자·직원 이름, 환자 정보는 보내지 않습니다.');
    expect(text).toContain('이 결과는 참고용이며 공식 심사 결과가 아닙니다.');
  });
});

import { checkContact } from '../../src/web/contact.ts';

describe('연락처 이메일 검사', () => {
  it('정상 주소는 통과', () => {
    expect(checkContact(' entsoc@korl.or.kr ')).toEqual({ ok: true, email: 'entsoc@korl.or.kr' });
    expect(checkContact('ent.office+survey@korl.or.kr').ok).toBe(true);
  });
  it('빈칸·형식 오류·예시용 도메인은 거부', () => {
    for (const bad of ['', 'abc', 'a@b', 'a@b.c', 'a b@x.example', 'me@example.com', 'me@example.org', 'me@mail.example', 'me@test.com', 'me@foo.test', 'me@x.invalid', 'me@localhost']) {
      expect(checkContact(bad).ok, bad).toBe(false);
    }
  });
});

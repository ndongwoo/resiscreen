/** 연락처 이메일 검사(서지 조회용). 저장·전송 정책은 main.ts·worker.ts 참고 */

/** 명백한 가짜·예약 도메인 라벨(RFC 2606·6761) */
const FAKE_LABELS = new Set(['example', 'test', 'invalid', 'localhost', 'local']);

export type ContactCheck = { ok: true; email: string } | { ok: false; reason: string };

export function checkContact(raw: string): ContactCheck {
  const email = raw.trim();
  if (!email) return { ok: false, reason: '연락처 이메일을 입력하세요.' };
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email))
    return { ok: false, reason: '이메일 형식이 아닙니다.' };
  const labels = email.split('@')[1]!.toLowerCase().split('.');
  const tld = labels[labels.length - 1]!;
  if (!/^[a-z]{2,}$/.test(tld)) return { ok: false, reason: '도메인 끝(.kr, .com 등)을 확인하세요.' };
  if (labels.some((l) => FAKE_LABELS.has(l))) return { ok: false, reason: 'example·test 같은 예시용 도메인은 쓸 수 없습니다. 실제 연락처를 입력하세요.' };
  return { ok: true, email };
}

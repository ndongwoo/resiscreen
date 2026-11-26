/**
 * 엔진 실행용 Web Worker. 파일 내용은 이 Worker 안에서만 처리하고 어디에도 보내지 않는다.
 * 외부로 나가는 요청은 Crossref·PubMed 서지 조회(제목·DOI·연락처)뿐이다.
 */
import { checkWorkbookSession, recheckPapers, type CheckSession } from '../engine/index.ts';
import { reportToXlsx } from '../engine/export.ts';
import { BiblioClient } from '../engine/biblio/client.ts';
import { BiblioCache, IdbCache, MemoryCache, type CacheStore } from '../engine/biblio/cache.ts';
import type { BiblioSettings } from '../engine/biblio/types.ts';
import type { FetchLike } from '../engine/biblio/throttle.ts';
import { applyAliases, parseJournalListFile, type JournalList, type JournalLists } from '../engine/journals.ts';
import { resolveReference } from '../engine/rules.ts';
import { FORMULAS, LATEST, RULESETS } from './rulesets.ts';
import kciJson from '../../data/journals/kci.json';
import relatedJson from '../../data/journals/kci_related.json';
import aliasesJson from '../../data/journals/kci_aliases.json';
import type { FromWorker, ToWorker } from './protocol.ts';

// DOM 타입과 겹치지 않게 Worker 전역에서 쓰는 것만 정의
const scope = self as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const baseJournals: JournalLists = {
  kci: applyAliases(kciJson as unknown as JournalList, (aliasesJson as { aliases: Record<string, string[]> }).aliases),
  related: relatedJson as unknown as JournalList,
};

let store: CacheStore;
try {
  store = new IdbCache('resiscreen', 'biblio');
} catch {
  store = new MemoryCache(); // IndexedDB를 못 쓰는 환경(사생활 보호 모드 등)
}
let controller: AbortController | null = null;
// 다시 조회에 쓰는 마지막 점검 상태(이 Worker 메모리 안에만. 저장하지 않는다)
let last: { session: CheckSession; client: BiblioClient; journals: JournalLists } | null = null;

const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

scope.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    controller?.abort();
    return;
  }
  if (msg.type === 'clearCache') {
    try {
      await store.clear();
    } catch {
      /* 무시 */
    }
    post({ type: 'cacheCleared' });
    return;
  }
  if (msg.type === 'parseScie') {
    try {
      const list = await parseJournalListFile(new Uint8Array(msg.bytes), msg.fileName);
      post({ type: 'scie', list: { ...list, as_of: new Date().toISOString().slice(0, 10) } });
    } catch (e) {
      post({ type: 'scieError', message: (e as Error).message });
    }
    return;
  }
  if (msg.type === 'recheck') {
    if (!last) {
      post({ type: 'error', message: '다시 조회할 점검 결과가 없습니다. 파일을 다시 점검해 주세요.' });
      return;
    }
    controller = new AbortController();
    try {
      const report = await recheckPapers(last.session, msg.rows, { client: last.client, journals: last.journals, signal: controller.signal });
      const xlsx = await reportToXlsx(report);
      const buf = xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer;
      post({ type: 'result', report, xlsx: buf, recheck: true }, [buf]);
    } catch (e) {
      post({ type: 'error', message: (e as Error).message });
    } finally {
      controller = null;
    }
    return;
  }
  if (msg.type === 'check') {
    controller = new AbortController();
    last = null;
    try {
      const settings = LATEST.biblio as unknown as BiblioSettings;
      const biblio = msg.useBiblio
        ? new BiblioClient(
            ((url, init) => fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' })) as FetchLike,
            settings,
            new BiblioCache(store, settings.cache_ttl_days),
            resolveReference(LATEST).paper_year,
            msg.contact,
          )
        : null;
      const journals: JournalLists = { ...baseJournals, ...(msg.scie ? { scie: msg.scie } : {}) };
      const { report, session } = await checkWorkbookSession({
        bytes: new Uint8Array(msg.bytes),
        fileName: msg.fileName,
        rules: RULESETS,
        formulas: FORMULAS,
        biblio,
        journals,
        signal: controller.signal,
        appVersion: __APP_VERSION__,
        onProgress: (stage, detail, done, total) => post({ type: 'progress', stage, detail, done, total }),
      });
      if (session && biblio) last = { session, client: biblio, journals };
      const xlsx = await reportToXlsx(report);
      const buf = xlsx.buffer.slice(xlsx.byteOffset, xlsx.byteOffset + xlsx.byteLength) as ArrayBuffer;
      post({ type: 'result', report, xlsx: buf }, [buf]);
    } catch (e) {
      post({ type: 'error', message: (e as Error).message });
    } finally {
      controller = null;
    }
  }
};

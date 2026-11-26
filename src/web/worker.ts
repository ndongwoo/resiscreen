/**
 * 엔진 실행용 Web Worker. 파일 내용은 이 Worker 안에서만 처리하고 어디에도 보내지 않는다.
 * 외부로 나가는 요청은 Crossref·PubMed 서지 조회(제목·DOI·연락처)뿐이다.
 */
import { checkWorkbook } from '../engine/index.ts';
import { reportToXlsx } from '../engine/export.ts';
import { BiblioClient } from '../engine/biblio/client.ts';
import { BiblioCache, IdbCache, MemoryCache, type CacheStore } from '../engine/biblio/cache.ts';
import type { BiblioSettings } from '../engine/biblio/types.ts';
import type { FetchLike } from '../engine/biblio/throttle.ts';
import { applyAliases, parseJournalListFile, type JournalList, type JournalLists } from '../engine/journals.ts';
import type { FormFormulas, RuleSet } from '../engine/rules.ts';
import rulesJson from '../../rules/2026.json';
import formulasJson from '../../data/forms/2026_formulas.json';
import kciJson from '../../data/journals/kci.json';
import relatedJson from '../../data/journals/kci_related.json';
import aliasesJson from '../../data/journals/kci_aliases.json';
import type { FromWorker, ToWorker } from './protocol.ts';

// DOM 타입과 겹치지 않게 Worker 전역에서 쓰는 것만 정의
const scope = self as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const rules = rulesJson as unknown as RuleSet;
const formulas = formulasJson as unknown as FormFormulas;
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
  if (msg.type === 'check') {
    controller = new AbortController();
    try {
      const settings = rules.biblio as unknown as BiblioSettings;
      const biblio = msg.useBiblio
        ? new BiblioClient(((url, init) => fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer' })) as FetchLike, settings, new BiblioCache(store, settings.cache_ttl_days), rules.reference.paper_year, msg.contact)
        : null;
      const report = await checkWorkbook({
        bytes: new Uint8Array(msg.bytes),
        fileName: msg.fileName,
        rules,
        formulas,
        biblio,
        journals: { ...baseJournals, ...(msg.scie ? { scie: msg.scie } : {}) },
        signal: controller.signal,
        appVersion: __APP_VERSION__,
        onProgress: (stage, detail, done, total) => post({ type: 'progress', stage, detail, done, total }),
      });
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

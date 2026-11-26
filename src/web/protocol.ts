/** 화면(main)과 Web Worker 사이 메시지 */
import type { Report } from '../engine/report.ts';
import type { JournalList } from '../engine/journals.ts';

export type ToWorker =
  | { type: 'check'; bytes: ArrayBuffer; fileName: string; useBiblio: boolean; scie: JournalList | null; /** 서지 조회 연락처(요청 URL에만 쓰고 결과·캐시에는 넣지 않음) */ contact: string }
  | { type: 'cancel' }
  /** 논문 몇 편만 캐시를 무시하고 다시 조회(마지막 점검 결과에 반영) */
  | { type: 'recheck'; rows: number[] }
  | { type: 'clearCache' }
  | { type: 'parseScie'; bytes: ArrayBuffer; fileName: string };

export type Stage = 'read' | 'structure' | 'papers' | 'done';

export type FromWorker =
  | { type: 'progress'; stage: Stage; detail?: string; done?: number; total?: number }
  | { type: 'result'; report: Report; xlsx: ArrayBuffer; recheck?: boolean }
  | { type: 'error'; message: string }
  | { type: 'cacheCleared' }
  | { type: 'scie'; list: JournalList }
  | { type: 'scieError'; message: string };

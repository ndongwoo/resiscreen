/**
 * 화면 진입점. 엑셀 처리는 Web Worker에서 하고, 이 스크립트는 화면만 다룬다.
 * 브라우저 저장소(IndexedDB 'resiscreen')에는 서지 조회 캐시(biblio), SCIE 목록(journals),
 * 그리고 사용자가 '이 브라우저에 기억'을 켠 경우의 연락처 이메일(settings)만 둔다.
 * 연락처 이메일은 Worker로 넘겨 Crossref 요청 URL에만 쓰고 결과·캐시에는 넣지 않는다.
 */
import type { Level, Report } from '../engine/report.ts';
import type { JournalList } from '../engine/journals.ts';
import { IdbCache } from '../engine/biblio/cache.ts';
import { LATEST } from './rulesets.ts';
import { resolveReference } from '../engine/reference.ts';
import type { FromWorker, Stage, ToWorker } from './protocol.ts';
import { printableHtml, renderFindings, renderPapers, renderSummary, type RecheckHandler } from './ui.ts';
import { checkContact } from './contact.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const LARGE_MB = resolveReference(LATEST).large_file_mb;
const DEFAULT_CONTACT = String((LATEST.biblio as { mailto?: string } | undefined)?.mailto ?? '');

const fileInput = $<HTMLInputElement>('file');
const drop = $<HTMLLabelElement>('drop');
const fileName = $<HTMLSpanElement>('file-name');
const start = $<HTMLButtonElement>('start');
const useBiblio = $<HTMLInputElement>('use-biblio');
const cancel = $<HTMLButtonElement>('cancel');
const progressCard = $<HTMLElement>('progress-card');
const resultCard = $<HTMLElement>('result-card');
const bar = $<HTMLDivElement>('bar');
const paperCount = $<HTMLSpanElement>('paper-count');
const scieFile = $<HTMLInputElement>('scie-file');
const scieDelete = $<HTMLButtonElement>('scie-delete');
const scieStatus = $<HTMLParagraphElement>('scie-status');
const cacheStatus = $<HTMLSpanElement>('cache-status');
const contactBox = $<HTMLDivElement>('contact-box');
const contact = $<HTMLInputElement>('contact');
const rememberContact = $<HTMLInputElement>('remember-contact');
const contactDelete = $<HTMLButtonElement>('contact-delete');
const contactStatus = $<HTMLParagraphElement>('contact-status');
contact.placeholder = `예: ${DEFAULT_CONTACT}`;

let worker: Worker | null = null;
let picked: File | null = null;
let scie: JournalList | null = null;
let lastReport: Report | null = null;
let lastXlsx: ArrayBuffer | null = null;
let running = false;

let journalsStore: IdbCache | null = null;
let settingsStore: IdbCache | null = null;
try {
  journalsStore = new IdbCache('resiscreen', 'journals');
  settingsStore = new IdbCache('resiscreen', 'settings');
} catch {
  journalsStore = null;
  settingsStore = null;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<FromWorker>) => onWorker(ev.data);
    worker.onerror = (ev) => showError(`처리 중 오류가 났습니다: ${ev.message}`);
  }
  return worker;
}

function send(msg: ToWorker, transfer: Transferable[] = []) {
  getWorker().postMessage(msg, transfer);
}

// ---------- 시작 버튼 조건: 파일 선택 + (서지 조회를 끄거나 연락처가 올바름) ----------
function contactState() {
  return useBiblio.checked ? checkContact(contact.value) : ({ ok: true, email: '' } as const);
}
function updateStart() {
  const c = contactState();
  contactBox.classList.toggle('hidden', !useBiblio.checked);
  const touched = contact.value.trim() !== '';
  contact.setAttribute('aria-invalid', String(useBiblio.checked && touched && !c.ok));
  if (useBiblio.checked && !c.ok) {
    contactStatus.textContent = touched ? c.reason : '서지 조회를 쓰려면 연락처 이메일을 입력하세요. 서지 조회를 끄면 이메일 없이 점검할 수 있습니다.';
    contactStatus.className = touched ? 'status bad' : 'status';
  } else if (useBiblio.checked) {
    contactStatus.textContent = rememberContact.checked ? '이 브라우저에 기억합니다(아래 삭제 버튼으로 지울 수 있습니다).' : '저장하지 않습니다(이 화면을 닫으면 지워집니다).';
    contactStatus.className = 'status ok';
  }
  start.disabled = running || !picked || !c.ok;
}
useBiblio.addEventListener('change', updateStart);
contact.addEventListener('input', updateStart);
async function saveContactIfRemembered() {
  const c = checkContact(contact.value);
  if (!rememberContact.checked || !c.ok) return;
  try {
    await settingsStore?.set('contact', { t: Date.now(), v: c.email });
    contactDelete.classList.remove('hidden');
  } catch {
    /* 저장 실패는 무시 */
  }
}
rememberContact.addEventListener('change', async () => {
  if (rememberContact.checked) await saveContactIfRemembered();
  else await deleteSavedContact(false);
  updateStart();
});
async function deleteSavedContact(clearInput: boolean) {
  try {
    await settingsStore?.clear();
  } catch {
    /* 무시 */
  }
  contactDelete.classList.add('hidden');
  rememberContact.checked = false;
  if (clearInput) contact.value = '';
  updateStart();
}
contactDelete.addEventListener('click', () => deleteSavedContact(true));

// ---------- 파일 선택 ----------
function pick(f: File | undefined) {
  if (!f) return;
  picked = f;
  fileName.textContent = `${f.name} (${(f.size / 1048576).toFixed(1)}MB)`;
  updateStart();
}
fileInput.addEventListener('change', () => pick(fileInput.files?.[0]));
for (const ev of ['dragenter', 'dragover'] as const)
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
for (const ev of ['dragleave', 'drop'] as const) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  pick(e.dataTransfer?.files?.[0]);
});
// 창 아무 곳에나 떨어뜨려도 브라우저가 파일을 열지 않게
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ---------- 진행 ----------
const ORDER: Stage[] = ['read', 'structure', 'papers', 'done'];
function setStage(stage: Stage, done?: number, total?: number) {
  const idx = ORDER.indexOf(stage);
  document.querySelectorAll<HTMLLIElement>('#steps li').forEach((li, i) => {
    li.classList.toggle('done', i < idx || stage === 'done');
    li.classList.toggle('active', i === idx && stage !== 'done');
  });
  if (stage === 'papers' && total) paperCount.textContent = `${done ?? 0}/${total}`;
  const frac = stage === 'papers' && total ? 0.4 + 0.6 * ((done ?? 0) / total) : [0.1, 0.3, 0.4, 1][idx]!;
  bar.style.width = `${Math.round(frac * 100)}%`;
  cancel.classList.toggle('hidden', !(stage === 'papers' && useBiblio.checked && total));
}

start.addEventListener('click', async () => {
  const c = contactState();
  if (!picked || running || !c.ok) return;
  await saveContactIfRemembered();
  if (picked.size > LARGE_MB * 1048576 && !confirm(`파일이 ${(picked.size / 1048576).toFixed(0)}MB로 매우 큽니다(기준 ${LARGE_MB}MB). 처리에 시간이 걸리고 메모리를 많이 쓸 수 있습니다. 계속할까요?`)) return;
  running = true;
  start.disabled = true;
  resultCard.classList.add('hidden');
  progressCard.classList.remove('hidden');
  paperCount.textContent = '';
  cancel.disabled = false;
  cancel.textContent = '논문 조회 취소';
  setStage('read');
  let bytes: ArrayBuffer;
  try {
    bytes = await picked.arrayBuffer();
  } catch (e) {
    // 파일이 옮겨졌거나 지워졌거나 권한이 없을 때
    showError(`파일을 읽지 못했습니다. 파일을 다시 골라 주세요. (${(e as Error).message})`);
    return;
  }
  send({ type: 'check', bytes, fileName: picked.name, useBiblio: useBiblio.checked, scie, contact: c.email }, [bytes]);
});

cancel.addEventListener('click', () => {
  send({ type: 'cancel' });
  cancel.disabled = true;
  cancel.textContent = '취소하는 중…';
});

function showError(message: string) {
  running = false;
  updateStart();
  progressCard.classList.add('hidden');
  resultCard.classList.remove('hidden');
  const box = document.createElement('div');
  box.className = 'error-box';
  box.textContent = message;
  $('summary').replaceChildren(box);
  $('findings').replaceChildren();
}

// ---------- 결과 ----------
function shownLevels(): Set<Level> {
  return new Set([...document.querySelectorAll<HTMLInputElement>('#filters input:checked')].map((i) => i.value as Level));
}
let busyRow: number | null = null;
const recheck: RecheckHandler = {
  get enabled() {
    return !running;
  },
  get busyRow() {
    return busyRow;
  },
  onRecheck(row: number) {
    if (running || busyRow !== null) return;
    busyRow = row;
    renderResults();
    send({ type: 'recheck', rows: [row] });
  },
};
function renderResults() {
  if (!lastReport) return;
  renderSummary($('summary'), lastReport);
  renderPapers($('papers'), lastReport, recheck);
  renderFindings($('findings'), lastReport, shownLevels(), recheck);
}
$('filters').addEventListener('change', () => renderResults());

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
const stem = () => (lastReport?.file.name ?? '결과').replace(/\.[^.]+$/, '');
$('dl-xlsx').addEventListener('click', () => lastXlsx && download(`${stem()}.점검결과.xlsx`, lastXlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
$('dl-html').addEventListener('click', () => lastReport && download(`${stem()}.점검결과.html`, printableHtml(lastReport), 'text/html;charset=utf-8'));
$('print').addEventListener('click', () => window.print());

function onWorker(m: FromWorker) {
  switch (m.type) {
    case 'progress':
      setStage(m.stage, m.done, m.total);
      break;
    case 'result':
      running = false;
      updateStart();
      lastReport = m.report;
      lastXlsx = m.xlsx;
      busyRow = null;
      if (!m.recheck) {
        setStage('done');
        cancel.classList.add('hidden');
        resultCard.classList.remove('hidden');
      }
      renderResults();
      if (!m.recheck) resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    case 'error':
      if (busyRow !== null) {
        // 다시 조회 실패: 기존 결과는 그대로 두고 알린다
        busyRow = null;
        renderResults();
        cacheStatus.textContent = `다시 조회하지 못했습니다: ${m.message}`;
        break;
      }
      showError(`처리 중 오류가 났습니다: ${m.message}`);
      break;
    case 'cacheCleared':
      cacheStatus.textContent = '서지 조회 캐시를 지웠습니다.';
      break;
    case 'scie':
      scie = m.list;
      void journalsStore?.set('scie', { t: Date.now(), v: m.list }).catch(() => undefined);
      showScie();
      break;
    case 'scieError':
      scieStatus.textContent = `목록을 읽지 못했습니다: ${m.message}`;
      scieStatus.classList.remove('ok');
      break;
  }
}

// ---------- SCIE 목록 ----------
function showScie() {
  if (scie) {
    scieStatus.textContent = `불러온 목록: ${scie.source} · ${scie.journals.length.toLocaleString()}종 · ${scie.as_of} 저장 (이 브라우저에 저장되어 있습니다. 공용 PC라면 사용 후 삭제하세요)`;
    scieStatus.classList.add('ok');
    scieDelete.disabled = false;
  } else {
    scieStatus.textContent = '불러온 목록 없음 (SCI/SCIE 기재 논문의 등재 확인을 건너뜁니다)';
    scieStatus.classList.remove('ok');
    scieDelete.disabled = true;
  }
}
scieFile.addEventListener('change', async () => {
  const f = scieFile.files?.[0];
  if (!f) return;
  scieStatus.textContent = '목록을 읽는 중…';
  const bytes = await f.arrayBuffer();
  send({ type: 'parseScie', bytes, fileName: f.name }, [bytes]);
  scieFile.value = '';
});
scieDelete.addEventListener('click', async () => {
  scie = null;
  try {
    await journalsStore?.clear();
  } catch {
    /* 무시 */
  }
  showScie();
});
$('clear-cache').addEventListener('click', () => {
  cacheStatus.textContent = '지우는 중…';
  send({ type: 'clearCache' });
});

// 저장된 연락처(기억을 켠 경우만) 불러오기
(async () => {
  try {
    const saved = await settingsStore?.get('contact');
    if (typeof saved?.v === 'string') {
      contact.value = saved.v;
      rememberContact.checked = true;
      contactDelete.classList.remove('hidden');
    }
  } catch {
    /* 저장소를 못 쓰면 빈칸으로 시작 */
  }
  updateStart();
})();

// 저장된 SCIE 목록 불러오기
(async () => {
  try {
    const saved = await journalsStore?.get('scie');
    if (saved?.v) scie = saved.v as JournalList;
  } catch {
    /* 저장소를 못 쓰면 목록 없이 동작 */
  }
  showScie();
})();

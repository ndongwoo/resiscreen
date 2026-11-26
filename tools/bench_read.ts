/**
 * 엑셀 읽기 방식 비교: 직접 XML 파서(JSZip) vs ExcelJS.
 *   node dist-node/tools/bench_read.js <direct|exceljs> <파일.xlsx>
 * 한 번에 한 방식만 재서 메모리가 섞이지 않게 한다(파일마다 새 프로세스로 실행).
 */
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { loadWorkbook } from '../src/engine/xlsx/workbook.ts';

const [mode, file] = process.argv.slice(2);
if (!mode || !file) {
  console.error('사용법: bench_read <direct|exceljs> <파일>');
  process.exit(2);
}
const bytes = new Uint8Array(readFileSync(file));
let peak = 0;
const timer = setInterval(() => {
  peak = Math.max(peak, process.memoryUsage().rss);
}, 5);
const t0 = performance.now();
let cells = 0;
let oleAnchors = 0;
if (mode === 'direct') {
  const wb = await loadWorkbook(bytes);
  for (const s of wb.sheets) {
    cells += s.cells.size;
    oleAnchors += s.embedded.filter((e) => e.row !== undefined).length;
  }
} else {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, () => {
        cells++;
      });
    });
  });
  oleAnchors = -1; // ExcelJS는 oleObject 앵커를 제공하지 않는다
}
const ms = performance.now() - t0;
peak = Math.max(peak, process.memoryUsage().rss);
clearInterval(timer);
console.log(JSON.stringify({ mode, file: file.split('/').pop(), sizeMB: +(bytes.length / 1048576).toFixed(1), ms: Math.round(ms), peakRssMB: Math.round(peak / 1048576), cells, oleAnchors }));

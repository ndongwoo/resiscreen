/**
 * CI 금지 파일 검사: git이 추적하는 .xlsx/.xlsm/.xls가 tests/fixtures/synthetic/ 밖에 있으면 실패.
 *   node dist-node/tools/check_fixture_paths.js
 */
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const bad = tracked.filter((p) => /\.(xlsx|xlsm|xls|xlsb)$/i.test(p) && !p.startsWith('tests/fixtures/synthetic/'));
const privateTracked = tracked.filter((p) => p.startsWith('tests/fixtures/private/'));
if (bad.length || privateTracked.length) {
  console.error('공개 저장소에 올리면 안 되는 파일이 추적되고 있습니다:');
  for (const p of new Set([...bad, ...privateTracked])) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`엑셀 파일 위치 검사 통과(추적 파일 ${tracked.length}개)`);

import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';

/** 앱 버전 = git 커밋(커밋 안 된 변경이 있으면 -dirty). 결과 화면·엑셀·인쇄용 HTML에 표시한다 */
function appVersion(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return process.env['GITHUB_SHA']?.slice(0, 8) ?? 'unknown';
  }
}

// GitHub Pages(https://<계정>.github.io/<저장소>/)에서 하위 경로로 열리므로 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  build: {
    outDir: 'dist',
    target: ['chrome100', 'edge100'],
    // 런타임 외부 스크립트 없음: 모든 라이브러리를 번들한다
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  worker: { format: 'es' },
});

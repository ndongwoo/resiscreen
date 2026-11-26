/** Node용 서지 캐시: JSON 파일 하나(공개 서지 정보만). 프로세스 끝에 flush()로 저장 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CacheStore } from '../engine/biblio/cache.ts';

export class FileCache implements CacheStore {
  private data: Record<string, { t: number; v: unknown }> = {};
  private dirty = false;
  constructor(private readonly path: string) {
    if (existsSync(path)) {
      try {
        this.data = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        this.data = {};
      }
    }
  }
  async get(key: string) {
    return this.data[key];
  }
  async set(key: string, e: { t: number; v: unknown }) {
    this.data[key] = e;
    this.dirty = true;
  }
  async clear() {
    this.data = {};
    this.dirty = true;
  }
  flush(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data));
    this.dirty = false;
  }
}

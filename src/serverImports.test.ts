import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Vercel runs the api/ functions as plain Node ES modules, file by file: every relative value
// import reachable from api/ must name its file ("./splitter.js", "../types/index.js").
// Vite and Vitest resolve "./splitter" fine, so without this test the error only shows in
// production (ERR_UNSUPPORTED_DIR_IMPORT / ERR_MODULE_NOT_FOUND).
const ROOT = resolve(__dirname, '..');

function apiEntryPoints(dir = join(ROOT, 'api')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? apiEntryPoints(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);
}

// Relative imports that survive compilation (type-only imports are erased)
function valueImports(source: string): string[] {
  const specs: string[] = [];
  const re = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) specs.push(m[1]);
  return specs;
}

describe('imports chargés par les fonctions serveur (api/)', () => {
  it('nomment tous leur fichier .js', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const queue = apiEntryPoints();
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const spec of valueImports(readFileSync(file, 'utf8'))) {
        if (!spec.endsWith('.js') && !spec.endsWith('.json')) {
          problems.push(`${file.replace(ROOT, '')} → '${spec}'`);
          continue;
        }
        const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
        if (spec.endsWith('.js') && !existsSync(target)) problems.push(`${file.replace(ROOT, '')} → '${spec}' introuvable`);
        else if (spec.endsWith('.js')) queue.push(target);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  });
});

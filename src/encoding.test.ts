import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards against files re-saved with the wrong encoding ("MaÃ¢rif" instead of "Maârif").
const ROOTS = ['src', 'api', 'scripts'];
const MOJIBAKE = /Ã[\u0080-¿]|Â[ -¿]|â€/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    // These two files contain broken text on purpose (examples and repair table).
    const isAllowed = entry.name === 'encoding.test.ts' || entry.name === 'repair-encoding.ts';
    return /\.(ts|tsx|css|html)$/.test(entry.name) && !isAllowed ? [path] : [];
  });
}

describe('encodage des fichiers source', () => {
  it('aucun accent cassé', () => {
    const broken = ROOTS.flatMap(sourceFiles).filter(file => MOJIBAKE.test(readFileSync(file, 'utf8')));
    expect(broken).toEqual([]);
  });
});

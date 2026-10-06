import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

/**
 * Menegakkan arsitektur berlapis:
 *   routes -> middleware/controllers -> services -> models -> database
 * Lapisan atas boleh memakai lapisan bawah, TIDAK sebaliknya, dan hanya models/ yang menyentuh Knex/SQL.
 */
const SRC = path.resolve('src');
const files = (dir: string): string[] =>
  fs.readdirSync(path.join(SRC, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => path.join(e.parentPath, e.name));

/** Daftar modul yang diimpor sebuah file (spesifier mentah), dipisah antara import biasa dan `import type`. */
function imports(file: string): Array<{ spec: string; typeOnly: boolean }> {
  const src = fs.readFileSync(file, 'utf8');
  const out: Array<{ spec: string; typeOnly: boolean }> = [];
  for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm)) out.push({ spec: m[2]!, typeOnly: !!m[1] });
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push({ spec: m[1]!, typeOnly: false });
  return out;
}
const layerOf = (file: string) => path.relative(SRC, file).split(path.sep)[0]!;
/** Layer dari sebuah import relatif (mis. '../models/x.js' dari controllers/ => 'models'). */
function targetLayer(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  return path.relative(SRC, path.resolve(path.dirname(file), spec)).split(path.sep)[0] ?? null;
}

const RULES: Record<string, { may: string[]; why: string }> = {
  routes:      { may: ['controllers', 'middleware', 'core', 'config', 'types', 'utils', 'security'], why: 'routes hanya merakit URL -> middleware -> controller' },
  controllers: { may: ['core', 'validators', 'utils', 'types', 'config', 'services', 'security'], why: 'controller tipis: validasi input, panggil service, bentuk respons' },
  middleware:  { may: ['core', 'security', 'utils', 'config', 'types', 'services', 'validators'], why: 'middleware tidak boleh menyentuh models/SQL langsung' },
  services:    { may: ['models', 'validators', 'security', 'utils', 'config', 'types', 'graphql', 'database'], why: 'service = logika bisnis; tidak tahu HTTP (routes/controllers/middleware)' },
  graphql:     { may: ['services', 'validators', 'security', 'utils', 'config', 'types'], why: 'resolver GraphQL memakai service yang sama dengan REST' },
  validators:  { may: ['security', 'utils', 'config', 'types'], why: 'validator murni: tanpa akses data' },
  models:      { may: ['database', 'utils', 'types', 'config', 'security', 'validators'], why: 'model tidak boleh bergantung ke lapisan di atasnya' },
  security:    { may: ['utils', 'types', 'config'], why: 'primitif keamanan berdiri sendiri' },
  utils:       { may: ['config', 'types'], why: 'util murni' },
  database:    { may: ['config', 'utils', 'types'], why: 'infrastruktur database' },
};

describe('Arsitektur berlapis', () => {
  for (const [layer, rule] of Object.entries(RULES)) {
    test(`${layer}/: hanya boleh bergantung ke [${rule.may.join(', ')}] (${rule.why})`, () => {
      const bad: string[] = [];
      for (const f of files(layer)) {
        for (const { spec, typeOnly } of imports(f)) {
          const t = targetLayer(f, spec);
          if (t && t !== layer && !rule.may.includes(t) && !(typeOnly && ['core', 'types'].includes(t))) {
            bad.push(`${path.relative(SRC, f)} -> ${spec}`);
          }
        }
      }
      assert.deepEqual(bad, [], `pelanggaran lapisan:\n${bad.join('\n')}`);
    });
  }

  test('hanya models/, database/ (dan type-import) yang mengimpor Knex; tidak ada SQL mentah di luar models/', () => {
    const bad: string[] = [];
    for (const f of files('.')) {
      const layer = layerOf(f);
      const rel = path.relative(SRC, f);
      const knexValueImport = imports(f).some((i) => i.spec === 'knex' && !i.typeOnly);
      if (knexValueImport && !['models', 'database'].includes(layer)) bad.push(`${rel}: import knex`);
      const src = fs.readFileSync(f, 'utf8');
      if (!['models', 'database'].includes(layer) && /\b(whereRaw|\.raw\(|schema\.(create|alter|drop)Table)/.test(src)) bad.push(`${rel}: SQL/DDL di luar models`);
    }
    assert.deepEqual(bad, []);
  });

  test('controller tidak mengakses models maupun database; service tidak mengimpor Fastify', () => {
    const bad: string[] = [];
    for (const f of files('controllers')) if (/ctx\.(models|db)\b/.test(fs.readFileSync(f, 'utf8'))) bad.push(`${path.relative(SRC, f)}: akses models/db langsung`);
    for (const f of [...files('services'), ...files('models')]) {
      if (imports(f).some((i) => i.spec === 'fastify' || i.spec.startsWith('@fastify/'))) bad.push(`${path.relative(SRC, f)}: bergantung ke Fastify`);
    }
    assert.deepEqual(bad, []);
  });

  test('setiap controller punya route, dan setiap route file terdaftar di routes/index.ts', () => {
    const idx = fs.readFileSync(path.join(SRC, 'routes/index.ts'), 'utf8');
    for (const f of files('routes').filter((x) => x.endsWith('.routes.ts'))) {
      const fn = path.basename(f).replace('.routes.ts', '').replace(/-(\w)/g, (_m, c) => c.toUpperCase()) + 'Routes';
      assert.match(idx, new RegExp(`\\b${fn}\\(`), `${path.basename(f)} belum didaftarkan di routes/index.ts`);
    }
    const cidx = fs.readFileSync(path.join(SRC, 'controllers/index.ts'), 'utf8');
    for (const f of files('controllers').filter((x) => x.endsWith('.controller.ts'))) {
      const cls = fs.readFileSync(f, 'utf8').match(/export class (\w+)/)![1]!;
      assert.match(cidx, new RegExp(`new ${cls}\\(`), `${cls} belum dibuat di controllers/index.ts`);
    }
  });

  test('semua endpoint administrasi dilindungi middleware otorisasi (preHandler)', () => {
    const open: string[] = [];
    for (const f of files('routes').filter((x) => /(user|role|token|content-type|audit)\.routes\.ts$/.test(x))) {
      for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
        if (/app\.(get|post|put|patch|delete)\('\/api\/admin/.test(line) && !/guard|manage|preHandler/.test(line)) open.push(`${path.basename(f)}: ${line.trim()}`);
      }
    }
    assert.deepEqual(open, []);
  });
});

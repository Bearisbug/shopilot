#!/usr/bin/env node
// 漂移检测：上游快照 brand/upstream/quilt-ds-v5/contract-tokens.json 与 brand/tokens.resolved.json 按对应表逐项比对，不一致时非零退出。
// 只读 brand/ 内的文件：node brand/qa/check-upstream.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const brand = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = JSON.parse(fs.readFileSync(path.join(brand, 'upstream/quilt-ds-v5/contract-tokens.json'), 'utf8'));
const resolved = JSON.parse(fs.readFileSync(path.join(brand, 'tokens.resolved.json'), 'utf8'));
const leaf = p => p.split('.').reduce((n, k) => n?.[k], resolved)?.$value;
const MAP = {
  'colors.primary': 'semantic.color.action.primary',
  'colors.onPrimary': 'semantic.color.text.onAction',
  'colors.primaryContainer': 'semantic.color.surface.selected',
  'colors.onPrimaryContainer': 'semantic.color.text.link',
  'colors.secondary': 'semantic.color.surface.inverse',
  'colors.onSecondary': 'semantic.color.text.onInverse',
  'colors.secondaryContainer': 'semantic.color.surface.neutral',
  'colors.tertiary': 'semantic.color.surface.decorative',
  'colors.tertiaryContainer': 'semantic.color.surface.warm',
  'colors.background': 'semantic.color.surface.background',
  'colors.surface': 'semantic.color.surface.raised',
  'colors.surfaceVariant': 'semantic.color.surface.sunken',
  'colors.onSurface': 'semantic.color.text.primary',
  'colors.onBackground': 'semantic.color.text.primary',
  'colors.onSurfaceVariant': 'semantic.color.text.secondary',
  'colors.outline': 'semantic.color.border.control',
  'colors.outlineVariant': 'semantic.color.border.subtle',
  'colors.error': 'semantic.color.feedback.error',
  'colors.success': 'semantic.color.feedback.success',
  'colors.warning': 'semantic.color.feedback.warning',
  'radius.sm': 'semantic.radius.sm',
  'radius.md': 'semantic.radius.md',
  'radius.lg': 'semantic.radius.lg'
};
const norm = v => String(typeof v === 'number' ? `${v}px` : v).toUpperCase();
let bad = 0;
for (const [src, dst] of Object.entries(MAP)) {
  const a = src.split('.').reduce((n, k) => n?.[k], upstream);
  const b = leaf(dst);
  if (norm(a) !== norm(b)) { bad++; console.log(`DRIFT ${src}=${a} vs ${dst}=${b}`); }
}
console.log(bad ? `${bad} drift(s)` : `ok: ${Object.keys(MAP).length} fields match upstream quilt-ds-v5`);
process.exit(bad ? 1 : 0);

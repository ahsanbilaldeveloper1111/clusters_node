#!/usr/bin/env tsx
/**
 * Optional: write generated OpenAPI JSON to disk for review / CI artifacts.
 * Usage: npm run openapi:generate -w backend
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildOpenApiDocument } from './document.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'openapi.generated.json');
const doc = buildOpenApiDocument();
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${out}`);

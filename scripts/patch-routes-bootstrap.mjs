#!/usr/bin/env node
/**
 * Patch every API route handler under src/app/api to call `ensureDbSchema()`
 * before its first DB query. Idempotent: skips routes already patched.
 *
 * Strategy:
 * - For each route.ts file under src/app/api/**, find every exported async
 *   function (GET, POST, PUT, PATCH, DELETE) that has a `try {` block.
 * - Insert `await ensureDbSchema();` as the FIRST statement inside `try {`.
 * - Skip if `ensureDbSchema` is already imported in the file.
 * - Add the import at the top of the file (after the existing imports) on
 *   first patch.
 *
 * Run: node /home/z/my-project/scripts/patch-routes-bootstrap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/home/z/my-project/src/app/api';
const IMPORT_LINE = "import { ensureDbSchema } from '@/lib/db-bootstrap';";

// Find all route.ts files under src/app/api
const files = execSync(`find ${ROOT} -name route.ts`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

let patchedCount = 0;
let skippedCount = 0;
let alreadyDoneCount = 0;

for (const file of files) {
  const orig = readFileSync(file, 'utf8');
  let src = orig;
  let fileChanged = false;
  let alreadyPatchedInFile = false;

  // Check if already patched (has the import)
  if (src.includes("ensureDbSchema")) {
    alreadyPatchedInFile = true;
  }

  if (!alreadyPatchedInFile) {
    // Add import after the last `import ... from '...'` line near the top
    const lines = src.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      if (/^import\s+.*from\s+['"]/.test(lines[i])) {
        lastImportIdx = i;
      }
    }
    if (lastImportIdx === -1) {
      // No imports found; insert at top
      lines.unshift(IMPORT_LINE);
    } else {
      lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    }
    src = lines.join('\n');
    fileChanged = true;
  }

  // For each exported handler, insert `await ensureDbSchema();` after the
  // first `try {` line that follows an `export async function`.
  // Match patterns like:
  //   export async function GET(request: NextRequest) {
  //     try {
  //       <existing first line>
  // We insert before the existing first line.
  //
  // Use a regex that captures `export async function NAME(...) {` then a
  // newline, optional whitespace, `try {`, newline, optional whitespace,
  // and the next line. Insert `await ensureDbSchema();` between try { and
  // the next line.
  //
  // Skip if the function body already contains ensureDbSchema.
  const handlerRegex =
    /(export async function (?:GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*\{[\s\S]*?try\s*\{\n)(\s*)(?!await ensureDbSchema)/g;

  src = src.replace(handlerRegex, (match, prefix, indent) => {
    // Check if ensureDbSchema already appears in the function body
    // (we're inside the function up to try {; need to check what follows)
    return `${prefix}${indent}await ensureDbSchema();\n${indent}`;
  });

  // The above regex is tricky because of negative lookahead. Simpler approach:
  // do a line-based scan.
  if (src === orig && !alreadyPatchedInFile) {
    // No changes via regex; do line-based
  }

  // Line-based approach (more reliable):
  if (!alreadyPatchedInFile) {
    const lines = src.split('\n');
    const out = [];
    let inHandler = false;
    let handlerName = '';
    let pendingTryInsert = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect start of a handler
      const handlerStart = line.match(
        /^export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/
      );
      if (handlerStart) {
        inHandler = true;
        handlerName = handlerStart[1];
        out.push(line);
        continue;
      }

      // Detect `try {` inside the handler
      if (inHandler && /^\s*try\s*\{\s*$/.test(line)) {
        out.push(line);
        // Look ahead: is the next non-blank line already `await ensureDbSchema()`?
        let nextIdx = i + 1;
        while (nextIdx < lines.length && lines[nextIdx].trim() === '') {
          out.push(lines[nextIdx]);
          nextIdx++;
        }
        if (nextIdx < lines.length) {
          const nextLine = lines[nextIdx];
          if (/^\s*await\s+ensureDbSchema\s*\(/.test(nextLine)) {
            // Already has the call; don't insert
            out.push(nextLine);
            i = nextIdx;
          } else {
            // Insert before nextLine, matching its indentation
            const indentMatch = nextLine.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '  ';
            out.push(`${indent}await ensureDbSchema();`);
            out.push(nextLine);
            i = nextIdx;
            fileChanged = true;
          }
        }
        // Reset handler flag — assume try block covers the handler body
        inHandler = false;
        continue;
      }

      out.push(line);
    }

    src = out.join('\n');
  }

  if (src !== orig) {
    writeFileSync(file, src, 'utf8');
    patchedCount++;
    console.log(`✓ patched: ${file}`);
  } else if (alreadyPatchedInFile) {
    alreadyDoneCount++;
    console.log(`• already patched: ${file}`);
  } else {
    skippedCount++;
    console.log(`- skipped (no try block): ${file}`);
  }
}

console.log(`\nSummary: ${patchedCount} patched, ${alreadyDoneCount} already done, ${skippedCount} skipped`);

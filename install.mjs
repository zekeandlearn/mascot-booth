#!/usr/bin/env node
// Installs the Mascot Booth skill for Claude Code (~/.claude/skills) and Codex (~/.codex/skills, when Codex is present),
// pointing it at this folder. Run `npm install` here first. Options: --dest <skills dir> (install only there).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--dest');
const dests = i > 0 ? [path.resolve(process.argv[i + 1])] : [path.join(os.homedir(), '.claude/skills'), ...(fs.existsSync(path.join(os.homedir(), '.codex')) ? [path.join(os.homedir(), '.codex/skills')] : [])];

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  console.log('installing dependencies (npm install)…');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
}
const skill = fs.readFileSync(path.join(ROOT, 'skills/mascot-booth/SKILL.md'), 'utf8').replaceAll('<cs>', ROOT);
for (const d of dests) {
  const dir = path.join(d, 'mascot-booth');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skill);
  console.log('installed skill ->', dir);
}
execSync(`node "${path.join(ROOT, 'bin/mascot-booth.mjs')}" doctor`, { stdio: 'inherit' });
console.log('\nRestart Claude Code / Codex, then say: "use Mascot Booth to make a talking explainer about <topic>"');

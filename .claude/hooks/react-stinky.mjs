// Stop hook: gates the end of a turn on a react-stinky smell-check of the
// React source files the turn touched.
//
// Unlike its react-doctor sibling this hook runs no scanner of its own —
// react-stinky is a prompt-based skill with no CLI, so there is nothing to
// execute and no findings to paste in. All the hook can do is refuse to let
// the turn end and hand the agent the file list plus the skill's own entry
// requirements. A Stop hook has no `additionalContext` channel (that belongs
// to PostToolUse / UserPromptSubmit / SessionStart), so blocking is the only
// way to reach the model at all: exiting 0 with output on stdout would show
// the human a note the agent never sees.
//
// There is deliberately no off switch. To stop the gate, delete the `Stop`
// entry that points at this file in .claude/settings.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// A whole-repo diff can exceed spawnSync's 1 MiB default.
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

// Past this many files a per-file File scan is the wrong scope mode, so the
// message names the remainder and redirects to a Folder scan rather than
// silently truncating the list.
const MAX_LISTED_FILES = 15;

const EXCLUDED = /(^|\/)(node_modules|dist|\.output)\/|\.(test|spec|stories)\.[^/]+$|\.gen\.ts$/;

const readFileOrEmpty = (source) => {
  try {
    return readFileSync(source, 'utf8');
  } catch {
    return '';
  }
};

// Components and JSX always count. A plain .ts file counts only where React
// logic actually lives — a `use-*.ts` hook anywhere, or anything under a
// `hooks/` or `lib/` directory — so that editing a type or a config file
// doesn't drag the whole gate in behind it.
const isReactSource = (path) => {
  if (/\.(tsx|jsx)$/.test(path)) return true;
  if (!path.endsWith('.ts')) return false;
  return /(^|\/)use-[^/]+\.ts$/.test(path) || /(^|\/)(hooks|lib)\//.test(path);
};

// A missing git, a repo with no commits, or any other non-zero exit yields
// null: the caller then bails silently. A hook must never crash the agent
// loop with a stack trace.
const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: SPAWN_MAX_BUFFER_BYTES });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? '';
};

// Everything uncommitted, tracked edits plus new files. Staged-only would be
// empty almost every turn (agents don't `git add`), and a merge-base diff
// would re-flag files that were reviewed several turns ago.
const changedReactFiles = () => {
  const tracked = git(['diff', '--name-only', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (tracked === null || untracked === null) return null;

  const paths = `${tracked}\n${untracked}`
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set(paths)]
    .filter((path) => isReactSource(path) && !EXCLUDED.test(path))
    .sort();
};

// Hashes content, not the file list: an edit made after a review can
// introduce a smell the review never saw, so a changed byte re-arms the gate.
// Full file contents cover untracked files, which have no diff to read.
const fingerprint = (files) => {
  const hash = createHash('sha256');
  hash.update(git(['diff', 'HEAD', '--', ...files]) ?? '');
  for (const file of files) {
    hash.update(`\0${file}\0`);
    hash.update(readFileOrEmpty(file));
  }
  return hash.digest('hex');
};

const statePath = (projectRoot) => {
  const key = createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
  return join(tmpdir(), `react-stinky-stop-hook-${key}.txt`);
};

const buildReason = (files) => {
  const listed = files.slice(0, MAX_LISTED_FILES);
  const dropped = files.length - listed.length;
  const fileLines = listed.map((file) => `- ${file}`);

  if (dropped > 0) {
    fileLines.push(
      `- ...and ${dropped} more changed file(s), not listed. That is past the point where a per-file scan makes sense — use the react-stinky Folder scan scope over the directories involved instead.`,
    );
  }

  return [
    'React source files changed this turn have not been smell-checked yet. Run the react-stinky skill over them before finishing.',
    '',
    ...fileLines,
    '',
    '1. Read .claude/skills/react-stinky/references/catalog.md first. The skill requires it before any scan — the detection signals, fixes, and documented exceptions live there, not in SKILL.md.',
    '2. Use the File scan scope mode: read each file above in full and check every component, hook, prop interface, and exported function. A fragment sniff is not sufficient. Single-file scope cannot see cross-file duplication, so say so rather than implying the code is unique.',
    '3. Fix the smells you find.',
    '4. For a confirmed smell you cannot fix now, open a GitHub issue with `gh issue create` (conventions in docs/agents/issue-tracker.md) recording the catalog rule, file:line, the impact, and the proposed fix.',
    '',
    'If a finding is a documented exception or already resolved, say which and move on. Report what you checked and what you changed, then stop.',
  ].join('\n');
};

const main = () => {
  let input;
  try {
    input = JSON.parse(readFileOrEmpty(0) || '{}');
  } catch {
    input = {};
  }

  // The turn is already continuing because a stop hook blocked it. Blocking
  // again is how a Stop hook loops forever.
  if (input.stop_hook_active === true) {
    process.exit(0);
  }

  const projectRoot = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '../..');

  try {
    process.chdir(projectRoot);
  } catch {
    process.exit(0);
  }

  // Nothing to demand if the skill isn't installed.
  if (!existsSync(join(projectRoot, '.claude', 'skills', 'react-stinky', 'SKILL.md'))) {
    process.exit(0);
  }

  const files = changedReactFiles();
  if (!files || files.length === 0) {
    process.exit(0);
  }

  const current = fingerprint(files);
  const state = statePath(projectRoot);
  if (readFileOrEmpty(state).trim() === current) {
    process.exit(0);
  }

  // Recorded before the block, because the hook exits here — an agent that
  // ignores the instruction is not re-nagged until the diff changes again.
  // The stop_hook_active guard above already caps this at one block per turn.
  try {
    writeFileSync(state, current);
  } catch {}

  console.log(JSON.stringify({ decision: 'block', reason: buildReason(files) }));
};

main();

// Plan versions: every change to a plan, by hand or by a coding agent, is one line in <slug>.plan.versions.jsonl next to
// the plan, committed with it. A line holds the whole plan at that version (so any version can be rebuilt), who changed
// it and through what, the intent, the prompt that asked for it, the session it happened in, and what changed, in words.
//
//   bun history.mjs backfill <plan.json>        versions from git history, each mapped to the Claude Code session and
//                                               prompt that produced it (from ~/.claude/projects transcripts)
//   bun history.mjs list <plan.json>            one line per version
//   bun history.mjs at <plan.json> <v>          that version's plan JSON on stdout (pipe to a file, then `just plan` it)
//   bun history.mjs diff <plan.json> <a> <b>    what changed between two versions, in words
//   bun history.mjs resummarize <plan.json>     recompute every version's `changes` after the summariser improves
//
// Recording happens in build.mjs: a build whose plan differs from the last version appends one. Where the facts come from:
//   PLAN_VIA        manual | claude-code | pi | …       (the Claude Code hook sets it; default manual)
//   PLAN_BY         a person or agent id                (default: git user.name)
//   PLAN_INTENT     one sentence: why this change       (`just plan FILE "intent"`; or the plan's own "change": {"intent"})
//   PLAN_PROMPT     the prompt that asked for it        (the Claude Code hook remembers the last one per session)
//   PLAN_SESSION    the agent session id; PLAN_TRANSCRIPT the transcript path
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

export const versionsPath = (planPath) => planPath.replace(/\.plan\.json$|\.json$/, '') + '.plan.versions.jsonl';
// The hash covers the plan only; `change` is the note about an edit, not part of the plan.
const canonical = (plan) => { const { change, ...rest } = plan ?? {}; return JSON.stringify(rest); };
export const hashOf = (plan) => 'sha256:' + createHash('sha256').update(canonical(plan)).digest('hex').slice(0, 16);

export function load(planPath) {
  const p = versionsPath(planPath);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
const short = (s, n = 60) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const checks = (ph) => [...(ph?.verify?.automated ?? []), ...(ph?.verify?.manual ?? [])];

// What changed between two plans, as sentences a reviewer reads. Not a JSON diff: names, states and counts.
export function summarize(prev, next) {
  if (!prev) return [`created: "${short(next.title)}", ${next.phases?.length ?? 0} phases, ${next.decisions?.length ?? 0} decisions`];
  const out = [];
  if (prev.status !== next.status) out.push(`status ${prev.status} → ${next.status}`);
  if (prev.title !== next.title) out.push(`title → "${short(next.title)}"`);
  for (const k of ['summary', 'current', 'endState', 'approach']) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out.push(`${k} rewritten (${words(prev[k])} → ${words(next[k])} words)`);
  }
  for (const k of ['discoveries', 'notDoing', 'references']) {
    const a = prev[k] ?? [], b = next[k] ?? [];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(a.length === b.length ? `${k} edited (${b.length} items)` : `${k}: ${a.length} → ${b.length} items`);
  }
  const byId = (xs) => new Map((xs ?? []).map((x) => [x.id, x]));
  const pd = byId(prev.decisions), nd = byId(next.decisions);
  for (const [id, d] of nd) {
    const o = pd.get(id);
    if (!o) { out.push(`decision ${id} added: "${short(d.question)}"`); continue; }
    if (o.chosen !== d.chosen && d.chosen) out.push(`decision ${id}: chose ${d.chosen}${d.by ? ` (by ${d.by})` : ''}${o.chosen ? `, was ${o.chosen}` : ''}`);
    else if (JSON.stringify(o) !== JSON.stringify(d)) out.push(`decision ${id} edited`);
  }
  for (const id of pd.keys()) if (!nd.has(id)) out.push(`decision ${id} removed`);
  const pp = byId(prev.phases), np = byId(next.phases);
  for (const [id, ph] of np) {
    const o = pp.get(id);
    if (!o) { out.push(`phase ${id} added: "${short(ph.name)}"`); continue; }
    const notes = [];
    if (o.name !== ph.name) notes.push(`renamed "${short(ph.name, 40)}"`);
    const of = new Set((o.changes ?? []).map((c) => c.file)), nf = new Set((ph.changes ?? []).map((c) => c.file));
    const added = [...nf].filter((f) => !of.has(f)), removed = [...of].filter((f) => !nf.has(f));
    if (added.length) notes.push(`+${added.join(', +')}`);
    if (removed.length) notes.push(`−${removed.join(', −')}`);
    const done = (p) => checks(p).filter((c) => c.done).length;
    if (done(o) !== done(ph)) notes.push(`${done(ph) - done(o) > 0 ? done(ph) - done(o) : done(o) - done(ph)} check${Math.abs(done(ph) - done(o)) === 1 ? '' : 's'} ${done(ph) > done(o) ? 'done' : 'reopened'}`);
    if (!notes.length && JSON.stringify(o) !== JSON.stringify(ph)) notes.push('edited');
    if (notes.length) out.push(`phase ${id}: ${notes.join('; ')}`);
  }
  for (const id of pp.keys()) if (!np.has(id)) out.push(`phase ${id} removed`);
  const pv = new Map((prev.vocabulary ?? []).map((t) => [t.term, t])), nv = new Map((next.vocabulary ?? []).map((t) => [t.term, t]));
  const vAdded = [...nv.keys()].filter((t) => !pv.has(t)), vRemoved = [...pv.keys()].filter((t) => !nv.has(t));
  const vChanged = [...nv.keys()].filter((t) => pv.has(t) && JSON.stringify(pv.get(t)) !== JSON.stringify(nv.get(t)));
  if (vAdded.length && !pv.size) out.push(`vocabulary listed: ${vAdded.length} words`);
  else {
    if (vAdded.length) out.push(`vocabulary +${vAdded.join(', +')}`);
    if (vRemoved.length) out.push(`vocabulary −${vRemoved.join(', −')}`);
    if (vChanged.length) out.push(`vocabulary edited: ${vChanged.join(', ')}`);
  }
  if (JSON.stringify(prev.design) !== JSON.stringify(next.design)) out.push('design language edited');
  const known = new Set(['status', 'title', 'summary', 'current', 'endState', 'approach', 'discoveries', 'notDoing', 'references', 'decisions', 'phases', 'vocabulary', 'design', 'diagrams', 'change']);
  for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) if (!known.has(k) && JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out.push(`${k} ${prev[k] === undefined ? 'added' : next[k] === undefined ? 'removed' : 'edited'}`);
  if (JSON.stringify(prev.diagrams) !== JSON.stringify(next.diagrams)) out.push('diagrams edited');
  return out.length ? out : ['wording only'];
}

const gitUser = () => spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' }).stdout.trim() || 'unknown';

// Append a version when the plan differs from the last one. Returns the new version, or null when nothing changed.
export function record(planPath, plan, env = process.env) {
  const versions = load(planPath);
  const last = versions.at(-1);
  const hash = hashOf(plan);
  if (last?.hash === hash) {
    // The edit only wrote the note about the last change: give the latest version the intent it was missing.
    const note = env.PLAN_INTENT || plan.change?.intent;
    if (note && !last.intent) {
      last.intent = note;
      writeFileSync(versionsPath(planPath), versions.map((x) => JSON.stringify(x)).join('\n') + '\n');
    }
    return null;
  }
  // One change often takes several edits: the same note from the same agent session keeps its intent; anything else needs a new one.
  const note = plan.change?.intent;
  const sameSession = env.PLAN_SESSION && last?.session?.id === env.PLAN_SESSION;
  const intent = env.PLAN_INTENT || (note && (note !== last?.intent || sameSession) ? note : '') || '';
  const v = {
    v: (last?.v ?? 0) + 1,
    at: new Date().toISOString(),
    hash,
    by: env.PLAN_BY || gitUser(),
    via: env.PLAN_VIA || 'manual',
    intent,
    ...(env.PLAN_PROMPT ? { prompt: short(env.PLAN_PROMPT, 600) } : {}),
    ...(env.PLAN_SESSION ? { session: { id: env.PLAN_SESSION, ...(env.PLAN_TRANSCRIPT ? { transcript: env.PLAN_TRANSCRIPT.replace(homedir(), '~') } : {}) } } : {}),
    changes: summarize(last?.plan, plan),
    plan: JSON.parse(canonical(plan)),
  };
  appendFileSync(versionsPath(planPath), JSON.stringify(v) + '\n');
  return v;
}

// ---- backfill from git and Claude Code transcripts

const cleanPrompt = (content) => {
  const text = typeof content === 'string' ? content : (content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (!text || /^<(local-command|command-stdout|bash-|task-notification)/.test(text.trim())) return '';
  // A request relayed by another agent session counts, labelled, since it is what the agent acted on.
  const relayed = text.match(/<cross-session-message[^>]*>([\s\S]*?)<\/cross-session-message>/);
  if (relayed) return `[from another session] ${relayed[1].trim()}`;
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd) return `${cmd[1].trim()} ${(text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '').trim()}`.trim();
  return text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/\[Image[^\]]*\]/g, '[image]').trim();
};

// Every human prompt and every `git commit` the agent ran, from this project's Claude Code transcripts.
function transcripts(repoRoot) {
  const dir = join(homedir(), '.claude', 'projects', resolve(repoRoot).replace(/[^A-Za-z0-9]/g, '-'));
  const prompts = [], commits = [];
  if (!existsSync(dir)) return { prompts, commits };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
    const path = join(dir, f);
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.includes('"type":"user"') && !line.includes('git commit') && !line.includes('"queue-operation"')) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.isSidechain) continue;
      const at = Date.parse(e.timestamp);
      // A prompt typed while the agent was working, or a request relayed from another session, is queued, not a user turn.
      if (e.type === 'queue-operation') {
        const prompt = e.operation === 'enqueue' && typeof e.content === 'string' ? cleanPrompt(e.content) : '';
        if (prompt) prompts.push({ at, session: e.sessionId, transcript: path, prompt });
        continue;
      }
      if (e.type === 'assistant') {
        for (const c of e.message?.content ?? []) if (c.type === 'tool_use' && typeof c.input?.command === 'string' && c.input.command.includes('git commit')) commits.push({ at, session: e.sessionId, transcript: path, command: c.input.command });
        continue;
      }
      if (e.type !== 'user' || e.isMeta || e.message?.role !== 'user') continue;
      const c = e.message.content;
      if (Array.isArray(c) && c.some((x) => x.type === 'tool_result')) continue;
      const prompt = cleanPrompt(c);
      if (prompt && !prompt.startsWith('This session is being continued')) prompts.push({ at, session: e.sessionId, transcript: path, prompt });
    }
  }
  prompts.sort((a, b) => a.at - b.at);
  return { prompts, commits };
}

// The last thing a person asked in one transcript: what an agent edit is answering.
export function lastPrompt(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return '';
  let last = '';
  for (const line of readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('"type":"user"') && !line.includes('"queue-operation"')) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.isSidechain || e.isMeta) continue;
    let prompt = '';
    if (e.type === 'queue-operation' && e.operation === 'enqueue' && typeof e.content === 'string') prompt = cleanPrompt(e.content);
    else if (e.type === 'user' && e.message?.role === 'user' && !(Array.isArray(e.message.content) && e.message.content.some((x) => x.type === 'tool_result'))) prompt = cleanPrompt(e.message.content);
    if (prompt && !prompt.startsWith('This session is being continued')) last = prompt;
  }
  return last;
}

// The session that made a commit is the one whose transcript ran `git commit` with that subject; its prompt is the
// last thing the person typed in that session before it. No transcript match means the commit was made by hand.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function origin(subject, t, { prompts, commits }) {
  const k = norm(subject).slice(0, 48);
  const made = commits.filter((c) => norm(c.command).includes(k)).filter((c) => c.at <= t + 120_000).at(-1);
  if (!made) return null;
  const asked = prompts.filter((p) => p.session === made.session && p.at <= made.at).at(-1);
  return { session: made.session, transcript: made.transcript, prompt: asked?.prompt };
}

export function backfill(planPath) {
  if (load(planPath).length) { console.error(`${versionsPath(planPath)} already has versions; backfill only starts a history`); process.exit(1); }
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const rel = resolve(planPath).slice(root.length + 1);
  const log = spawnSync('git', ['log', '--reverse', '--format=%H%x09%aI%x09%an%x09%s', '--', rel], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const all = transcripts(root);
  let prev = null, n = 0;
  const lines = [];
  for (const row of log) {
    const [sha, at, author, subject] = row.split('\t');
    const text = spawnSync('git', ['show', `${sha}:${rel}`], { cwd: root, encoding: 'utf8' }).stdout;
    let plan; try { plan = JSON.parse(text); } catch { continue; }
    if (prev && hashOf(prev) === hashOf(plan)) continue;
    const t = Date.parse(at);
    const from = origin(subject, t, all);
    lines.push({
      v: ++n, at: new Date(t).toISOString(), hash: hashOf(plan), by: author, via: from ? 'claude-code' : 'manual',
      intent: subject, commit: sha.slice(0, 9),
      ...(from ? { ...(from.prompt ? { prompt: short(from.prompt, 600) } : {}), session: { id: from.session, transcript: from.transcript.replace(homedir(), '~') } } : {}),
      changes: summarize(prev, plan), plan: JSON.parse(canonical(plan)),
    });
    prev = plan;
  }
  writeFileSync(versionsPath(planPath), lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
  return lines;
}

if (import.meta.main) {
  const [cmd, file, a, b] = process.argv.slice(2);
  if (!cmd || !file) { console.error('usage: history.mjs backfill|list|at|diff <plan.json> [v] [v]'); process.exit(2); }
  const row = (v) => `v${v.v}  ${v.at.slice(0, 16).replace('T', ' ')}  ${v.by} via ${v.via}${v.session ? ` (${v.session.id.slice(0, 8)})` : ''}  ${v.intent || '—'}\n      ${v.changes.join(' · ')}`;
  if (cmd === 'backfill') { for (const v of backfill(file)) console.log(row(v)); }
  // The summaries are derived from the stored plans, so a better summariser can recompute them; nothing else changes.
  else if (cmd === 'resummarize') { const vs = load(file); vs.forEach((v, i) => { v.changes = summarize(vs[i - 1]?.plan, v.plan); }); writeFileSync(versionsPath(file), vs.map((v) => JSON.stringify(v)).join('\n') + '\n'); for (const v of vs) console.log(row(v)); }
  else if (cmd === 'list') { for (const v of load(file)) console.log(row(v)); }
  else if (cmd === 'at') { const v = load(file).find((x) => x.v === Number(String(a).replace(/^v/, ''))); if (!v) { console.error(`no version ${a}`); process.exit(1); } console.log(JSON.stringify(v.plan, null, 2)); }
  else if (cmd === 'diff') { const vs = load(file); const pick = (x) => vs.find((y) => y.v === Number(String(x).replace(/^v/, ''))); const [x, y] = [pick(a), pick(b)]; if (!x || !y) { console.error('no such version'); process.exit(1); } console.log(summarize(x.plan, y.plan).join('\n')); }
  else { console.error(`unknown command ${cmd}`); process.exit(2); }
}

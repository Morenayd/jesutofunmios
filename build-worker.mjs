// Build a single-file Cloudflare Worker (worker.js) from the Pages Functions
// sources + the static app (CSS/JS inlined into index.html).
// Run: node build-worker.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

function stripImports(code) {
  return code.replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\n?/g, '');
}

// --- shared helpers (strip `export ` prefixes) ---
let shared = read('./functions/api/_shared.js');
shared = shared.replace(/^export /gm, '');
if (/^export /m.test(shared)) throw new Error('shared still has exports');

// --- handlers: strip imports, rename the exported handlers ---
// Each entry: [file, [[exported name, build name], ...]] — a file may
// export more than one handler (e.g. PATCH and DELETE on the same route).
const handlers = [
  ['./functions/api/auth.js', [['onRequestPost', 'hAuthPost']]],
  ['./functions/api/logout.js', [['onRequestPost', 'hLogoutPost']]],
  ['./functions/api/state.js', [['onRequestGet', 'hStateGet']]],
  ['./functions/api/tasks.js', [['onRequestPost', 'hTasksPost']]],
  ['./functions/api/tasks/[id].js', [['onRequestPatch', 'hTaskPatch'], ['onRequestDelete', 'hTaskDelete']]],
  ['./functions/api/digests.js', [['onRequestPost', 'hDigestsPost']]],
  ['./functions/api/digests/[id].js', [['onRequestGet', 'hDigestGet']]],
  ['./functions/api/deadlines.js', [['onRequestPost', 'hDeadlinesPost']]],
  ['./functions/api/deadlines/[id].js', [['onRequestPatch', 'hDeadlinePatch'], ['onRequestDelete', 'hDeadlineDelete']]],
  ['./functions/api/reports.js', [['onRequestPost', 'hReportsPost']]],
  ['./functions/api/projects.js', [['onRequestPost', 'hProjectsPost']]],
  ['./functions/api/projects/[id].js', [['onRequestPatch', 'hProjectPatch']]],
  ['./functions/api/targets.js', [['onRequestPost', 'hTargetsPost']]],
  ['./functions/api/targets/[id].js', [['onRequestPatch', 'hTargetPatch']]],
  ['./functions/api/captures.js', [['onRequestPost', 'hCapturesPost']]],
  ['./functions/api/captures/[id].js', [['onRequestPatch', 'hCapturePatch']]],
  ['./functions/api/people.js', [['onRequestPost', 'hPeoplePost']]],
  ['./functions/api/people/[id].js', [['onRequestPatch', 'hPersonPatch']]],
  ['./functions/api/events.js', [['onRequestPost', 'hEventsPost']]],
  ['./functions/api/events/[id].js', [['onRequestPatch', 'hEventPatch']]],
  ['./functions/api/goals.js', [['onRequestPost', 'hGoalsPost']]],
  ['./functions/api/goals/[id].js', [['onRequestPatch', 'hGoalPatch']]],
];

let handlerCode = '';
for (const [path, pairs] of handlers) {
  let code = stripImports(read(path));
  for (const [orig, renamed] of pairs) {
    const needle = `export async function ${orig}`;
    if (!code.includes(needle)) throw new Error(`${path}: ${needle} not found`);
    code = code.replace(needle, `async function ${renamed}`);
  }
  if (/^export /m.test(code)) throw new Error(`${path}: leftover export`);
  if (/^import /m.test(code)) throw new Error(`${path}: leftover import`);
  handlerCode += `\n// ---- ${path} ----\n` + code.trim() + '\n';
}

// --- inline the static app into one HTML document ---
let html = read('./public/index.html');
const css = read('./public/styles.css');
const js = read('./public/app.js');
if (js.includes('</script')) throw new Error('app.js contains </script');
if (css.includes('</style')) throw new Error('styles.css contains </style');
if (!html.includes('<link rel="stylesheet" href="/styles.css" />')) throw new Error('css link tag not found');
html = html.replace('<link rel="stylesheet" href="/styles.css" />', `<style>\n${css}\n</style>`);
if (!html.includes('<script src="/app.js"></script>')) throw new Error('script tag not found');
html = html.replace('<script src="/app.js"></script>', `<script>\n${js}\n</script>`);

const escapeTpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const htmlLiteral = '`' + escapeTpl(html) + '`';

// --- router (replicates the Pages routing + _middleware auth gate) ---
const router = `
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      try {
        // Self-migration (the _middleware equivalent): create the newer
        // tables if they are missing. Idempotent and cheap; runs before
        // handlers.
        await ensureReportsTable(env);
        await ensureProjectsTable(env);
        await ensureTargetsTable(env);
        await ensureCapturesTable(env);
        await ensurePeopleTable(env);
        await ensureEventsTable(env);
        await ensureGoalsTable(env);
        if (path === '/api/auth') {
          if (request.method !== 'POST') return err('Method not allowed.', 405);
          return await hAuthPost({ request, env });
        }
        // SIGN-IN DISABLED at Jesutofunmi's request (2026-11-10): the board is
        // open to anyone with the URL. To re-enable the passcode gate, restore
        // the TEAM_PASSCODE cookie check in this block (previous build).
        let m;
        if (path === '/api/state' && request.method === 'GET') return await hStateGet({ request, env });
        if (path === '/api/tasks' && request.method === 'POST') return await hTasksPost({ request, env });
        if ((m = path.match(/^\\/api\\/tasks\\/(\\d+)$/)) && request.method === 'PATCH') return await hTaskPatch({ request, env, params: { id: m[1] } });
        if ((m = path.match(/^\\/api\\/tasks\\/(\\d+)$/)) && request.method === 'DELETE') return await hTaskDelete({ request, env, params: { id: m[1] } });
        if (path === '/api/digests' && request.method === 'POST') return await hDigestsPost({ request, env });
        if ((m = path.match(/^\\/api\\/digests\\/(\\d+)$/)) && request.method === 'GET') return await hDigestGet({ request, env, params: { id: m[1] } });
        if (path === '/api/deadlines' && request.method === 'POST') return await hDeadlinesPost({ request, env });
        if ((m = path.match(/^\\/api\\/deadlines\\/(\\d+)$/)) && request.method === 'PATCH') return await hDeadlinePatch({ request, env, params: { id: m[1] } });
        if ((m = path.match(/^\\/api\\/deadlines\\/(\\d+)$/)) && request.method === 'DELETE') return await hDeadlineDelete({ request, env, params: { id: m[1] } });
        if (path === '/api/reports' && request.method === 'POST') return await hReportsPost({ request, env });
        if (path === '/api/projects' && request.method === 'POST') return await hProjectsPost({ request, env });
        if ((m = path.match(/^\\/api\\/projects\\/(\\d+)$/)) && request.method === 'PATCH') return await hProjectPatch({ request, env, params: { id: m[1] } });
        if (path === '/api/targets' && request.method === 'POST') return await hTargetsPost({ request, env });
        if ((m = path.match(/^\\/api\\/targets\\/(\\d+)$/)) && request.method === 'PATCH') return await hTargetPatch({ request, env, params: { id: m[1] } });
        if (path === '/api/captures' && request.method === 'POST') return await hCapturesPost({ request, env });
        if ((m = path.match(/^\\/api\\/captures\\/(\\d+)$/)) && request.method === 'PATCH') return await hCapturePatch({ request, env, params: { id: m[1] } });
        if (path === '/api/people' && request.method === 'POST') return await hPeoplePost({ request, env });
        if ((m = path.match(/^\\/api\\/people\\/(\\d+)$/)) && request.method === 'PATCH') return await hPersonPatch({ request, env, params: { id: m[1] } });
        if (path === '/api/events' && request.method === 'POST') return await hEventsPost({ request, env });
        if ((m = path.match(/^\\/api\\/events\\/(\\d+)$/)) && request.method === 'PATCH') return await hEventPatch({ request, env, params: { id: m[1] } });
        if (path === '/api/goals' && request.method === 'POST') return await hGoalsPost({ request, env });
        if ((m = path.match(/^\\/api\\/goals\\/(\\d+)$/)) && request.method === 'PATCH') return await hGoalPatch({ request, env, params: { id: m[1] } });
        if (path === '/api/logout' && request.method === 'POST') return await hLogoutPost({ request, env });
        return err('Not found.', 404);
      } catch (e) {
        return json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') }, 500);
      }
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    return new Response('Method not allowed', { status: 405 });
  },
};
`;

const out =
  '// JesutofunmiOS — single-file Worker build (generated by build-worker.mjs; do not edit by hand).\n' +
  '// Contains: shared helpers + API handlers (from functions/api) + the app HTML with CSS/JS inlined.\n\n' +
  shared.trim() + '\n' +
  handlerCode +
  '\nconst INDEX_HTML = ' + htmlLiteral + ';\n' +
  router;

writeFileSync(new URL('./worker.js', import.meta.url), out);
console.log('worker.js written:', out.length, 'chars');

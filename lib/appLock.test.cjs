// Run: node lib/appLock.test.cjs
const { transform } = require('../node_modules/sucrase'); const fs = require('fs'); const Module = require('module');
const store = {}; const orig = Module._load;
Module._load = function (req, ...r) { if (req === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async k => store[k] ?? null, setItem: async (k, v) => { store[k] = v; }, removeItem: async k => { delete store[k]; } } }; return orig.call(this, req, ...r); };
const load = (f) => { const m = new Module(f); m._compile(transform(fs.readFileSync(__dirname + '/' + f, 'utf8'), { transforms: ['typescript', 'imports'] }).code, __dirname + '/x.js'); return m.exports; };
const L = load('appLock.ts'); let fail = 0;
const eq = (n, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { fail++; console.log('FAIL', n, a, '!=', b); } else console.log('ok  ', n); };
const base = { appIsActive: true, callJustAnswered: false, hasPin: true, enteredByParent: false };
const MIN = 60_000;
eq('brief bounce (2 min) does not lock', L.shouldLock(2 * MIN, base), false);
eq('14 min does not lock', L.shouldLock(14 * MIN, base), false);
eq('16 min locks', L.shouldLock(16 * MIN, base), true);
eq('first launch (never active) locks', L.shouldLock(Infinity, base), true);
eq('background restart never prompts', L.shouldLock(Infinity, { ...base, appIsActive: false }), false);
eq('no pin never locks', L.shouldLock(Infinity, { ...base, hasPin: false }), false);
eq('parent in child profile never locks', L.shouldLock(Infinity, { ...base, enteredByParent: true }), false);
eq('just answered a reminder call never locks', L.shouldLock(60 * MIN, { ...base, callJustAnswered: true }), false);
(async () => {
  eq('no stamp = Infinity', await L.awayMs(), Infinity);
  await L.stampActive();
  const a = await L.awayMs(); eq('fresh stamp is ~0', a < 1000, true);
  store['familycube_last_active_at_v1'] = String(Date.now() - 20 * MIN);
  const b = await L.awayMs(); eq('20 min old stamp locks', L.shouldLock(b, base), true);
  console.log(fail ? fail + ' FAILED' : 'all passed'); process.exit(fail ? 1 : 0);
})();

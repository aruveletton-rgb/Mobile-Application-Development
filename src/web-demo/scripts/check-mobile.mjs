import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import JSON5 from 'json5';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../mobile/', import.meta.url));
const main = join(root, 'entry/src/main');
const files = [];
const walk = path => { for (const entry of readdirSync(path, { withFileTypes: true })) { const name = join(path, entry.name); if (entry.isDirectory()) walk(name); else files.push(name); } };
walk(root);
for (const file of files.filter(f => /\.json5?$/.test(f))) JSON5.parse(readFileSync(file, 'utf8'));
for (const needed of ['hvigorfile.ts', 'hvigor/hvigor-config.json5', 'entry/hvigorfile.ts', 'entry/build-profile.json5', 'AppScope/app.json5', 'entry/src/main/module.json5']) assert.ok(existsSync(join(root, needed)), needed);
const module = JSON5.parse(readFileSync(join(main, 'module.json5'), 'utf8')).module;
for (const ability of [...module.abilities, ...module.extensionAbilities]) assert.ok(existsSync(join(main, ability.srcEntry)), ability.srcEntry);
const strings = new Set([join(main, 'resources/base/element/string.json'), join(root, 'AppScope/resources/base/element/string.json')].flatMap(f => JSON.parse(readFileSync(f,'utf8')).string.map(v => v.name)));
for (const file of files.filter(f => /\.(ets|json5?|ts)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/app\.(media|profile)\.([A-Za-z_0-9]+)/g)) assert.ok(existsSync(join(main, `resources/base/${match[1]}/${match[2]}.${match[1] === 'media' ? 'svg' : 'json'}`)), `${file}: ${match[0]}`);
  for (const match of text.matchAll(/\$string:([A-Za-z_0-9]+)/g)) assert.ok(strings.has(match[1]), match[0]);
  for (const match of text.matchAll(/\$profile:([A-Za-z_0-9]+)/g)) assert.ok(existsSync(join(main, `resources/base/profile/${match[1]}.json`)), match[0]);
}
const output = fileURLToPath(new URL('../../../temp/client/mobile-source-check/', import.meta.url));
mkdirSync(output, { recursive: true });
for (const [name, source] of [['repository', 'OfflineRepository'], ['csv', 'ScheduleCsv'], ['models', '../model/Models']]) {
  await build({ entryPoints: [join(main, 'ets/services', `${source}.ets`)], outfile: join(output, name + '.mjs'), bundle: true, format: 'esm', platform: 'node', loader: { '.ets': 'ts' }, resolveExtensions: ['.ets','.js','.ts'], logLevel: 'error' });
}
const { OfflineRepository } = await import(pathToFileURL(join(output,'repository.mjs')));
const { freshSnapshot } = await import(pathToFileURL(join(output,'models.mjs')));
const { parseCsv } = await import(pathToFileURL(join(output,'csv.mjs')));
const state = freshSnapshot(), repo = new OfflineRepository(state, true);
const fields = { location: '合成教学楼', description: '合成灯故障', contactAlias: 'SYN-CONTACT-K' };
const draft = repo.create(fields,'repair'), token = repo.confirm(draft,'repair');
assert.throws(() => repo.submit('repair','r1','k1',draft,{confirmationId:'missing'}), /CONFIRMATION_REQUIRED/);
assert.throws(() => new OfflineRepository(freshSnapshot(), false).confirm(draft,'repair'), /FORBIDDEN/);
const receipt = repo.submit('repair','r1','k1',draft,token);
assert.deepEqual(repo.submit('repair','r1','k1',draft,token),receipt);
assert.throws(() => repo.submit('repair','r2','k1',draft,token), /IDEMPOTENCY_CONFLICT/);
assert.equal(state.tickets.length,1);
assert.throws(() => repo.create({ activityId: state.activities[1].activityId, session:'morning', contactAlias:'SYN-CONTACT-K' },'activity'), /CAPACITY_EXCEEDED/);
assert.throws(() => repo.create({ activityId: state.activities[2].activityId, session:'morning', contactAlias:'SYN-CONTACT-K' },'activity'), /ACTIVITY_CLOSED/);
const lost = repo.create({ kind:'LOST', itemDescription:'合成水杯', location:'服务台', occurredOn:new Date(Date.now()-86400000).toISOString().slice(0,10), contactAlias:'SYN-CONTACT-K' },'lost');
assert.equal(repo.submit('lost','l1','lk',lost,repo.confirm(lost,'lost')).status,'PENDING_REVIEW');
const header = 'title,kind,location,startsAt,endsAt\n', row = '"合成课程,引号",course,A203,2026-10-20T08:00:00+08:00,2026-10-20T09:00:00+08:00';
assert.equal(parseCsv(header+row)[0].title,'合成课程,引号');
assert.throws(() => parseCsv(header+row.replace('course','bad')));
assert.throws(() => parseCsv(header+row+'\n'+row));
console.log(JSON.stringify({ status:'passed', jsonConfigurations:files.filter(f => /\.json5?$/.test(f)).length, nativePureLogicAssertions:11, checked:'resource references + actual native pure business/CSV sources executed under esbuild/Node', harmonyOsCompilation:false, limitation:'Does not compile ArkUI or validate HarmonyOS SDK APIs, device notifications/cards/network/storage' }, null, 2));

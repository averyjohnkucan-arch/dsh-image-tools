import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, open, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanModels} from '../lib/scan-models.js';
import {defaults, validate} from '../lib/config.js';

test('recursive image discovery matches a full model and reports broken components', async t => {
  const root = await mkdtemp(join(tmpdir(), 'image-discovery-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const {models} = JSON.parse(await readFile(new URL('../lib/recommended-models.json', import.meta.url)));
  const model = models.find(model => model.id === 'qwen-turbo-gguf');
  for (const [i,file] of model.files.entries()) {
    const dir = join(root,String(i),'publisher','precision');
    await mkdir(dir,{recursive:true});
    const path = join(dir,file.name);
    const handle = await open(path,'w');
    await handle.truncate(file.size);
    await handle.close();
  }
  await symlink(root,join(root,'cycle'),'dir');
  const visible = await scanModels(root);
  assert.deepEqual(visible.profiles.map(p=>p.id),[model.id]);
  assert.doesNotThrow(()=>validate({...defaults(),profiles:visible.profiles}));
  const component = model.files.at(-1);
  await writeFile(join(root,String(model.files.length-1),'publisher','precision',component.name),'partial');
  const incomplete = await scanModels(root);
  assert.equal(incomplete.profiles.length,0);
  assert.ok(incomplete.warnings.some(w=>w.includes('size mismatch')));
});

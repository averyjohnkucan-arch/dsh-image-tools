import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ImageRuntime} from '../lib/runtime.js';

test('cancelling a running renderer waits for its owned process to exit', async t => {
 const root=await mkdtemp(join(tmpdir(),'dsh-image-worker-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const runtime=new ImageRuntime({},root);await runtime.init();
 const controller=new AbortController(),job={log:'',progress:''};
 const running=runtime.spawnWorker(job,process.execPath,['-e','setInterval(()=>{},1000)'],controller.signal);
 const child=job.child;
 assert.ok(child?.pid);
 controller.abort(new Error('Qualification cancellation'));
 await assert.rejects(running,/cancelled|Qualification cancellation/);
 assert.ok(child.exitCode!==null || child.signalCode!==null);
 assert.equal(job.child,undefined);
 assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});
 await runtime.dispose();
});

test('worker stdout updates sampler percentage across partial chunks and decoding logs',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-image-progress-'));t.after(()=>rm(root,{recursive:true,force:true}));const runtime=new ImageRuntime({},root);await runtime.init();
 const job={log:'',progress:''};await runtime.spawnWorker(job,process.execPath,['-e',"process.stdout.write('Step 1/8\\nStep ');setTimeout(()=>{process.stdout.write('3/8\\nDecoding image\\n');},15)"],new AbortController().signal);
 assert.equal(job.percent,37);assert.equal(job.progress,'Decoding image');await runtime.dispose();
});

import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {ImageRuntime} from '../lib/runtime.js';

test('CPU renders serialize locally without requesting NVIDIA unloading or scheduler admission',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-image-cpu-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const weights=join(root,'weights.gguf');await writeFile(weights,'GGUF');
 const runtime=new ImageRuntime({attachments:{saveImage:async()=>({attachmentId:'sha256:'+'a'.repeat(64),mediaType:'image/png',width:512,height:512,bytes:24})}},root);
 await runtime.init();await runtime.settings.save({...runtime.settings.value,performanceHold:true,nativePython:process.execPath,sdExecutable:process.execPath,profiles:[{id:'turbo',nativeWeights:'resident',nativeVramGiB:22.695,nativeVaeTiling:false,name:'Turbo',backend:'qwen-sdcpp',variant:'turbo',modelPath:weights,textEncoderPath:weights,projectorPath:weights,vaePath:weights,tasks:['photograph','edit'],steps:8,guidance:1}],defaults:{photograph:'turbo',edit:'turbo',art:''}});
 runtime.devices=async()=>[{name:'CPU',kind:'cpu',vendor:'intel'}];
 runtime.scheduler={runExclusive:()=>{throw Error('CPU work must never request GPU handoff');}};
 let active=0,peak=0;
 runtime.spawnWorker=async(_job,_python,args)=>{
  active++;peak=Math.max(peak,active);const spec=JSON.parse(await readFile(args.at(-1),'utf8'));
  assert.equal(spec.execution,'cpu');assert.equal(spec.sdDevice,'CPU');assert.equal(spec.performanceHold,true);assert.equal(spec.profile.nativeWeights,'resident');assert.equal(spec.profile.nativeVramGiB,22.695);assert.equal(spec.profile.nativeVaeTiling,false);assert.equal(spec.steps,8);assert.equal(spec.profile.guidance,1);
  await new Promise(resolve=>setTimeout(resolve,5));const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);await writeFile(spec.output,png);active--;
 };
 const results=await Promise.all([1,2].map(()=>runtime.render({action:'generate_photograph',prompt:'a mug',execution:'cpu'},{workspace:root})));
 assert.equal(peak,1);assert.ok(results.every(r=>r.execution==='cpu'&&r.restoration==='not-needed'));
 await runtime.dispose();
});

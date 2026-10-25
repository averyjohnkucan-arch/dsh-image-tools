import test from 'node:test';import assert from 'node:assert/strict';import {samplingPercent} from '../lib/progress.js';import {ImageRuntime} from '../lib/runtime.js';
test('sampler percentage accepts tqdm and step callbacks without inventing loading progress',()=>{
 assert.equal(samplingPercent('Loading models'),null);assert.equal(samplingPercent('Loading checkpoint shards: 100%|████| 4/4',52),null);assert.equal(samplingPercent('10%|█ | 5/52',52),10);assert.equal(samplingPercent('GPU memory 80% used'),null);
 assert.equal(samplingPercent(' 10%|█ | 5/52 [02:28<24:21]\r 27%|██ | 14/52'),27);
 assert.equal(samplingPercent('Step 1/8\nStep 3/8\nDecoding image'),37);
 assert.equal(samplingPercent('Step 1/0\n150%|invalid'),null);assert.equal(samplingPercent('100%|████| 52/52'),100);
});
test('progress endpoint matches exact call only and exposes no model paths or prompts',async()=>{
 const runtime=new ImageRuntime({},'/tmp/unused-image-progress');runtime.jobs.set('a',{callId:'call-a',status:'running',percent:10,log:'private',name:'model'});runtime.jobs.set('b',{callId:'call-b',status:'running',percent:54});
 assert.deepEqual(await runtime.action('progress',{callId:'call-a'}),{status:'running',stage:'loading',percent:13});assert.equal(await runtime.action('progress',{callId:'not-found'}),null);assert.equal(await runtime.action('progress',{}),null);
 runtime.jobs.get('a').status='complete';assert.equal((await runtime.action('progress',{callId:'call-a'})).percent,100);
 runtime.jobs.set('duplicate',{callId:'call-a',status:'running',percent:95});assert.equal(await runtime.action('progress',{callId:'call-a'}),null,'ambiguous IDs must not show another job progress');
});

test('native sd-cli sampling bars are recognized, excluding tensor loads and VAE tile counts',()=>{
 assert.equal(samplingPercent('\r  |======>     | 1/8 - 6.42s/it\x1b[K',8),12);
 assert.equal(samplingPercent('\r  |======>     | 3/8 - 2.49it/s\x1b[K',8),37);
 assert.equal(samplingPercent('\r  |########   | 3/8 - 1.43GB/s\x1b[K',8),null);
 assert.equal(samplingPercent('\r  |==========| 8/8 - 2.4it/s\r |====> | 1/9 - 1.81it/s',8),100);
});
test('job percentage reserves completion for decoding, restoration and saving',async()=>{
 const runtime=new ImageRuntime({},'/tmp/unused-image-progress');
 const job={callId:'call',status:'running',stage:'sampling',percent:50};runtime.jobs.set('job',job);
 assert.equal((await runtime.action('progress',{callId:'call'})).percent,47);
 for(const [stage,percent] of [['decoding',92],['restoring',96],['saving',99]]){job.stage=stage;assert.equal((await runtime.action('progress',{callId:'call'})).percent,percent);}
 job.status='complete';assert.equal((await runtime.action('progress',{callId:'call'})).percent,100);
});

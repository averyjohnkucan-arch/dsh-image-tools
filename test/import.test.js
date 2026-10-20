import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {importModels} from '../lib/import.js';

async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'dsh-image-import-'));try{await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
async function safetensor(path,keys){const body=Buffer.from(JSON.stringify(Object.fromEntries(keys.map(k=>[k,{dtype:'BF16',shape:[1],data_offsets:[0,2]}]))));const prefix=Buffer.alloc(8);prefix.writeBigUInt64LE(BigInt(body.length));await writeFile(path,Buffer.concat([prefix,body,Buffer.alloc(2)]));return path;}
test('one selection assigns denoiser, encoder, projector and VAE without reading tensor payloads',()=>fixture(async root=>{
 const model=await safetensor(join(root,'Qwen-Image-Turbo.safetensors'),['img_in.weight']);
 const encoder=await safetensor(join(root,'encoder.safetensors'),['model.embed_tokens.weight']);
 const vae=await safetensor(join(root,'vae.safetensors'),['decoder.up.0.weight']);
 const projector=join(root,'mmproj.gguf');await writeFile(projector,'GGUFprojector');
 const {profile,warnings}=await importModels([encoder,vae,model,projector]);
 assert.equal(profile.backend,'qwen-sdcpp');assert.equal(profile.variant,'turbo');assert.equal(profile.modelPath,model);assert.equal(profile.textEncoderPath,encoder);assert.equal(profile.projectorPath,projector);assert.equal(profile.vaePath,vae);assert.deepEqual(profile.tasks,['photograph','edit']);assert.deepEqual(warnings,[]);
}));
test('ambiguous models and unknown variants require review instead of silently choosing weights',()=>fixture(async root=>{
 const a=await safetensor(join(root,'krea-model.safetensors'),['img_in.weight']);
 const b=await safetensor(join(root,'krea-other.safetensors'),['img_in.weight']);
 const {profile,warnings}=await importModels([a,b]);assert.equal(profile.modelPath,'');assert.equal(profile.variant,'');assert.ok(warnings.some(w=>/Multiple candidates/.test(w)));assert.ok(warnings.some(w=>/uncertain/.test(w)));
}));
test('complete Qwen Diffusers folder is recognized without importing or moving weights',()=>fixture(async root=>{
 await writeFile(join(root,'model_index.json'),JSON.stringify({_class_name:'QwenImage21Pipeline'}));const {profile}=await importModels([root]);assert.equal(profile.backend,'qwen-diffusers');assert.equal(profile.modelPath,root);assert.equal(profile.steps,40);
}));
test('shard index takes precedence over its individual Safetensors shards',()=>fixture(async root=>{
 const index=join(root,'qwen-image-turbo.safetensors.index.json');await writeFile(index,JSON.stringify({weight_map:{'img_in.weight':'part1.safetensors'}}));const shard=await safetensor(join(root,'part1.safetensors'),['img_in.weight']);const {profile}=await importModels([index,shard]);assert.equal(profile.modelPath,index);
}));
test('import refuses relative paths and oversized selections',async()=>{
 await assert.rejects(importModels(['relative.gguf']),/Select a model/);await assert.rejects(importModels(Array(101).fill('/model.gguf')),/100/);
});

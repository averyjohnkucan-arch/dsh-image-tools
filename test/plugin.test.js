import test from 'node:test';import assert from 'node:assert/strict';import {Context} from '@deepseek-ai/cordis';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Readable} from 'node:stream';import {ImageRuntime} from '../lib/runtime.js';import * as plugin from '../index.js';
test('plugin exposes one direct image tool, protects owner settings and releases registrations',async t=>{const root=await mkdtemp(join(tmpdir(),'dsh-image-plugin-'));t.after(()=>rm(root,{recursive:true,force:true}));const ctx=new Context(),tools=[],routes=[];ctx.provide('tools',{register:d=>{tools.push(d);return()=>tools.splice(tools.indexOf(d),1);}});ctx.provide('attachments',{});ctx.provide('webServer',{register:r=>{routes.push(r);return()=>routes.splice(routes.indexOf(r),1);},getOrigin:()=> 'http://127.0.0.1:3080'});ctx.provide('sandboxPolicy',{resolve:()=>({mode:'workspace-write'})});const fiber=ctx.plugin(plugin,{dataDir:root});await fiber;assert.deepEqual(tools.map(t=>t.name),['create_image']);for(const tool of tools){assert.equal(tool.deferLoading,undefined);assert.ok(!tool.parameters.properties.action);assert.ok(tool.parameters.required.includes('prompt'));assert.match(tool.description,/Qwen Image 2.1 Turbo.*Krea 2 Turbo/);}assert.ok(tools[0].parameters.properties.image_ids);assert.ok(!tools[0].parameters.properties.profile);const route=routes.find(r=>r.path.endsWith('/action'));let status=200,body;const res={setHeader(){},writeHead:s=>status=s,end:value=>body=value};const req=Readable.from([JSON.stringify({action:'configure',payload:{settings:{}}})]);req.method='POST';req.headers={'content-type':'application/json'};await route.handler(req,res);assert.equal(status,401);assert.match(body,/Owner capability/);await fiber.dispose();assert.equal(tools.length,0);assert.equal(routes.length,0);const reloaded=await ctx.plugin(plugin,{dataDir:root});assert.equal(tools.length,1);await reloaded.dispose();assert.equal(tools.length,0);await ctx.fiber.dispose();});
test('one tool routes each operation and preserves native image attachments',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dsh-image-direct-'));t.after(()=>rm(root,{recursive:true,force:true}));const ctx=new Context(),tools=[];
 ctx.provide('tools',{register:d=>{tools.push(d);return()=>tools.splice(tools.indexOf(d),1);}});ctx.provide('attachments',{});ctx.provide('sandboxPolicy',{});ctx.provide('webServer',{register:()=>()=>{},getOrigin:()=> 'http://127.0.0.1:3080'});
 const calls=[],original=ImageRuntime.prototype.action,image={attachmentId:'fixture',mediaType:'image/png',bytes:123,width:512,height:512};
 ImageRuntime.prototype.action=async function(action,args,exec){calls.push({action,args,exec});return {path:'dsh-images/fixture.png',image};};
 const fiber=await ctx.plugin(plugin,{dataDir:root});t.after(async()=>{ImageRuntime.prototype.action=original;await fiber.dispose();await ctx.fiber.dispose();});
 const exec={agent:{session:{}}};
 const cases=[
  [{prompt:'A studio photograph of a ceramic cup'},'generate_photograph'],
  [{prompt:'A watercolor illustration of a blue boat at dusk'},'generate_art'],
  [{prompt:'Recolor this photo',image_ids:['fixture']},'edit_image'],
  [{prompt:'A scene on Mars',mode:'art'},'generate_art'],
 ];
 for(const [args,action] of cases){
  const result=await tools[0].execute({...args,size:'Square512',seed:42,quality:'slow_high_quality'},exec);
  const call=calls.at(-1);
  assert.equal(call.action,action);assert.equal(call.args.action,action);assert.equal(call.args.quality,'fast_normal_quality');
  assert.equal(call.exec,exec);assert.equal(result.image,image);
  assert.deepEqual(tools[0].output.render({},result).at(-1),{type:'image',attachment:image});
 }
 const ask=await tools[0].execute({prompt:'A photorealistic watercolor painting of a horse'},exec);
 assert.equal(JSON.parse(ask.data).status,'needs_clarification');
 assert.equal(calls.length,cases.length);
 await assert.rejects(()=>tools[0].execute({prompt:'scene'},{}),/active conversation/);
});

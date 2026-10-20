import {importModels} from './import.js';
import {parseDevices,chooseExecution} from './devices.js';
import {spawn} from 'node:child_process';import {mkdir,readFile,writeFile,readdir,stat,lstat,realpath,mkdtemp,access} from 'node:fs/promises';import {join,dirname,resolve,isAbsolute,relative} from 'node:path';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';import {Settings} from './config.js';import {request,menu,selectImages} from './request.js';import {run,gpuInfo,terminate} from './process.js';
const pkg=dirname(dirname(fileURLToPath(import.meta.url)));
export class ImageRuntime{
 constructor(ctx,root){this.ctx=ctx;this.settings=new Settings(root);this.jobs=new Map();this.closed=false;this.setupPromise=null;this.localQueue=Promise.resolve();this.deviceCache=null;}
 async init(){await this.settings.init();}
 async list(){return {settings:this.settings.value,menu:menu(this.settings.value),scheduler:typeof this.scheduler?.runExclusive==='function',root:this.settings.root,devices:this.deviceCache?.devices||[],jobs:[...this.jobs.values()].map(({controller,child,promise,...job})=>job)};}
 async browse(path){path=path||process.env.HOME||process.env.USERPROFILE;if(!isAbsolute(path))throw Error('Use an absolute host path.');const files=await readdir(path,{withFileTypes:true});return {path,parent:dirname(path),entries:(await Promise.all(files.slice(0,1500).map(async e=>{const full=join(path,e.name);let directory=e.isDirectory();if(e.isSymbolicLink()){try{directory=(await stat(full)).isDirectory();}catch{return null;}}return directory||(/\.(safetensors|gguf|exe|json)$/i.test(e.name)||e.name==='sd-cli')?{name:e.name,path:full,directory}:null;}))).filter(Boolean).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))};}
 async spawnWorker(job,command,args,signal,env={}){
  signal?.throwIfAborted();const child=spawn(command,args,{env:{...process.env,PYTHONUNBUFFERED:'1',PYTHONDONTWRITEBYTECODE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',...env},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});job.child=child;
  const append=b=>{job.log=(job.log+String(b)).slice(-100000);const lines=String(b).trim().split('\n');job.progress=lines.at(-1)?.slice(0,500)||job.progress;};child.stdout.on('data',append);child.stderr.on('data',append);
  const abort=()=>{void terminate(child).catch(error=>{job.stopError=error.message;});};signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,this.settings.value.timeoutMs);let timedOut=false;const timeout=setTimeout(()=>timedOut=true,this.settings.value.timeoutMs);
  try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code)=>code===0?resolve():reject(Object.assign(new Error(signal?.aborted?'Image job cancelled.':timedOut?'Image rendering timed out.':`Renderer exited ${code}: ${job.log.slice(-4000)}`),{exitCode:code})));});signal?.throwIfAborted();}
  finally{clearTimeout(timer);clearTimeout(timeout);signal?.removeEventListener('abort',abort);await terminate(child);delete job.child;}
 }
 async devices(force=false){
  const executable=this.settings.value.sdExecutable;if(!executable)return [];
  if(!force&&this.deviceCache?.executable===executable&&Date.now()-this.deviceCache.time<60000)return this.deviceCache.devices;
  const result=await run(executable,['--list-devices'],{timeout:30000});
  const devices=parseDevices(result.stdout,result.stderr);this.deviceCache={executable,time:Date.now(),devices};return devices;
 }
 async render(args,exec){
  if(this.closed)throw Error('Image Tools is disabled.');
  const cfg=structuredClone(this.settings.value),r=request(args,cfg);
  const binding=chooseExecution({...args,width:r.width,height:r.height},cfg,r.profile,cfg.profiles,await this.devices());
  const p=binding.profile;r.profile=p;r.steps=p.steps;
  if(binding.mode==='gpu'&&!this.scheduler?.runExclusive)throw Error('Install or update dsh-model-scheduler before using GPU unload/reload. CPU and iGPU do not need it.');
  const native=['qwen-sdcpp','krea-sdcpp'].includes(p.backend);
  const python=native?(cfg.nativePython||cfg.qwenPython):p.backend==='comfy-krea'?cfg.comfyPython:cfg.qwenPython;
  if(!python)throw Error('Choose or install the image runtime in Settings → Image Tools.');await access(python);await access(p.modelPath);
  if(p.backend==='qwen-diffusers'){const index=JSON.parse(await readFile(join(p.modelPath,'model_index.json'),'utf8'));if(index._class_name!=='QwenImage21Pipeline')throw Error('Choose a complete Qwen Image 2.1 Diffusers model directory.');}
  else if(native){if(!cfg.sdExecutable)throw Error('Choose or install sd-cli in Settings → Image Tools.');await access(cfg.sdExecutable);await access(p.textEncoderPath);await access(p.vaePath);if(r.task==='edit')await access(p.projectorPath);}
  else{await access(join(cfg.comfySource,'main.py'));await access(p.textEncoderPath);await access(p.vaePath);}
  const refs=r.task==='edit'?selectImages(exec.agent?.session.snapshotEvents()||[],args.image_ids):[];
  const workspace=await realpath(exec.workspace||exec.agent?.session.header?.cwd||this.settings.root),parent=join(workspace,'dsh-images');
  await mkdir(parent,{recursive:true,mode:0o700});if((await lstat(parent)).isSymbolicLink())throw Error('Image output directory cannot be a symlink.');
  const directory=await mkdtemp(join(parent,'job-')),id=randomUUID(),controller=new AbortController(),signal=exec.signal?AbortSignal.any([exec.signal,controller.signal]):controller.signal;
  const job={id,profile:p.id,name:p.name,execution:binding.mode,device:binding.device.name,status:'queued',progress:'Waiting for '+binding.mode,log:'',directory,created:Date.now(),controller};this.jobs.set(id,job);
  const inputs=[];
  try{for(let i=0;i<refs.length;i++){const image=await this.ctx.attachments.readImage(refs[i],signal),path=join(directory,`input-${i}.png`);await writeFile(path,image.data,{mode:0o600});inputs.push(path);}}
  catch(error){job.status='failed';job.progress=error.message;throw error;}
  const output=join(directory,'result.png'),file=join(directory,'job.json');
  await writeFile(file,JSON.stringify({...r,inputs,output,directory,id,gpu:cfg.gpu,execution:binding.mode,performanceHold:cfg.performanceHold,comfySource:cfg.comfySource,sdExecutable:cfg.sdExecutable,sdDevice:binding.device.name,timeoutMs:cfg.timeoutMs}),{mode:0o600});
  const driver={key:'image-tools:'+id,name:'Image Tools · '+p.name,gpu:cfg.gpu,fingerprint:id,load:async()=>{
   // Non-NVIDIA Vulkan devices use the engine's memory fitting. The scheduler
   // still coordinates registered model owners; no external process is killed.
   if(binding.device.vendor==='nvidia'){
    const processes=await run('nvidia-smi',[`--id=${cfg.gpu}`,'--query-compute-apps=pid,process_name','--format=csv,noheader'],{timeout:5000});
    if(processes.stdout.trim())throw Error('Another NVIDIA compute process is still running after managed models unloaded: '+processes.stdout.trim()+'. Stop it in its owner application.');
    const gpu=await gpuInfo(cfg.gpu);if(gpu.freeMiB<cfg.minFreeMiB)throw Error(`Only ${Math.floor(gpu.freeMiB)} MiB VRAM is free after managed unloading. Image Tools never kills external applications.`);
   }return job;
  },unload:async()=>{if(job.child)await terminate(job.child);}};
  const work=async leaseSignal=>{
   leaseSignal.throwIfAborted();job.status='running';job.progress='Loading '+binding.mode+' pipeline';
   try{await this.spawnWorker(job,python,['-B',join(pkg,'scripts/render.py'),file],leaseSignal);}
   catch(error){if(error.exitCode!==75||p.backend!=='qwen-diffusers'||leaseSignal.aborted)throw error;job.progress='Retrying with lower-memory sequential offload';job.log+='\nRetrying once in a fresh process with sequential CPU offload.\n';await this.spawnWorker(job,python,['-B',join(pkg,'scripts/render.py'),file],leaseSignal,{DSH_IMAGE_OFFLOAD:'sequential'});}
   const bytes=await readFile(output);if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Renderer did not publish a PNG image.');return bytes;
  };
  job.promise=(async()=>{try{
   let handoff;
   if(binding.mode==='gpu')handoff=await this.scheduler.runExclusive(driver,(_state,leaseSignal)=>work(leaseSignal),{signal,restorePrevious:cfg.restorePrevious});
   else{const pending=this.localQueue.catch(()=>{}).then(()=>work(signal));this.localQueue=pending.then(()=>{},()=>{});handoff={result:await pending,restoration:'not-needed'};}
   const attachment=await this.ctx.attachments.saveImage({data:handoff.result,mediaType:'image/png',name:'generated-image.png'});
   job.status='complete';job.progress='Image ready';job.restoration=handoff.restoration;
   return {image:Object.fromEntries(['attachmentId','mediaType','bytes','width','height','name'].filter(k=>attachment[k]!==undefined).map(k=>[k,attachment[k]])),path:relative(workspace,output).split('\\').join('/'),profile:p.name,variant:p.variant,quality:r.quality,execution:binding.mode,device:binding.device.name,width:r.width,height:r.height,seed:r.seed,restoration:handoff.restoration};
  }catch(error){job.status=signal.aborted?'cancelled':'failed';job.progress=error.message;throw error;}
  finally{job.finished=Date.now();delete job.promise;}})();return job.promise;
 }
 async action(action,payload={},exec={}){if(action==='import')return importModels(payload.paths);if(action==='devices')return this.devices(true);if(action==='menu')return menu(this.settings.value);if(action==='status'||action==='list')return this.list();if(action==='configure')return this.settings.save(payload.settings);if(action==='browse')return this.browse(payload.path);if(action==='cancel'){this.jobs.get(payload.id)?.controller.abort();return {cancelled:true};}if(action==='setup'){if(this.setupPromise)throw Error('Runtime installation is already running.');const id=randomUUID(),controller=new AbortController(),job={id,status:'running',name:'Install image runtime',progress:'Preparing isolated Python environment',log:'',controller};this.jobs.set(id,job);const root=join(this.settings.root,'engine');await mkdir(root,{recursive:true});this.setupPromise=this.spawnWorker(job,process.platform==='win32'?'python':'python3',['-B',join(pkg,'scripts/setup.py'),root,...(payload.portable?['--portable-only']:[])],controller.signal,{HF_HUB_OFFLINE:'0',TRANSFORMERS_OFFLINE:'0'}).then(async()=>{const receipt=JSON.parse(await readFile(join(root,'receipt.json'),'utf8'));await this.settings.save({...this.settings.value,...receipt});job.status='complete';job.progress='Runtime installed';}).catch(e=>{job.status='failed';job.progress=e.message;}).finally(()=>{this.setupPromise=null;this.deviceCache=null;});return {id};}return this.render({...payload,action},exec);}
 async dispose(){this.closed=true;for(const job of this.jobs.values())job.controller.abort();await Promise.allSettled([...this.jobs.values()].map(j=>j.promise).filter(Boolean));await this.setupPromise;}
}

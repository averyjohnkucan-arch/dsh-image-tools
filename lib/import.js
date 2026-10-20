import {open,readFile,readdir,stat} from 'node:fs/promises';
import {basename,join,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';

// Inspect headers only. Never load tensor payloads, execute model code, or walk
// a user's entire model collection to guess a missing component.
async function evidence(path){
 const file=await open(path,'r');
 try{
  const prefix=Buffer.alloc(8);await file.read(prefix,0,8,0);
  if(/\.safetensors$/i.test(path)){
   const length=Number(prefix.readBigUInt64LE());
   if(length>0&&length<=16*1024*1024){const header=Buffer.alloc(length);await file.read(header,0,length,8);const value=JSON.parse(header);return Object.keys(value).slice(0,10000).join(' ')+' '+JSON.stringify(value.__metadata__||{});}
  }
  if(prefix.toString('ascii',0,4)==='GGUF'){
   const header=Buffer.alloc(256*1024);const {bytesRead}=await file.read(header,0,header.length,0);
   return header.subarray(0,bytesRead).toString('utf8');
  }
  if(/\.json$/i.test(path)&&(await file.stat()).size<=16*1024*1024)return await readFile(path,'utf8');
  return '';
 }finally{await file.close();}
}

export async function importModels(paths){
 if(!Array.isArray(paths)||!paths.length||paths.length>100||paths.some(p=>typeof p!=='string'||!isAbsolute(p)))throw Error('Select a model folder or up to 100 component files.');
 const files=[],warnings=[];
 for(const path of [...new Set(paths)]){
  if((await stat(path)).isDirectory()){
   try{
    const index=JSON.parse(await readFile(join(path,'model_index.json'),'utf8'));
    if(index._class_name==='QwenImage21Pipeline'){
     const variant=/turbo/i.test(path)?'turbo':'standard';
     if(variant==='turbo')throw Error('Select the Turbo denoiser and component files: this importer cannot establish a Turbo Diffusers sampling schedule.');
     return {profile:{id:'image-'+randomUUID(),name:basename(path),backend:'qwen-diffusers',variant,modelPath:path,tasks:['photograph','edit'],steps:40,guidance:1,enabled:true},warnings:['Detected Qwen Image 2.1 Diffusers. Review the checkpoint variant before saving.']};
    }
   }catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;}
   const entries=await readdir(path,{withFileTypes:true});
   files.push(...entries.filter(e=>e.isFile()&&/\.(gguf|safetensors|index\.json)$/i.test(e.name)).map(e=>join(path,e.name)));
  }else files.push(path);
 }
 if(files.length>100)throw Error('This folder has too many models. Select the files for one checkpoint instead.');
 const groups={modelPath:[],textEncoderPath:[],vaePath:[],projectorPath:[]};let family;
 for(const path of [...new Set(files)]){
  const name=basename(path),header=await evidence(path),hint=path+' '+header;
  const role=/mmproj|projector|v\.patch_embd|visual\.patch_embed/i.test(name+' '+header.slice(0,2000))?'projectorPath':/vae|first_stage_model|decoder\.up_blocks|decoder\.up\./i.test(name+' '+header)?'vaePath':/text.encoder|qwen[23][-_ .]?vl|token_embd|embed_tokens|text_model\.embeddings/i.test(name+' '+header)?'textEncoderPath':'modelPath';
  groups[role].push(path);
  if(role==='modelPath'){
   const detected=/krea/i.test(hint)?'krea':/qwen.?image|img_in\.weight|img_mod\.lin/i.test(hint)?'qwen':undefined;
   if(family&&detected&&family!==detected)throw Error('Selection contains multiple model families. Import one checkpoint at a time.');
   family ||= detected;
  }
 }
 const profile={id:'image-'+randomUUID(),name:'Imported image model',backend:family==='krea'?'krea-sdcpp':family==='qwen'?'qwen-sdcpp':'',variant:'',modelPath:'',textEncoderPath:'',vaePath:'',projectorPath:'',tasks:family==='krea'?['art']:['photograph'],steps:40,guidance:1,enabled:true};
 for(const [role,items] of Object.entries(groups)){
  const indexes=items.filter(p=>/\.index\.json$/i.test(p)),candidates=indexes.length?indexes:items;
  if(candidates.length===1)profile[role]=candidates[0];
  else if(candidates.length>1)warnings.push('Multiple candidates for '+role+'. Choose the correct file in the profile.');
 }
 if(!family)warnings.push('Model family could not be established. Choose Qwen or Krea before saving.');
 if(profile.modelPath){
  profile.name=basename(profile.modelPath);
  // Absence of “Turbo” is not proof of a regular checkpoint.
  profile.variant=/raw|standard|non[-_ ]?turbo/i.test(profile.modelPath)?'standard':/turbo/i.test(profile.modelPath)?'turbo':'';
  if(family==='krea'&&/convrot/i.test(profile.modelPath)){profile.backend='comfy-krea';warnings.push('INT8 ConvRot requires the ComfyUI CUDA runtime. Use a compatible BF16/GGUF profile for portable execution.');}
 }
 if(!profile.variant)warnings.push('Turbo versus non-Turbo is uncertain. Select the checkpoint variant.');
 profile.steps=profile.variant==='turbo'?8:family==='krea'?52:40;
 profile.guidance=family==='krea'?(profile.variant==='turbo'?0:3.5):1;
 if(family==='qwen'&&profile.projectorPath)profile.tasks.push('edit');
 for(const key of ['modelPath','textEncoderPath','vaePath'])if(!profile[key])warnings.push('Select '+key+' before saving.');
 return {profile,warnings};
}

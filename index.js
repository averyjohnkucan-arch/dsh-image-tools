import Schema from '@deepseek-ai/schemastery';import {defineTool} from '@deepseek-ai/dsh-tools';import {randomBytes,timingSafeEqual} from 'node:crypto';import {ImageRuntime} from './lib/runtime.js';
export const inject=['tools','attachments','webServer','sandboxPolicy'];
export const Config=Schema.object({dataDir:Schema.string().default('')});
const imageSchema={type:'object',additionalProperties:false,properties:{attachmentId:{type:'string',required:true},mediaType:{type:'string',required:true},bytes:{type:'integer',required:true},width:{type:'integer',required:true},height:{type:'integer',required:true},name:{type:'string'}}};
export async function apply(ctx,config){
 const runtime=new ImageRuntime(ctx,config.dataDir);await runtime.init();const token=randomBytes(32).toString('hex'),connection={path:'/plugins/dsh-image-tools/action',token};
 ctx.inject(['modelScheduler'],scope=>{scope.effect(()=>{runtime.scheduler=scope.get('modelScheduler');return()=>{runtime.scheduler=null;};});});
 ctx.on('webserver/index-inject',items=>items.push({kind:'global',name:'__DSH_IMAGE_TOOLS__',value:connection}));
 ctx.inject(['connection'],scope=>scope.effect(()=>ctx.webServer.register({kind:'exact',path:'/plugins/dsh-image-tools/connection',handler:async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='GET'||req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin()){res.writeHead(403);res.end();return;}if(!scope.connection.authorizeIndex(req,res))return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(connection));}})));
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:connection.path,handler:async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');const a=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,'')),b=Buffer.from(token);
  if(a.length!==b.length||!timingSafeEqual(a,b)){res.writeHead(401);res.end(JSON.stringify({error:'Owner capability required.'}));return;}
  if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')||req.headers.origin&&req.headers.origin!==ctx.webServer.getOrigin()){res.writeHead(403);res.end('{}');return;}
  try{let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)throw Error('Request too large.');body+=chunk;}const {action,payload={}}=JSON.parse(body);if(!['list','configure','browse','cancel','setup','menu','devices','import','progress'].includes(action))throw Error('Render images from an active conversation using Image Tools.');res.end(JSON.stringify({result:await runtime.action(action,payload)}));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
 }}));
 const parameters={
 prompt:{type:'string',required:true,description:'Describe the desired output. Expand brief requests into a clear visual scene while preserving the user intent. For edits, describe each input image in selected order.'},profile:{type:'string',description:'Optional saved image profile ID; otherwise the task default.'},execution:{type:'string',enum:['auto','gpu','igpu','cpu'],description:'gpu unloads the managed chat model, renders, then reloads it. CPU and iGPU keep the chat model loaded and can be much slower. auto chooses by the configured image-size threshold.'},quality:{type:'string',enum:['default','fast_normal_quality','slow_high_quality'],default:'default',description:'default uses the saved per-task checkpoint in Settings → Image Tools. fast_normal_quality selects the actual Turbo model. slow_high_quality selects a separate non-Turbo model: much slower, potentially better detail. These are different weights, not just different step counts.'},orientation:{type:'string',enum:['landscape','portrait'],description:'Portrait or landscape for SD, HD, 2K, 4K and 8K; square presets remain square.'},size:{type:'string',description:'Square256, Square512, Square1024, SD (480p), HD (720p), 2K (1080p), 4K (2160p), 8K (4320p). Defaults to Square512.',enum:['Square256','Square512','Square1024','SD','HD','2K','4K','8K','square-256','square-512','square-1024','720p-landscape','720p-portrait','1080p-landscape','1080p-portrait','4k-landscape','4k-portrait','8k-landscape','8k-portrait']},width:{type:'integer',description:'Custom pixel width; also specify height. Omit size when using custom dimensions.'},height:{type:'integer',description:'Custom pixel height; also specify width.'},confirm_large:{type:'boolean',description:'Set true only for an explicit user request for HD/4K/8K or other large output.'},image_ids:{type:'array',items:{type:'string'},description:'Editing only: full attachment IDs in input order. Omit for the latest attached images; supports 1–10.'},seed:{type:'integer'}};
 const output={schema:{type:'object',additionalProperties:false,properties:{data:{type:'string',required:true},image:imageSchema}},render:(_args,value)=>[{type:'text',text:value.data},...(value.image?[{type:'image',attachment:value.image}]:[])]};
 const common=' Call this tool directly; no menu or preparation call is needed. Omit quality to use the saved per-task default. fast_normal_quality selects actual Turbo weights; slow_high_quality selects separate non-Turbo weights and takes substantially longer. Size defaults to Square512; Square256, Square1024 and SD (480p) are available. HD (720p), 2K (1080p), 4K (2160p), 8K (4320p) and other large output require an explicit user request and confirm_large=true. Use orientation=portrait or landscape, or custom width and height. Local models; execution=gpu manages chat-model unload/render/reload, cpu or igpu keeps chat loaded but can be much slower, and auto follows the configured policy. Configure models and defaults in Settings → Image Tools.';
 const operations=[
  {name:'create_image',action:'generate_photograph',title:'Create image',description:'Create or generate a new photorealistic image or photograph from a text prompt using the configured local Qwen model. For artistic or stylized images use create_image_art; for changing an existing image use edit_image.'},
  {name:'create_image_art',action:'generate_art',title:'Create image art',description:'Create or generate a new artistic illustration, painting or stylized image from a text prompt using the configured local Krea model. For realistic photographs use create_image; for modifying existing images use edit_image.'},
  {name:'edit_image',action:'edit_image',title:'Edit image',description:'Edit, transform or combine one to ten images attached in this conversation using the configured local Qwen Image Heretic model. Describe the desired changes and each input in order. Supply image_ids to select specific attachments, or omit them for the latest attached images. Originals are preserved.'},
 ];
 function toolDefinition(operation){
  const schema=structuredClone(parameters);if(operation.name!=='edit_image')delete schema.image_ids;
  return {description:operation.description+common,parameters:schema,
   timeoutMs:14400000,isConcurrencySafe:()=>false,presentCall:args=>({card:'generic',title:operation.title,kind:'other',rawInput:args}),output,
   execute:async(args,exec)=>{
    if(!exec.agent)throw Error('Use an active conversation for image generation.');
    const result=await runtime.action(operation.action,{...args,action:operation.action},exec);
    const {image,...data}=result;return {data:JSON.stringify(data)+(image?'\nDisplay the finished image in your answer with Markdown: ![Image](<'+data.path+'>). This is a new file; originals were preserved.':''),...(image?{image}: {})};
   },
  };
 }
 for(const tool of [
  defineTool({name:'create_image',...toolDefinition(operations[0])}),
  defineTool({name:'create_image_art',...toolDefinition(operations[1])}),
  defineTool({name:'edit_image',...toolDefinition(operations[2])}),
 ])ctx.effect(()=>ctx.tools.register(tool));
 ctx.effect(()=>()=>runtime.dispose());
}

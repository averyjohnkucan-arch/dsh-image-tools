import Schema from '@deepseek-ai/schemastery';import {defineTool} from '@deepseek-ai/dsh-tools';import {randomBytes,timingSafeEqual} from 'node:crypto';import {ImageRuntime} from './lib/runtime.js';
import {routeImage} from './lib/routing.js';
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
  try{let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)throw Error('Request too large.');body+=chunk;}const {action,payload={}}=JSON.parse(body);if(!['list','configure','browse','cancel','setup','menu','devices','import','scanModels','progress','recommended','recommendedDownload','recommendedCancel'].includes(action))throw Error('Render images from an active conversation using Image Tools.');const result=await runtime.action(action,payload);
   res.end(JSON.stringify({result}));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
 }}));
 const parameters={
  prompt:{type:'string',required:true,description:'Describe the desired image in plain language. For a photo, name the subject, setting, framing and light when useful. For art, name the medium or visual style and the composition. For an edit, say what should change and what must stay the same. Identify multiple input images by their order. Preserve requested exact text in quotes and keep the user’s stated constraints.'},
  mode:{type:'string',enum:['auto','photo','art','edit'],default:'auto',description:'Optional. Use photo for realistic images, product shots, and photographed subjects with Qwen Turbo. Use art for illustrations, stylized graphics, and concept art with Krea Turbo. Use edit for an attached or previously generated image that the user wants changed, combined, or used as a reference with Qwen Turbo. Follow an explicitly requested model when it can do the task. Auto infers the route from the prompt. If the tool returns needs_clarification, ask its question before rendering.'},
  image_ids:{type:'array',items:{type:'string'},description:'For edits, list the full attachment IDs in input order. Omit to use the most recent images in this conversation. Supports 1–10.'},
  size:{type:'string',enum:['Square256','Square512','Square1024','SD','HD','2K','4K','8K','square-256','square-512','square-1024','720p-landscape','720p-portrait','1080p-landscape','1080p-portrait','4k-landscape','4k-portrait','8k-landscape','8k-portrait'],description:'Defaults to Square512. HD and larger sizes require an explicit user request and confirm_large=true.'},
  orientation:{type:'string',enum:['landscape','portrait'],description:'Optional orientation for nonsquare presets.'},
  width:{type:'integer',description:'Custom width in pixels. Supply height too and omit size.'},
  height:{type:'integer',description:'Custom height in pixels. Supply width too and omit size.'},
  confirm_large:{type:'boolean',description:'Set true for HD or large custom dimensions explicitly requested by the user.'},
  seed:{type:'integer',description:'Optional seed for a repeatable render.'},
  execution:{type:'string',enum:['auto','gpu','igpu','cpu'],description:'Optional device override. Omit to use the saved device policy.'},
 };
 const output={schema:{type:'object',additionalProperties:false,properties:{data:{type:'string',required:true},image:imageSchema}},render:(_args,value)=>[{type:'text',text:value.data},...(value.image?[{type:'image',attachment:value.image}]:[])]};
 const tool=defineTool({
  name:'create_image',
  description:'Create a new local image or edit conversation images. Qwen Image 2.1 Turbo handles photographs, realistic scenes, and edits. Krea 2 Turbo handles illustrations and stylized artwork. Call directly with a prompt. Pick the mode when the user’s intent makes the best route clear. Leave it on auto for a straightforward prompt without a model preference. Ask one short question only when a missing detail would materially change the result.',
  parameters,output,timeoutMs:14400000,isConcurrencySafe:()=>false,
  presentCall:args=>({card:'generic',title:'Create image',kind:'other',rawInput:args}),
  async execute(args,exec){
   if(!exec.agent)throw Error('Use an active conversation for image generation.');
   const {action,question}=routeImage(args,()=>exec.agent.session?.snapshotEvents?.()||[]);
   if(question)return {data:JSON.stringify({status:'needs_clarification',question})};
   const {prompt,image_ids,size,orientation,width,height,confirm_large,seed,execution}=args;
   let result;
   try {
    result=await runtime.action(action,{action,prompt,image_ids,size,orientation,width,height,confirm_large,seed,execution,quality:'fast_normal_quality'},exec);
   } catch (error) {
    if(error.code!=='IMAGE_ATTACHMENT_REQUIRED')throw error;
    return {data:JSON.stringify({status:'needs_clarification',question:'Can you attach the image you want changed?'})};
   }
   const {image,...data}=result;
   return {data:JSON.stringify({...data,action})+(image?'\nDisplay the finished image with Markdown: ![Image](<'+data.path+'>).':''),...(image?{image}:{})};
  },
 });
 ctx.effect(()=>ctx.tools.register(tool));
 ctx.effect(()=>()=>runtime.dispose());
}

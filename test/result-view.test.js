import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
async function fixture(overrides={}){
 const entries=[],effects=[],state=[];let cursor=0,plugin;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>{const i=cursor++;state[i]??=initial;return [state[i],v=>{state[i]=v;}];},useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{AbortController,setTimeout,clearTimeout,...overrides,window:{__DSH_IMAGE_TOOLS__:{path:'/plugins/dsh-image-tools/action',token:'fixture'},__ModuleLoader__:{load:def=>{plugin=def.factory(name=>{if(name==='react')return React;if(name==='@deepseek-ai/dsh-client-ui-primitives')return {DisclosureRow:'DisclosureRow',IconSparkleRegular:'IconSparkleRegular'};throw Error(name);});}}},console});
 plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(entry,component)=>{entries.push({entry,component});return()=>{};}}});
 const render=(component,props)=>{cursor=0;return component({useDisclosure:()=>({expanded:true,toggle(){}}),...props});};
 return {entries,effects,render};
}
const image={attachmentId:'sha256:'+'a'.repeat(64),mediaType:'image/png',bytes:123,width:512,height:512,name:'generated-image.png'};
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...tree.children.flat(Infinity).flatMap(nodes),...nodes(tree.props?.collapsedContent)];}
test('public keyed image_tools view renders saved image blocks without assistant Markdown',async()=>{
 const f=await fixture();const view=f.entries.find(x=>x.entry.name==='tool.call.toolview'&&x.entry.key==='image_tools');assert.equal(view.entry.key,'image_tools');
 const loaded=[],loadImage=async ref=>{loaded.push(ref);return 'blob:authorized-preview';};
 const tree=f.render(view.component,{phase:'result',block:{call:{argsRaw:'{"action":"generate_photograph"}'},content:[{type:'text',text:'{"path":"dsh-images/result.png"}'},{type:'image',attachment:image}],isError:false},loadImage});
 assert.ok(nodes(tree).some(x=>x.type==='DisclosureRow'&&x.props.title==='Tool call'&&x.props.keepContentWhenOpen&&x.props.expandOnRowClick));
 assert.ok(nodes(tree).some(x=>x.children.includes('generate_photograph')));
 const figure=nodes(tree).find(x=>typeof x.type==='function');assert.ok(figure);
 f.render(figure.type,figure.props);f.effects.at(-1)();await new Promise(r=>setImmediate(r));
 const loadedTree=f.render(figure.type,figure.props);assert.deepEqual(loaded,[image]);
 assert.ok(nodes(loadedTree).some(x=>x.type==='img'&&x.props.src==='blob:authorized-preview'));
 assert.ok(nodes(loadedTree).some(x=>x.type==='a'&&x.props.target==='_blank'));
});
test('failed and running calls show status instead of a nonexistent image',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
 const failed=f.render(view,{phase:'result',block:{content:[{type:'text',text:'Renderer exited: device lost'}],isError:true}});
 assert.ok(nodes(failed).some(x=>x.children.includes('Error: Renderer exited: device lost')));assert.equal(nodes(failed).filter(x=>typeof x.type==='function').length,0);
 const running=f.render(view,{phase:'start',block:{}});assert.ok(nodes(running).some(x=>x.props.role==='status'));
});
test('attachment load failure is visible and does not leave an endless spinner',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
 const tree=f.render(view,{phase:'result',block:{content:[{type:'image',attachment:image}]},loadImage:async()=>{throw Error('not found');}}),figure=nodes(tree).find(x=>typeof x.type==='function');
 f.render(figure.type,figure.props);f.effects.at(-1)();await new Promise(r=>setImmediate(r));
 assert.ok(nodes(f.render(figure.type,figure.props)).some(x=>x.props.role==='alert'));
});

test('closed image call uses the native disclosure and lazily mounts output',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
 const tree=f.render(view,{phase:'result',block:{content:[{type:'image',attachment:image}],call:{argsRaw:'{"action":"generate_photograph"}'}},useDisclosure:()=>({expanded:false,toggle(){}})});
 assert.ok(nodes(tree).some(x=>x.type==='DisclosureRow'&&x.props.open===false&&x.props.title==='Tool call'));
 assert.equal(nodes(tree).filter(x=>typeof x.type==='function').length,0);
});

test('image caption shows persisted total elapsed time, or historical call duration',async()=>{
 for(const [data,block,expected] of [['{"timing":{"totalMs":72300}}',{},'Total time: 1m 12.3s'],['{}',{callTime:1000,time:35500},'Total time: 34.5s']]){
  const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
  const tree=f.render(view,{phase:'result',block:{...block,content:[{type:'text',text:data},{type:'image',attachment:image}]},loadImage:async()=> 'blob:preview'});
  const figure=nodes(tree).find(x=>typeof x.type==='function');
  assert.ok(JSON.stringify(f.render(figure.type,figure.props)).includes(expected));
 }
});
test('three direct tool names each render native image results and keep legacy history support',async()=>{
 const f=await fixture();
 assert.deepEqual(f.entries.filter(x=>x.entry.name==='tool.call.toolview').map(x=>x.entry.key),['create_image','create_image_art','edit_image','image_tools']);
 for(const name of ['create_image','create_image_art','edit_image']){
  const view=f.entries.find(x=>x.entry.key===name).component;
  const tree=f.render(view,{phase:'result',block:{call:{argsRaw:'{"prompt":"scene"}'},content:[{type:'image',attachment:image}],isError:false}});
  assert.ok(nodes(tree).some(x=>x.children.includes({create_image:'generate_photograph',create_image_art:'generate_art',edit_image:'edit_image'}[name])));assert.ok(nodes(tree).some(x=>typeof x.type==='function'&&x.props.attachment===image));
 }
});
test('native operation label updates percentage by exact call and stops polling on unmount',async()=>{
 const pending=[],requests=[];let percentage=10,cleared;
 const f=await fixture({fetch:async(url,options)=>{requests.push({url,options});return {ok:true,status:200,json:async()=>({result:{status:'running',percent:percentage}})};},setTimeout:fn=>{pending.push(fn);return 17;},clearTimeout:id=>{cleared=id;}});
 const view=f.entries.find(x=>x.entry.key==='create_image_art').component;
 const props={phase:'start',callId:'this-call-only',block:{},useDisclosure:()=>({expanded:false,toggle(){}})};
 f.render(view,props);const cleanup=f.effects[0]();await new Promise(r=>setImmediate(r));
 const tree=f.render(view,props);assert.ok(nodes(tree).some(x=>x.props.className==='dit-native-summary'&&x.children.includes('generate_art | 10%')));
 assert.equal(JSON.parse(requests[0].options.body).payload.callId,'this-call-only');assert.ok(nodes(tree).some(x=>x.type==='DisclosureRow'&&x.props.title==='Tool call'));
 percentage=27;await pending.shift()();assert.ok(nodes(f.render(view,props)).some(x=>x.children.includes('generate_art | 27%')));
 cleanup();assert.equal(cleared,17);assert.equal(requests[0].options.signal.aborted,true);
});
test('completed image cards render at the turn tail outside collapsed tools, with no model response required',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.id==='dsh-image-tools.outputs').component;
 const root={kind:'tool-result',name:'create_image_art',content:[{type:'image',attachment:image}]};
 const snapshot={locations:{getTurn:turn=>turn===7?['a','duplicate','error','running','other']:[]},nodes:{get:key=>({kind:'tool-call',data:{root:key==='error'?{...root,isError:true}:key==='running'?{...root,kind:'tool-call'}:key==='other'?{...root,name:'unrelated'}:root}})}};
 const tree=f.render(view,{turn:7,useImageChat:fn=>fn(snapshot),loadImage:async()=> 'blob:preview'});
 assert.equal(tree.props['data-generated-images'],true);assert.equal(nodes(tree).filter(x=>typeof x.type==='function').length,1,'deduplicate attachments');
 assert.equal(f.render(view,{turn:8,useImageChat:fn=>fn(snapshot)}),null,'no cross-turn images');
});

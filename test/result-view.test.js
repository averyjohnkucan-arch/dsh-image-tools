import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
async function fixture(){
 const entries=[],effects=[],state=[];let cursor=0,plugin;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>{const i=cursor++;state[i]??=initial;return [state[i],v=>{state[i]=v;}];},useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(await readFile(new URL('../client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:def=>{plugin=def.factory(name=>{assert.equal(name,'react');return React;});}}},console});
 plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(entry,component)=>{entries.push({entry,component});return()=>{};}}});
 const render=(component,props)=>{cursor=0;return component(props);};
 return {entries,effects,render};
}
const image={attachmentId:'sha256:'+'a'.repeat(64),mediaType:'image/png',bytes:123,width:512,height:512,name:'generated-image.png'};
function nodes(tree){return !tree||typeof tree!=='object'?[]:[tree,...tree.children.flat(Infinity).flatMap(nodes)];}
test('public keyed image_tools view renders saved image blocks without assistant Markdown',async()=>{
 const f=await fixture();const view=f.entries.find(x=>x.entry.name==='tool.call.toolview');assert.equal(view.entry.key,'image_tools');
 const loaded=[],loadImage=async ref=>{loaded.push(ref);return 'blob:authorized-preview';};
 const tree=f.render(view.component,{phase:'result',block:{call:{argsRaw:'{"action":"generate_photograph"}'},content:[{type:'text',text:'{"path":"dsh-images/result.png"}'},{type:'image',attachment:image}],isError:false},loadImage});
 assert.ok(nodes(tree).some(x=>x.type==='summary'&&x.children[0]==='Generate photograph — 1 image ready'));
 const figure=nodes(tree).find(x=>typeof x.type==='function');assert.ok(figure);
 f.render(figure.type,figure.props);f.effects.at(-1)();await new Promise(r=>setImmediate(r));
 const loadedTree=f.render(figure.type,figure.props);assert.deepEqual(loaded,[image]);
 assert.ok(nodes(loadedTree).some(x=>x.type==='img'&&x.props.src==='blob:authorized-preview'));
 assert.ok(nodes(loadedTree).some(x=>x.type==='a'&&x.props.target==='_blank'));
});
test('failed and running calls show status instead of a nonexistent image',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
 const failed=f.render(view,{phase:'result',block:{content:[{type:'text',text:'Renderer exited: device lost'}],isError:true}});
 assert.ok(nodes(failed).some(x=>x.type==='summary'&&x.children[0]==='Image Tools — Failed'));assert.equal(nodes(failed).filter(x=>typeof x.type==='function').length,0);
 const running=f.render(view,{phase:'start',block:{}});assert.ok(nodes(running).some(x=>x.props.role==='status'));
});
test('attachment load failure is visible and does not leave an endless spinner',async()=>{
 const f=await fixture(),view=f.entries.find(x=>x.entry.key==='image_tools').component;
 const tree=f.render(view,{phase:'result',block:{content:[{type:'image',attachment:image}]},loadImage:async()=>{throw Error('not found');}}),figure=nodes(tree).find(x=>typeof x.type==='function');
 f.render(figure.type,figure.props);f.effects.at(-1)();await new Promise(r=>setImmediate(r));
 assert.ok(nodes(f.render(figure.type,figure.props)).some(x=>x.props.role==='alert'));
});

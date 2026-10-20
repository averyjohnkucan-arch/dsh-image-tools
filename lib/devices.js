export function parseDevices(stdout,stderr=''){
 return stdout.split('\n').filter(line=>line.includes('\t')).map(line=>{
  const [name,...rest]=line.split('\t'),description=rest.join('\t').trim();
  const vendor=/NVIDIA/i.test(description)?'nvidia':/AMD|Radeon/i.test(description)?'amd':/Intel/i.test(description)?'intel':'other';
  const index=/^Vulkan(\d+)$/i.exec(name.trim())?.[1];
  const diagnostic=index===undefined?'':stderr.split('\n').find(l=>new RegExp('(?:^|: )'+index+' = ').test(l))||'';
  const integrated=/uma: 1/.test(diagnostic)||!diagnostic&&/Intel.*(?:Graphics|Iris|UHD)|AMD Radeon\(TM\) Graphics/i.test(description);
  return {name:name.trim(),description,vendor,kind:/^CPU$/i.test(name.trim())?'cpu':integrated?'igpu':'gpu'};
 });
}

export function chooseExecution(args,settings,profile,profiles,devices=[]){
 const requested=args.execution||settings.execution||'gpu';
 if(!['auto','cpu','igpu','gpu'].includes(requested))throw Error('Execution must be auto, cpu, igpu or gpu.');
 let mode=requested==='auto'?(args.width*args.height<=(settings.autoMaxPixels??262144)?'igpu':'gpu'):requested;
 if(requested==='auto'&&mode==='igpu'&&!devices.some(d=>d.kind==='igpu'))mode='cpu';
 const native=p=>['qwen-sdcpp','krea-sdcpp'].includes(p.backend);
 const pick=kind=>{
  const override=kind==='igpu'?settings.sdIgpuDevice:settings.sdDevice;
  if(override){const d=devices.find(d=>d.name.toLowerCase()===override.toLowerCase());if(!d||d.kind!==kind)throw Error('Configured '+kind+' device is unavailable or has the wrong device type: '+override);return d;}
  const options=devices.filter(d=>d.kind===kind);
  const preferred=options.filter(d=>d.vendor==='nvidia');const pool=preferred.length?preferred:options;const cuda=pool.filter(d=>/^CUDA/.test(d.name));const candidates=cuda.length?cuda:pool;return candidates[kind==='gpu'?(settings.gpu||0):0];
 };
 let device=mode==='cpu'?devices.find(d=>d.kind==='cpu'):pick(mode);
 if(mode==='igpu'&&!device)throw Error('No integrated Vulkan GPU is available. Choose CPU or install a compatible Intel/AMD Vulkan driver.');
 // Existing CUDA profiles may have a portable equivalent using the same
 // checkpoint at another supported tensor precision.
 let selected=profile;
 if(!native(selected)&&(mode!=='gpu'||device&&device.vendor!=='nvidia')){
  selected=profiles.find(p=>p.id===profile.portableProfile&&p.enabled!==false&&native(p)&&p.variant===profile.variant&&profile.tasks.every(t=>p.tasks.includes(t)));
  if(!selected)throw Error('Configure a portable GGUF/Safetensors profile for this checkpoint before using CPU, iGPU or a non-NVIDIA GPU.');
 }
 if(native(selected)){
  if(!device)throw Error('No matching runtime device was found. Install the portable runtime and a compatible Vulkan driver, or select CPU.');
  return {mode,requested,profile:selected,device};
 }
 return {mode,requested,profile:selected,device:{name:'CUDA'+settings.gpu,vendor:'nvidia',kind:'gpu',description:'NVIDIA GPU '+settings.gpu}};
}

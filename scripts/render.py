"""Private one-job renderer. Model files are read-only; no old Local AI imports."""
import json,os,pathlib,socket,subprocess,sys,threading,time,urllib.request

def finish(image,job):
    from PIL import Image,ImageOps
    size=(job['width'],job['height'])
    if image.size!=size:image=ImageOps.fit(image,size,method=Image.Resampling.LANCZOS)
    target=pathlib.Path(job['output']);temp=target.with_suffix('.partial.png')
    image.save(temp,format='PNG');os.replace(temp,target)
    print('DSH_IMAGE_RESULT='+json.dumps({'width':size[0],'height':size[1],'path':str(target)}),flush=True)

def qwen(job):
    import torch
    from PIL import Image,ImageOps
    from diffusers import QwenImage21Pipeline
    torch.set_num_threads(min(16,os.cpu_count() or 4))
    pipe=QwenImage21Pipeline.from_pretrained(job['profile']['modelPath'],torch_dtype=torch.bfloat16,local_files_only=True,low_cpu_mem_usage=True)
    if os.environ.get('DSH_IMAGE_OFFLOAD')=='sequential':pipe.enable_sequential_cpu_offload(gpu_id=job['gpu'])
    else:pipe.enable_model_cpu_offload(gpu_id=job['gpu'])
    pipe.vae.enable_tiling()
    kwargs=dict(prompt=job['prompt'],negative_prompt=' ',true_cfg_scale=job['profile']['guidance'],width=((job['width']+15)//16)*16,height=((job['height']+15)//16)*16,num_inference_steps=job['steps'],output_resolution=min(512,max(job['width'],job['height'])) if job['profile']['variant']=='turbo' else 1024,generator=torch.Generator(device='cpu').manual_seed(job['seed']))
    if job['task']=='edit':
        images=[]
        for path in job['inputs']:
            with Image.open(path) as image:images.append(ImageOps.exif_transpose(image).convert('RGB'))
        kwargs['image']=images
    def progress(_pipe,step,_time,values):print(f'Step {step+1}/{job["steps"]}',flush=True);return values
    kwargs['callback_on_step_end']=progress
    with torch.inference_mode():result=pipe(**kwargs).images[0]
    finish(result,job)

# Official Qwen Turbo checkpoint sample_sigmas, with the terminal zero.
QWEN_TURBO_SIGMAS='1.0,0.978453,0.95418,0.926626,0.89508,0.845148,0.704534,0.414568,0.0'

def sdcpp_device(job):
    if job.get('sdDevice'):return job['sdDevice']
    devices=subprocess.run([job['sdExecutable'],'--list-devices'],capture_output=True,text=True,check=True,timeout=30).stdout
    gpu_name=subprocess.run(['nvidia-smi',f'--id={job["gpu"]}','--query-gpu=name','--format=csv,noheader'],capture_output=True,text=True,check=True,timeout=10).stdout.strip().casefold()
    matches=[]
    for line in devices.splitlines():
        if '\t' not in line:continue
        name,description=line.split('\t',1)
        if gpu_name==description.strip().casefold() or gpu_name in description.casefold():matches.append(name.strip())
    for prefix in ('CUDA','Vulkan'):
        found=[name for name in matches if name.upper().startswith(prefix.upper())]
        if len(found)==1:return found[0]
        if len(found)>1:raise RuntimeError('Several identical GPU devices detected; set the SD device explicitly in Image Tools settings.')
    raise RuntimeError('Could not match the selected NVIDIA GPU to sd-cli. Choose an explicit CUDA/Vulkan SD device in Image Tools settings.')

def sdcpp_args(job,device):
    p=job['profile'];output=str(pathlib.Path(job['directory'])/'native.png')
    args=[job['sdExecutable'],'--diffusion-model',p['modelPath'],'--llm',p['textEncoderPath'],'--vae',p['vaePath'],
          '--backend',device,'--offload-to-cpu','--diffusion-fa','--vae-tiling',
          '--sampling-method','euler','--steps',str(job['steps']),'--cfg-scale',str(1+p['guidance'] if p['backend']=='krea-sdcpp' else p['guidance']),
          '-W',str(((job['width']+15)//16)*16),'-H',str(((job['height']+15)//16)*16),
          '--seed',str(job['seed']),'-p',job['prompt'],'-o',output]
    if p['variant']=='turbo' and p['backend']=='qwen-sdcpp':
        if job['steps']!=8 or p['guidance']!=1:raise ValueError('Qwen Turbo requires its fixed 8-step CFG 1 schedule.')
        args+=['--sigmas',QWEN_TURBO_SIGMAS]
    if p['backend']=='krea-sdcpp':args+=['--flow-shift','1.15']
    if job['task']=='edit':
        args+=['--llm_vision',p['projectorPath']]
        for image in job['inputs']:args+=['-r',image]
    return args,output

def sdcpp(job):
    from PIL import Image
    args,output=sdcpp_args(job,sdcpp_device(job))
    subprocess.run(args,check=True,cwd=job['directory'])
    with Image.open(output) as image:finish(image.copy(),job)

def comfy(job):
    from PIL import Image
    root=pathlib.Path(job['directory']);rendered=root/'rendered';rendered.mkdir(exist_ok=True)
    user=root/'comfy-user';user.mkdir(exist_ok=True)
    profile=job['profile']
    paths={'dsh_image':{'diffusion_models':str(pathlib.Path(profile['modelPath']).parent),'text_encoders':str(pathlib.Path(profile['textEncoderPath']).parent),'vae':str(pathlib.Path(profile['vaePath']).parent)}}
    extra=root/'model-paths.json';extra.write_text(json.dumps(paths))
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    command=[sys.executable,'-B',str(pathlib.Path(job['comfySource'])/'main.py'),'--listen','127.0.0.1','--port',str(port),'--disable-auto-launch','--disable-all-custom-nodes','--offline','--base-directory',str(root),'--user-directory',str(user),'--output-directory',str(rendered),'--extra-model-paths-config',str(extra),'--cuda-device',str(job['gpu']),'--lowvram','--preview-method','none','--disable-metadata']
    child=subprocess.Popen(command,cwd=job['comfySource'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
    ready=threading.Event()
    def logs():
        for line in child.stdout:
            print(line.rstrip(),flush=True)
            # This is emitted after TCPSite successfully binds. Never attach to an arbitrary server on the port.
            if 'To see the GUI go to:' in line:ready.set()
    threading.Thread(target=logs,daemon=True).start()
    base='http://127.0.0.1:'+str(port)
    def api(route,data=None):
        request=urllib.request.Request(base+route,data=None if data is None else json.dumps(data).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=60) as response:return json.load(response)
    try:
        deadline=time.monotonic()+180
        while not ready.wait(.2):
            if child.poll() is not None:raise RuntimeError('ComfyUI stopped before binding its private server')
            if time.monotonic()>deadline:raise RuntimeError('ComfyUI startup timed out')
        graph={
          '1':{'class_type':'UNETLoader','inputs':{'unet_name':pathlib.Path(profile['modelPath']).name,'weight_dtype':'default'}},
          '2':{'class_type':'CLIPLoader','inputs':{'clip_name':pathlib.Path(profile['textEncoderPath']).name,'type':'krea2','device':'default'}},
          '3':{'class_type':'VAELoader','inputs':{'vae_name':pathlib.Path(profile['vaePath']).name}},
          '4':{'class_type':'CLIPTextEncode','inputs':{'text':job['prompt'],'clip':['2',0]}},
          '5':{'class_type':'CLIPTextEncode','inputs':{'text':'','clip':['2',0]}},
          '6':{'class_type':'EmptySD3LatentImage','inputs':{'width':((job['width']+15)//16)*16,'height':((job['height']+15)//16)*16,'batch_size':1}},
          '7':{'class_type':'KSampler','inputs':{'model':['1',0],'positive':['4',0],'negative':['5',0],'latent_image':['6',0],'seed':job['seed'],'steps':job['steps'],'cfg':1+profile['guidance'],'sampler_name':'euler','scheduler':'simple','denoise':1.0}},
          '8':{'class_type':'VAEDecode','inputs':{'samples':['7',0],'vae':['3',0]}},
          '9':{'class_type':'SaveImage','inputs':{'images':['8',0],'filename_prefix':'image'}}}
        if profile['guidance']==0:graph['5']={'class_type':'ConditioningZeroOut','inputs':{'conditioning':['4',0]}}
        response=api('/prompt',{'prompt':graph,'client_id':job['id']})
        if response.get('node_errors') or not response.get('prompt_id'):raise RuntimeError('ComfyUI rejected the image workflow: '+json.dumps(response))
        prompt_id=response['prompt_id'];deadline=time.monotonic()+job['timeoutMs']/1000
        while time.monotonic()<deadline:
            if child.poll() is not None:raise RuntimeError('ComfyUI exited during generation')
            history=api('/history/'+prompt_id).get(prompt_id)
            if history:
                status=history.get('status',{})
                if status.get('status_str')=='error':raise RuntimeError('ComfyUI generation failed: '+json.dumps(status.get('messages',[]))[-5000:])
                images=history.get('outputs',{}).get('9',{}).get('images',[])
                if images:
                    file=images[0];name=file['filename']
                    if pathlib.Path(name).name!=name or file.get('subfolder','') or file.get('type')!='output':raise RuntimeError('Unexpected image output location')
                    with Image.open(rendered/name) as image:finish(image.copy(),job)
                    return
            time.sleep(.5)
        raise RuntimeError('Image generation timed out')
    finally:
        if child.poll() is None:
            child.terminate()
            try:child.wait(timeout=10)
            except subprocess.TimeoutExpired:child.kill();child.wait(timeout=10)

if __name__=='__main__':
    job=json.loads(pathlib.Path(sys.argv[1]).read_text())
    if job['profile']['backend']=='qwen-diffusers':
        import torch
        try:qwen(job)
        except torch.OutOfMemoryError:
            print('DSH_IMAGE_RETRY_LOW_MEMORY',flush=True)
            raise SystemExit(75)
    elif job['profile']['backend'] in ('qwen-sdcpp','krea-sdcpp'):sdcpp(job)
    elif job['profile']['backend']=='comfy-krea':comfy(job)
    else:raise ValueError('Unsupported image backend')

import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('renderer', pathlib.Path(__file__).parents[1] / 'scripts' / 'render.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

class NativeArguments(unittest.TestCase):
    def job(self, variant='turbo'):
        return dict(sdExecutable='/runtime/sd-cli', directory='/job', task='photograph', width=777, height=333, steps=8 if variant=='turbo' else 40, seed=42, prompt='a mug', inputs=[], profile=dict(backend='qwen-sdcpp',variant=variant, modelPath='/models/'+variant+'.gguf', textEncoderPath='/models/heretic.gguf', vaePath='/models/vae.safetensors', projectorPath='/models/projector.gguf', guidance=1))

    def test_turbo_uses_its_own_checkpoint_and_exact_schedule(self):
        args, _ = renderer.sdcpp_args(self.job(), 'Vulkan1')
        self.assertEqual(args[args.index('--diffusion-model')+1], '/models/turbo.gguf')
        self.assertEqual(args[args.index('--sigmas')+1], renderer.QWEN_TURBO_SIGMAS)
        self.assertEqual(args[args.index('--backend')+1], 'Vulkan1')
        self.assertEqual(args[args.index('-W')+1], '784')

    def test_standard_uses_separate_weights_without_turbo_schedule(self):
        args, _ = renderer.sdcpp_args(self.job('standard'), 'CUDA0')
        self.assertEqual(args[args.index('--diffusion-model')+1], '/models/standard.gguf')
        self.assertNotIn('--sigmas', args)
        self.assertEqual(args[args.index('--steps')+1], '40')

    def test_krea_native_guidance_maps_to_cfg_and_shift(self):
        for variant, guidance, cfg in [('turbo', 0, '1'), ('standard', 3.5, '4.5')]:
            job=self.job(variant);job['profile'].update(backend='krea-sdcpp',guidance=guidance)
            args, _ = renderer.sdcpp_args(job, 'Vulkan0')
            self.assertEqual(args[args.index('--cfg-scale')+1], cfg)
            self.assertEqual(args[args.index('--flow-shift')+1], '1.15')
            self.assertNotIn('--sigmas', args)

    def test_memory_placement_preserves_sampling_and_selected_device(self):
        for device in ['Vulkan1','Vulkan0','CUDA0','CPU']:
            baseline,_=renderer.sdcpp_args(self.job(),device)
            for placement in ['diffusion','resident','auto']:
                job=self.job();job['profile'].update(nativeWeights=placement,nativeVramGiB=22.695)
                args,_=renderer.sdcpp_args(job,device)
                self.assertNotIn('--offload-to-cpu',args)
                for flag in ['--diffusion-model','--llm','--vae','--sigmas','--steps','--cfg-scale','--sampling-method','--seed','-W','-H']:
                    self.assertEqual(args[args.index(flag)+1],baseline[baseline.index(flag)+1])
                if placement=='diffusion':self.assertEqual(args[args.index('--params-backend')+1],f'diffusion={device},te=cpu,vae=cpu')
                if device=='CPU':self.assertNotIn('--max-vram',args)
                else:self.assertEqual(args[args.index('--max-vram')+1],f'{device}=22.695')

    def test_automatic_vae_keeps_full_sampling_schedule(self):
        job=self.job();job['profile']['nativeVaeTiling']=False
        args,_=renderer.sdcpp_args(job,'Vulkan1')
        self.assertNotIn('--vae-tiling',args)
        self.assertEqual(args[args.index('--steps')+1],'8')
        self.assertEqual(args[args.index('--sigmas')+1],renderer.QWEN_TURBO_SIGMAS)

    def test_performance_hold_is_scoped_to_native_linux_gpu_child(self):
        args=['/runtime/sd-cli','--steps','8']
        with patch.object(renderer.sys,'platform','linux'),patch.object(renderer.shutil,'which',return_value='/usr/bin/powerprofilesctl'):
            command=renderer.native_command(dict(performanceHold=True,execution='gpu'),args)
            self.assertEqual(command[-len(args):],args)
            self.assertEqual(command[:4],['/usr/bin/powerprofilesctl','launch','--profile','performance'])
            for execution in ['cpu','igpu']:
                self.assertEqual(renderer.native_command(dict(performanceHold=True,execution=execution),args),args)
        with patch.object(renderer.sys,'platform','win32'):
            self.assertEqual(renderer.native_command(dict(performanceHold=True,execution='gpu'),args),args)

    def test_unavailable_requested_performance_hold_fails_clearly(self):
        with patch.object(renderer.sys,'platform','linux'),patch.object(renderer.shutil,'which',return_value=None):
            with self.assertRaisesRegex(RuntimeError,'powerprofilesctl'):
                renderer.native_command(dict(performanceHold=True,execution='gpu'),['/runtime/sd-cli'])

    def test_multi_image_edit_keeps_reference_order_and_projector(self):
        job=self.job();job.update(task='edit', inputs=['/job/first.png','/job/second.png'])
        args, _ = renderer.sdcpp_args(job, 'Vulkan1')
        self.assertEqual([args[i+1] for i,v in enumerate(args) if v=='-r'], job['inputs'])
        self.assertEqual(args[args.index('--llm_vision')+1], '/models/projector.gguf')

if __name__=='__main__': unittest.main()

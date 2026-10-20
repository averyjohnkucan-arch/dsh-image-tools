import importlib.util
import pathlib
import unittest

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

    def test_multi_image_edit_keeps_reference_order_and_projector(self):
        job=self.job();job.update(task='edit', inputs=['/job/first.png','/job/second.png'])
        args, _ = renderer.sdcpp_args(job, 'Vulkan1')
        self.assertEqual([args[i+1] for i,v in enumerate(args) if v=='-r'], job['inputs'])
        self.assertEqual(args[args.index('--llm_vision')+1], '/models/projector.gguf')

if __name__=='__main__': unittest.main()

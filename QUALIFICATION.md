# Qualification — 2026-10-20

Version 0.2.0 was tested on Linux, Node 22.22, DeepSeek Harness 0.2.1-rc.2, RTX PRO 5000 Blackwell Laptop (24 GB), Intel Graphics (ARL) Vulkan iGPU, and Intel Core Ultra 9 285HX CPU. These are individual samples, not throughput benchmarks.

| Actual checkpoint / operation | Device / backend | Size | Steps | Elapsed |
| --- | --- | --- | ---: | ---: |
| Qwen Turbo Q8 + Heretic Q8 encoder, photograph | NVIDIA Vulkan | 512² | 8 | 23.9 s |
| Qwen Turbo, two-reference colour edit | NVIDIA Vulkan | 512² | 8 | 95.4 s |
| Qwen regular Heretic, photograph | NVIDIA CUDA / Diffusers | 512² | 40 | 38.1 s |
| Qwen regular BF16 denoiser + compatible Heretic Q8 encoder, photograph | NVIDIA Vulkan | 512² | 40 | 55.8 s |
| Qwen Turbo photograph | Intel Vulkan iGPU | 256² | 8 | 107.3 s |
| Qwen Turbo photograph | CPU | 256² | 8 | 67.8 s |
| Krea Turbo BF16 + Heretic encoder, art | NVIDIA Vulkan | 256² | 8 | 41.1 s |
| Krea Raw INT8 ConvRot + Heretic encoder, art | NVIDIA CUDA / ComfyUI | 256² | 52 | 35.7 s |

Outputs were visually inspected. The two-reference edit changed the blue mug to red while retaining its scene. CPU and iGPU runs reported their concrete devices and did not unload a chat model. The Intel test overlapped a separate NVIDIA render. Timings vary with precision, CPU offload, driver and concurrent activity; these samples do not establish a general CPU-versus-iGPU ranking.

The compatible portable Qwen regular profile uses the local regular denoiser's Safetensors shard index and a separate native-compatible Heretic encoder/VAE. Its original Diffusers text-encoder shard layout failed native metadata validation and was replaced in the machine profile, without modifying any source weights.

The lightweight managed CPU/Vulkan installer completed on Linux using private Python/Pillow and the checksum-pinned official native release. An installer regression found during testing could overwrite active mapped libraries; it was fixed by staging into a versioned runtime directory. The subsequent CPU render completed successfully.

Model import was checked against actual local Qwen Turbo component files, Krea BF16 component files and the complete Qwen Diffusers folder. Automated fixtures cover ambiguous selections, unknown variants and shard-index preference. No tensor payload is loaded by detection.

23 JavaScript tests plus 4 Python tests pass: exact size presets/orientation, actual separate quality checkpoints, migration, metadata import, device routing, local serialization without scheduler admission, real Cordis tool registration/disposal, owner authorization, guidance translation and owned process cancellation. The package tarball contains plugin code, assets and runtime installers; it contains no private model paths, weights, prompts or generated images.

Earlier integration qualification remains valid for the scheduler/attachment interfaces:

- NInfer DFlash2 answered `ready`, unloaded for rendering, restored, and answered `restored`.
- Full version-0.2.0 browser acceptance from a GitHub-installed profile: NInfer discovered/selected the single `image_tools` menu, generated with `fast_normal_quality`, `Square256`, GPU execution and seed 42, restored and displayed the image inline. End-to-end time was 2m 15s, including tool discovery and model loading.
- Generated PNG data passed through the actual DSH local attachment store.
- The current installation uses the local plugin source, existing Tool Manager policy and public Image Tools settings slot.

Not hardware-qualified: Windows, AMD GPUs, every quantization/tensor layout, HD/4K/8K memory fit, and the CUDA out-of-memory retry. AMD routing is covered by tests but not a physical AMD render. The full fresh CUDA dependency download has not been qualified on Windows. Compatible Vulkan drivers remain a system requirement. Krea Raw is not guaranteed to improve on Turbo. NPU is not implemented.

Only cooperative registered model drivers can be unloaded/restored. Arbitrary third-party processes remain untouched. NInfer DFlash2 cannot persist disk KV across shutdown. Knowledge's opportunistic GPU processing is a separate integration and is not established by these image tests.

Version 0.2.1 adds the explicit 8K preset (7680×4320, portrait 4320×7680). Request validation/orientation/opt-in tests pass; an 8K render has not been hardware-qualified.

## Fixed-quality 1080p execution comparison — version 0.2.2

The same local Qwen Image 2.1 Turbo Q8 diffusion checkpoint, Heretic Q8 encoder, BF16 VAE, prompt and seed were used throughout. Euler, CFG 1, all 8 steps and the official Turbo sigma sequence were unchanged. The Vulkan backend aligned internal computation to 1920×1088; the plugin fits the delivered image to exactly 1920×1080. Each process starts fresh, with filesystem/shader caches already warm. Wall times include native loading and PNG output, sampled at one-second intervals. These are two-run samples, not universal performance guarantees.

A temporary Linux performance-profile hold was used for every final comparison. Initial exploratory runs without a hold were excluded because GPU power changed from approximately 99 W to 55 W. An inadvertently overlapping exploratory run was also excluded. Residency variants used a 22.695 GiB managed-memory ceiling, approximately 95% of the 24,463 MiB device. This ceiling does not force weights to fill all free memory.

| Execution settings | Run 1 | Run 2 | Peak VRAM |
| --- | ---: | ---: | ---: |
| Existing CPU storage / tiled VAE | 52.8 s | 51.9 s | 38.8% |
| Resident diffusion / tiled VAE | 51.9 s | 53.0 s | 38.8% |
| All resident / tiled VAE | 51.4 s | 52.9 s | 70.8% |
| All resident / automatic VAE (selected) | 48.9 s | 47.9 s | 94.8% |
| All resident / alternate VAE convolution (rejected) | 58.2 s | 53.0 s | 95.1% |

Timings above include a separately measured ~0.5-second Pillow export to exact output size. The selected mode averaged 48.4 seconds, 7.6% less time than the baseline. Denoising remained GPU-bound; the improvement was primarily VAE decoding (~7.3–7.9 s to ~4.2–4.3 s). Peak VRAM was ~23,181 MiB (94.8%). The alternate VAE convolution path exceeded its working-memory budget and retried with tiling, so it was rejected.

All tiled-VAE residency variants produced byte-identical PNGs in the controlled comparison. Automatic/untiled VAE decoding changes the final decoding execution and can change pixels slightly; it does not reduce denoising passes or quantize weights. Outputs were visually inspected. The existing Q8 model files were retained unchanged.

These measurements qualify this model at 1080p on this NVIDIA Vulkan device. They do not establish 8K memory fit, a CUDA-versus-Vulkan ranking, or the optimal policy for Krea, other checkpoints or other GPUs. Existing profiles retain their previous memory behavior unless explicitly changed.

Version 0.2.2 validation: 25 JavaScript tests and 8 Python tests pass, including device-bound memory arguments, preservation of the complete sampler schedule, VAE policy, settings migration/budget validation, worker-spec forwarding, and temporary Linux-only GPU performance holds. The live DSH settings page and owner configuration API were checked with the tuned photograph profile. The original editing profile remains selected for image editing because the 1080p generation tune is not an editing benchmark.

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

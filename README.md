# DSH Image Tools

A standalone Cordis plugin for DeepSeek Harness 0.2.1-rc.2. Qwen Image 2.1 provides photographs and multi-image editing; Krea 2 provides artistic generation. No Harness core patch is needed.

Paste `https://github.com/averyjohnkucan-arch/dsh-image-tools` into **Plugins → Add plugin**, enable it, and open **Settings → Image Tools**. The plugin contains adapters and an isolated runtime installer, not model weights. Point it at models you have downloaded.

## Import and configure

Click **Import model**. Choose a complete Qwen Diffusers folder, or select the denoiser, text encoder, VAE and optional vision projector together. Selections persist as you browse between folders. The importer reads bounded file headers and model metadata, assigns recognized components, and opens the result for review. It does not move or copy weights. Unknown families, uncertain Turbo variants and ambiguous components require a manual choice. Import one checkpoint at a time. A Safetensors shard index can identify its component's shards; individual unrelated checkpoints are never silently combined.

Profiles can be edited, enabled, disabled or removed. GGUF quantizations and compatible FP16/BF16 Safetensors files retain their actual precision. The plugin does not turn a file into another tensor type by renaming it. Krea INT8 ConvRot profiles use the ComfyUI CUDA backend; portable CPU/Vulkan profiles use upstream-compatible GGUF/BF16 weights. Not every engine accepts every tensor layout.

Qwen's complete Diffusers directory includes its model index, tokenizer, transformer, text encoder and VAE. The portable adapter accepts compatible GGUF/Safetensors components or shard-index JSONs. Editing also needs the matching vision projector. Qwen Diffusers text-encoder naming is not always accepted by the native loader; use a compatible native encoder rather than assuming every Diffusers shard index is interchangeable.

Settings, model paths and private runtimes live under `~/.dsh/dsh-image-tools/` (or the host's `DSH_HOME`). They are excluded from GitHub. On another machine, install the plugin/runtime and choose that machine's model paths.

## One tool and explicit quality

Only `image_tools` is registered. Your existing Tool Manager controls discovery or always-available exposure. Calling `image_tools(action="menu")` describes three operations: `generate_photograph`, `edit_image` and `generate_art`. Editing accepts 1–10 conversation attachments in selected order and preserves originals. Results are real DSH image attachments plus workspace-relative PNG paths.

**Turbo is the default** for each task:

- `quality="fast_normal_quality"` selects the actual Turbo checkpoint.
- `quality="slow_high_quality"` selects the separately configured non-Turbo checkpoint. It takes longer and may improve detail; Krea Raw is a base checkpoint and is not guaranteed to beat Turbo.
- Omit `quality`, or use `default`, to follow the saved per-task default. The menu reports its concrete checkpoint and name. Defaults remain configurable.

These choices select different weights, not fewer steps on the same checkpoint. A missing requested variant produces an actionable error. There is no silent substitution. Sampling is stored per profile; models cannot override steps in a tool call.

New profile presets follow the published model interfaces:

| Checkpoint | Steps | Guidance |
| --- | ---: | ---: |
| Qwen Image 2.1 Turbo | 8 | 1, fixed published sigma schedule |
| Qwen Image 2.1 regular | 40 | 1 |
| Krea 2 Turbo | 8 | 0 native scale |
| Krea 2 Raw | 52 | 3.5 native scale |

Krea uses shift 1.15; adapters translate its native guidance scale into the renderer's CFG scale. Heretic encoders can be selected independently, but their names do not guarantee a particular image outcome.

References: [Qwen Turbo](https://huggingface.co/AtomicChat/Qwen-Image-2.1-Turbo-GGUF), [Qwen regular](https://huggingface.co/Qwen/Qwen-Image-2.1), [Krea Turbo](https://huggingface.co/krea/Krea-2-Turbo), [Krea Raw](https://huggingface.co/krea/Krea-2-Raw), [native Krea support](https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/krea2.md).

## Image sizes

The tool advertises `Square256`, `Square512` (default) and `Square1024`. Widescreen presets follow this plugin's requested naming:

| Preset | Landscape pixels | Portrait pixels |
| --- | --- | --- |
| SD / 480p | 854 × 480 | 480 × 854 |
| HD / 720p | 1280 × 720 | 720 × 1280 |
| 2K / 1080p | 1920 × 1080 | 1080 × 1920 |
| 4K / 2160p | 3840 × 2160 | 2160 × 3840 |
| 8K / 4320p | 7680 × 4320 | 4320 × 7680 |

Use `orientation="portrait"` or `landscape`. HD, 2K, 4K and 8K need `confirm_large=true`, reserved for explicit user requests. Custom `width` and `height` are supported, each 64–8192 pixels, up to 33,554,432 pixels. Runtimes use their required aligned dimensions and fit the final PNG to the exact requested dimensions. Large outputs need more time and memory and are not guaranteed to fit every device.

## CPU, iGPU and dedicated GPU

**Install portable CPU/Vulkan runtime** downloads private Python, Pillow and a checksum-pinned official stable-diffusion.cpp build. It does not need PyTorch or ComfyUI. The packaged targets are Linux x86-64 (Ubuntu 24 baseline) and Windows x86-64; compatible system Vulkan drivers are required for GPU use. Unsupported platforms report an error. NPU execution is not provided.

**Install full CUDA/ComfyUI runtime** additionally prepares pinned CUDA PyTorch, Diffusers and private ComfyUI. It needs Git and a suitable NVIDIA driver. Existing compatible runtime paths may also be selected. Installers use versioned directories and never overwrite a running renderer's executable or shared libraries.

Choose a saved execution default or per-call `execution`:

- `gpu`: request cooperative unload → render → reload through [DSH Model Scheduler 0.1.1+](https://github.com/averyjohnkucan-arch/dsh-model-scheduler).
- `igpu`: use a detected integrated Vulkan GPU and keep the chat model loaded.
- `cpu`: keep chat loaded and render on CPU.
- `auto`: use iGPU, or CPU if unavailable, up to the configurable pixel threshold; use dedicated GPU handoff above it.

Each native profile exposes **Native weight placement**: CPU storage with GPU execution (the existing behavior), diffusion weights resident on the selected device, all weights resident, or automatic placement. **Native device memory budget** is an optional GiB ceiling (0 uses the engine default); it does not force allocations to fill VRAM. Leave room for image working memory. **Force tiled VAE decoding** can be disabled to let the engine decode normally and use its memory fallback when needed. These controls preserve the checkpoint, sampler, guidance and number of denoising steps. Larger images still require substantially more working memory.

The optional Linux **performance power profile hold** applies only during native dedicated-GPU rendering through `powerprofilesctl launch`. It ends when the renderer exits and does not change your saved power profile. CPU/iGPU rendering and non-Linux hosts do not use this hold.

CPU/iGPU jobs are serialized locally and do not require the scheduler. A CUDA-only profile needs a configured compatible portable equivalent for CPU/iGPU or AMD/Intel execution. The equivalent must match the task and actual Turbo/non-Turbo variant. Device selection is shown in the receipt; unavailable devices fail explicitly. CPU/iGPU can be much slower. Shared-memory pressure can still affect other work.

The scheduler waits for active chat completion and its KV checkpoint, releases a managed model for rendering, and restores it unless another chat takes priority. Strata can restore native disk KV; NInfer DFlash2 must prefill after unloading. GPU handoff requires cooperative registered drivers. Arbitrary third-party processes are never killed. NVIDIA compute-process conflicts and minimum VRAM are checked after managed unloading; AMD/Intel Vulkan memory allocation remains the renderer's responsibility.

## Lifecycle and portability

The integration uses Cordis-owned tool/service registration, the public settings slot, authenticated owner routes, DSH attachment storage and the scheduler's published `runExclusive` service. No browser DOM patching, private Harness state access or core source changes are used. Rendering runs in owned process trees; cancellation/disposal waits for their termination before scheduler release. The ComfyUI adapter owns a temporary loopback server with custom nodes and partner APIs disabled. It does not attach to someone else's server.

Rendering is offline. Runtime installation requires network access. Prompts, generated PNGs and job logs remain in private plugin/workspace directories. Qwen CUDA out-of-memory handling terminates the failed worker and retries once with sequential CPU offload. Failed jobs do not publish a successful attachment.

Run `pnpm test`, `pnpm run test:native` and `pnpm run check`. See [QUALIFICATION.md](QUALIFICATION.md) for actual hardware tests and limits. Third-party runtime and model licenses remain in force; their source and model files are not redistributed here.

## Generated image previews

Expand the Image Tools call in the conversation to see its saved output image, even if the assistant does not include it in the answer. Click the preview to open it at full size. The plugin uses the public keyed tool-view slot and the session-authorized attachment loader; no Harness changes or extra image generation are required. Existing tool results containing image attachments also gain the preview. Raw metadata remains available under Tool output.

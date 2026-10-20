# DSH Image Tools

A standalone Cordis plugin for DeepSeek Harness 0.2.1-rc.2. Local photographs and multi-image editing through Qwen Image 2.1, artistic generation through Krea 2, and cooperative GPU handoff through [DSH Model Scheduler](https://github.com/averyjohnkucan-arch/dsh-model-scheduler).

Paste `https://github.com/averyjohnkucan-arch/dsh-image-tools` into Harness **Plugins → Add plugin**. Enable it, open **Settings → Image Tools**, and configure your downloaded model files. Install or update Model Scheduler too; image rendering requires its `runExclusive` API (0.1.1+). No Harness core patch is used.

## One entry in Tool Manager

Only `image_tools` is registered. Your existing Tool Manager decides whether it is hidden behind discovery or always available. The plugin does not override that choice or add global prompt instructions. Select it once, or mark that one entry basic/always available. Calling `image_tools(action="menu")` returns three choices:

- **Image Edit** — edit or combine 1–10 conversation attachments with Qwen Image 2.1. Describe each input in order. Originals are read-only; a new PNG is created.
- **Generate Photograph** — Qwen image generation for photorealistic work.
- **Generate Art** — Krea generation for artistic and stylized work.

The same menu tool executes the selected action; it does not permanently add three separate tool schemas. Output includes a real DSH image attachment and a workspace-relative path. The model is told to display the finished image inline.

## Models and runtime

The plugin contains integration code, not model weights or a copy of the old Local AI installation. Model paths and machine-specific settings stay in `~/.dsh/dsh-image-tools/settings.json`, outside the repository. Choose existing compatible Python executables, or use **Install managed runtime** to download isolated Python, pinned CUDA PyTorch, Diffusers and ComfyUI into the plugin data directory. Setup needs Git, network access, sufficient disk space and an NVIDIA driver compatible with CUDA 13. It does not install system packages. The managed installer is provided; a complete fresh download has not been qualified on Windows.

Qwen profiles use a complete local **QwenImage21Pipeline Diffusers directory**: `model_index.json`, tokenizer/processor, text encoder, transformer and VAE. Heretic variants use the same interface. A standalone Qwen GGUF is not accepted by this backend; use a full Diffusers model folder. The plugin checks the model index before releasing a chat model.

Krea profiles use **ComfyUI-compatible `.safetensors` diffusion weights**, a compatible Qwen3-VL-4B text encoder, and the Qwen Image VAE. These can be in separate folders. BF16 and supported ComfyUI INT8 ConvRot files are accepted by the upstream loader. Krea Turbo is the recommended inference profile; Raw is a base/training checkpoint and is not described as an equivalent quality upgrade. Selecting a Heretic encoder does not turn the diffusion weights into a separately verified “uncensored” release. Krea editing is not implemented; use Qwen for reference-image edits.

Models stay where you downloaded them. Rendering is offline and each job runs in a private process. The ComfyUI adapter starts its own temporary loopback server with custom nodes and partner APIs disabled, uses its public `/prompt` and `/history` APIs, and shuts it down afterwards. It never attaches to an arbitrary running ComfyUI server.

## Quality and dimensions

Fast is recommended for ordinary requests; high uses the profile’s higher-quality step preset. Defaults for a new Qwen profile are 20/40 steps. Krea Turbo uses its recommended 8 steps for both presets; more steps are not assumed to improve a distilled model. Step counts remain configurable.

Default output is **512×512**. Square presets: 256×256, 512×512, 1024×1024. HD presets: 1280×720, 1920×1080, 3840×2160, with portrait versions of each. These larger presets require `confirm_large=true`, reserved for explicit user requests. Custom `width` and `height` are supported from 64 through 4096 pixels, at most 16 megapixels. Backends run at their required aligned dimensions and the final PNG is fitted to the exact requested size. Large sizes take more time and memory and are not guaranteed to fit every GPU.

Fast editing limits reference-image preprocessing resolution to reduce memory use. If Qwen exhausts VRAM, the worker exits completely and retries once in a fresh process using sequential CPU offload. A failed job does not publish a successful image result.

## GPU handoff

The scheduler waits for an active chat response and its KV checkpoint to finish, unloads the managed chat model immediately for the image job, and restores the prior model afterwards when no other chat has taken priority. This bypasses the ordinary idle grace period for this explicit handoff. Strata can restore its saved native KV; NInfer DFlash2 must rebuild KV after unloading.

GPU compute processes still present after managed unloading are reported as a conflict. External applications are never killed. Without a cooperative lifecycle driver, a third-party model cannot safely be unloaded by guessing its PID. The scheduler’s Models card shows detected GPU compute processes read-only.

Job files, logs and model cache can contain private prompts and images. They are kept under private plugin/workspace directories and are not published to GitHub. Cancellation and plugin disposal stop the owned renderer process tree before scheduler release.

## Development and verification

`node --test test/*.test.js` checks size guards, quality defaults, profile validation and attachment selection. `node --check index.js` and `node --check client.js` validate the entry points. Live qualification details and limitations are recorded separately; Linux qualification does not establish Windows runtime support.

Third-party runtimes retain their own licenses. ComfyUI is downloaded from Comfy-Org at `8f04fd6ecf4a548937971e840af2a985529fab76`; Diffusers from Hugging Face at `578c9b2c6636ab2424a0e56186268b83623656b2`. Their source is not copied into this plugin repository. Model licenses remain the model distributor’s responsibility.

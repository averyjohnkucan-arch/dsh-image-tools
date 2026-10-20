# Qualification — 2026-10-20

Tested on Linux, Node 22.22, DeepSeek Harness 0.2.1-rc.2, and an RTX PRO 5000 Blackwell Laptop GPU (24 GB).

- Real Qwen Image 2.1 Heretic photograph: 512×512, 20 steps, 34.9 seconds. Output visually checked.
- Real Qwen two-reference edit: photograph plus red colour swatch, 512×512, 20 steps, 36.9 seconds. The mug changed from blue to red and retained the scene; originals were preserved.
- Real Krea 2 Turbo with Heretic Qwen3-VL encoder: 256×256, 8 steps, 30.6 seconds. Watercolour output visually checked.
- Real scheduler handoff: NInfer DFlash2 answered `ready`, was unloaded, Qwen generated a 512×512 photograph, NInfer was restored and answered `restored`. Image plus restoration took 56.1 seconds. No renderer or NInfer process remained after test cleanup.
- Generated PNG data passed a round trip through the real DSH local attachment store.
- Installed from GitHub in a separate Harness test profile. Enabled the local source in the current web profile; verified the Image Tools settings, saved model profiles, scheduler connection, and one `image_tools` entry in Tool Manager using its existing Search and select policy.
- Automated tests cover request validation, exact dimensions and large-size opt-in, attachment ordering, real Cordis tool registration/disposal, owner authorization, and renderer process cancellation. Scheduler tests also cover active-chat waiting, background yielding, failed load/unload, image failures and restoration.

The qualified Qwen runtime is an existing Python 3.12 / CUDA 13 / Torch 2.14.0 environment. Krea uses an isolated Python 3.12 environment with ComfyUI dependencies and a private checkout of the pinned upstream ComfyUI source. The private checkout was also tested successfully (23.0 seconds). No old Local AI source or global Python installation was modified. An older Python 3.14 environment failed native JIT compilation due to missing Python development headers; it was not reused.

Not qualified: Windows execution, a completely fresh managed runtime download, HD/4K rendering, every model quantization, and the automatic sequential-offload retry after an out-of-memory failure. These paths are implemented but are not represented as measured successes. GPU handoff requires cooperative registered model drivers; arbitrary third-party processes are detected and left untouched. NInfer DFlash2 cannot retain disk KV across shutdown. Knowledge's opportunistic NVIDIA GPU processing is a separate integration and is not established by these image tests.

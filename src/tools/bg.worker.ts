/// <reference lib="webworker" />
// Runs the background-removal model off the main thread so the page stays responsive.
// Model: BiRefNet_lite (MIT) exported at 512x512. The official 1024 export can't run in
// browsers: it needs 11 WebGPU storage buffers (Apple GPUs allow 10) and runs out of the
// 4 GB WASM heap on the CPU. At 512 it fits both. Everything runs locally.
import type * as Transformers from "@huggingface/transformers";
import type { PreTrainedModel, Processor } from "@huggingface/transformers";

// Loaded from the CDN at runtime (pinned) rather than bundled: the bundle would pull in a
// 27 MB ONNX Runtime .wasm, over Cloudflare's 25 MiB per-asset limit. The npm package is
// only used for types. transformers.js fetches the runtime .wasm from jsDelivr itself.
const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js";
let lib: Promise<typeof Transformers> | null = null;
const transformers = () => (lib ??= import(/* @vite-ignore */ TRANSFORMERS_URL));

const MODEL_ID = "studioludens/birefnet-lite-512";
// Pinned to a commit so a change to the model repo can't change what users download.
const REVISION = "962e67969ec6acec9c19fab76acee4f5e22e990c";

export type Device = "webgpu" | "wasm";
export type ToWorker = { type: "run"; pixels: ArrayBuffer; width: number; height: number; cpuOnly: boolean };
export type FromWorker =
  | { type: "progress"; loaded: number; total: number; device: Device }
  | { type: "ready"; device: Device }
  | { type: "mask"; mask: ArrayBuffer }
  // WebGPU started but can't run this model here. Once WebGPU is up, ONNX Runtime keeps
  // using it inside this worker, so the page must start a fresh CPU-only worker.
  | { type: "gpu-failed" }
  | { type: "error"; message: string };

const post = (msg: FromWorker, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

async function pickDevice(cpuOnly: boolean): Promise<Device> {
  if (cpuOnly) return "wasm";
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  try {
    if (gpu && (await gpu.requestAdapter())) return "webgpu";
  } catch {
    // no usable GPU
  }
  return "wasm";
}

type Loaded = { model: PreTrainedModel; processor: Processor; device: Device };
let loading: Promise<Loaded> | null = null;

function load(cpuOnly: boolean) {
  loading ??= (async () => {
    const { AutoModel, AutoProcessor } = await transformers();
    const device = await pickDevice(cpuOnly);
    // Sum progress across every file the model needs (config, weights...).
    const files = new Map<string, { loaded: number; total: number }>();
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: "progress", loaded, total, device });
    };
    const model = await AutoModel.from_pretrained(MODEL_ID, {
      device,
      dtype: device === "webgpu" ? "fp16" : "fp32", // fp16 halves the GPU download
      revision: REVISION,
      progress_callback,
    });
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { revision: REVISION });
    post({ type: "ready", device });
    return { model, processor, device };
  })();
  loading.catch(() => (loading = null)); // let a later attempt retry
  return loading;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const { pixels, width, height, cpuOnly } = e.data;
  try {
    const { model, processor, device } = await load(cpuOnly);
    const { RawImage } = await transformers();
    const image = new RawImage(new Uint8ClampedArray(pixels), width, height, 4).rgb();
    const { pixel_values } = await processor(image);
    let outputs: Record<string, Transformers.Tensor>;
    try {
      outputs = await model({ input_image: pixel_values });
    } catch (err) {
      if (device !== "webgpu") throw err;
      console.warn("WebGPU failed, page will retry on the CPU", err);
      post({ type: "gpu-failed" });
      return;
    }
    // The model has a single output (named "logits" in this export): raw scores, not 0-255.
    // Tensors index by batch at runtime (scores[0] is the first image), but aren't typed that way.
    const scores = Object.values(outputs)[0] as unknown as Transformers.Tensor[];
    const mask = await RawImage.fromTensor(scores[0].sigmoid().mul(255).to("uint8")).resize(width, height);
    const out = new Uint8Array(mask.data);
    post({ type: "mask", mask: out.buffer }, [out.buffer]);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};

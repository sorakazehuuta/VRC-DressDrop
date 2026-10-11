import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Explicit allowlist: never expose arbitrary inbox files, packages or .env.
const files: Record<string, string> = {
  "model.glb": "model-inbox/cake/preview/model.glb",
  "three/build/three.module.js": "node_modules/three/build/three.module.js",
  "three/build/three.core.js": "node_modules/three/build/three.core.js",
  "three/examples/jsm/loaders/GLTFLoader.js": "node_modules/three/examples/jsm/loaders/GLTFLoader.js",
  "three/examples/jsm/controls/OrbitControls.js": "node_modules/three/examples/jsm/controls/OrbitControls.js",
  "three/examples/jsm/utils/BufferGeometryUtils.js": "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
  "three/examples/jsm/utils/SkeletonUtils.js": "node_modules/three/examples/jsm/utils/SkeletonUtils.js",
};

export async function GET(request: Request, context: { params: Promise<{ file: string[] }> }) {
  if (process.env.NODE_ENV !== "development" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) {
    return new Response("Not found", { status: 404 });
  }
  const key = (await context.params).file.join("/");
  if (!Object.hasOwn(files, key)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), files[key]));
    return new Response(new Uint8Array(data), { headers: {
      "Content-Type": key.endsWith(".glb") ? "model/gltf-binary" : "text/javascript; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Preview asset not found", { status: 404 });
  }
}

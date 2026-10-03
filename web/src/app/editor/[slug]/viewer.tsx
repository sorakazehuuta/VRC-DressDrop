"use client";

import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { backgroundColor, textureDimensions, type EditorParams } from "@/lib/templates/params";
import type { PrintSlot, Slot } from "@/lib/templates/schema";
import type { LoadedImage } from "./images";
import { drawPrint } from "./print-canvas";

type ViewerProps = {
  modelUrl: string;
  slots: Slot[];
  params: EditorParams;
  images: Record<string, LoadedImage>;
  resetViewSignal: number;
  onCaptureReady?: (capture: () => Promise<Blob | null>) => void;
};

export default function Viewer(props: ViewerProps) {
  return (
    <ViewerErrorBoundary>
      <Canvas flat dpr={[1, 2]} camera={{ fov: 35, position: [0, 0.2, 2.5] }}>
        <color attach="background" args={["#e4e4e7"]} />
        <hemisphereLight args={["#ffffff", "#8a8a8a", 1.6]} />
        <directionalLight position={[2, 3, 4]} intensity={1.8} />
        <directionalLight position={[-3, 1, -3]} intensity={0.7} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <Model {...props} />
            <ResetView signal={props.resetViewSignal} />
            {props.onCaptureReady && <CaptureBridge onReady={props.onCaptureReady} />}
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enablePan={false} enableDamping />
      </Canvas>
    </ViewerErrorBoundary>
  );
}

// 正面（+Z 方向）から全体が収まる位置にカメラを戻す
function ResetView({ signal }: { signal: number }) {
  const bounds = useBounds();
  useEffect(() => {
    if (signal === 0) return;
    const { center, distance } = bounds.refresh().getSize();
    bounds.to({ position: [center.x, center.y, center.z + distance], target: [center.x, center.y, center.z] });
  }, [signal, bounds]);
  return null;
}

const THUMBNAIL = { width: 480, height: 360 };

// マイ作品のサムネイル（4:3 の JPEG）を撮る。利用者の視点やカメラの移動中かどうかに左右されないよう、
// 撮影の瞬間だけカメラを正面に置き、描画して写し取ったら元に戻す（同期処理なので画面には映らない）
function CaptureBridge({ onReady }: { onReady: (capture: () => Promise<Blob | null>) => void }) {
  const { gl, scene, camera } = useThree();
  const bounds = useBounds();
  useEffect(() => {
    onReady(() => {
      const { center, distance } = bounds.refresh().getSize();
      const savedPosition = camera.position.clone();
      const savedQuaternion = camera.quaternion.clone();
      camera.position.set(center.x, center.y, center.z + distance);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      gl.render(scene, camera);

      // preserveDrawingBuffer なしでも読めるよう、描画した直後に写し取る
      const src = gl.domElement;
      const out = document.createElement("canvas");
      out.width = THUMBNAIL.width;
      out.height = THUMBNAIL.height;
      const ctx = out.getContext("2d");
      if (ctx) {
        // 全体が収まる距離には余白があるため、中央を少し拡大して切り抜く
        const scale = Math.max(out.width / src.width, out.height / src.height) * 1.15;
        const w = src.width * scale;
        const h = src.height * scale;
        ctx.fillStyle = "#e4e4e7";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, (out.width - w) / 2, (out.height - h) / 2, w, h);
      }

      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedQuaternion);
      camera.updateMatrixWorld();
      gl.render(scene, camera);

      if (!ctx) return Promise.resolve(null);
      return new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.85));
    });
  }, [gl, scene, camera, bounds, onReady]);
  return null;
}

type Rig = {
  scene: THREE.Object3D;
  materials: Map<string, THREE.MeshStandardMaterial>;
  prints: Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }>;
};

// glTF のキャッシュを書き換えないよう、シーン・マテリアル・テクスチャを毎回まとめて新しく作る。
// 開発時の React は useMemo を2回実行することがあるため、作ったものの外側を書き換えてはいけない
function buildRig(source: THREE.Object3D, slots: Slot[]): Rig {
  const scene = cloneSkinned(source);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    // スキンメッシュは境界の計算がずれて消えることがあるため、視錐台カリングを切る
    mesh.frustumCulled = false;
    const replace = (m: THREE.Material) => {
      let copy = materials.get(m.name);
      if (!copy) {
        copy = (m as THREE.MeshStandardMaterial).clone();
        materials.set(m.name, copy);
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(replace) : replace(mesh.material);
  });

  const prints = new Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }>();
  for (const slot of slots) {
    if (slot.type !== "print") continue;
    const canvas = document.createElement("canvas");
    const size = textureDimensions(slot);
    canvas.width = size.width;
    canvas.height = size.height;
    const texture = new THREE.CanvasTexture(canvas);
    // glTF の UV は画像の上端が v=0
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    prints.set(slot.key, { canvas, texture });

    const material = materials.get(slot.material);
    if (material) {
      material.map = texture;
      material.color.set("#ffffff");
      const transparent = slot.background === "transparent";
      material.transparent = transparent;
      material.alphaTest = transparent ? 0.01 : 0;
      // 生地と地続きのプリント面は、つやを生地に合わせて境目を目立たなくする
      if (slot.background !== "transparent") {
        const bgKey = slot.background.slot;
        const bgMaterial = materials.get(slots.find((s) => s.key === bgKey)?.material ?? "");
        if (bgMaterial) {
          material.roughness = bgMaterial.roughness;
          material.metalness = bgMaterial.metalness;
        }
      }
      material.needsUpdate = true;
    }
  }
  return { scene, materials, prints };
}

function Model({ modelUrl, slots, params, images }: ViewerProps) {
  const gltf = useGLTF(modelUrl);
  const { scene, materials, prints: printTextures } = useMemo(() => buildRig(gltf.scene, slots), [gltf.scene, slots]);

  useEffect(
    () => () => {
      printTextures.forEach(({ texture }) => texture.dispose());
      materials.forEach((m) => m.dispose());
    },
    [printTextures, materials],
  );

  useEffect(() => {
    for (const slot of slots) {
      const slotParams = params.slots[slot.key];
      if (slot.type === "color" && slotParams?.kind === "color") {
        materials.get(slot.material)?.color.set(slotParams.color);
      }
      if (slot.type === "print" && slotParams?.kind === "print") {
        const target = printTextures.get(slot.key);
        if (!target) continue;
        const image = slotParams.imageId ? images[slotParams.imageId] : undefined;
        drawPrint(target.canvas, slotParams, image ?? null, backgroundColor(slot as PrintSlot, params));
        target.texture.needsUpdate = true;
      }
    }
  }, [slots, params, images, materials, printTextures]);

  return <primitive object={scene} />;
}

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
          3Dモデルを表示できませんでした。ページを再読み込みしてください。
          <br />
          お使いのブラウザが WebGL に対応していない可能性もあります。
        </div>
      );
    }
    return this.props.children;
  }
}

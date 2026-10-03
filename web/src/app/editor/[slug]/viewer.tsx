"use client";

import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
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
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enablePan={false} enableDamping />
      </Canvas>
    </ViewerErrorBoundary>
  );
}

function ResetView({ signal }: { signal: number }) {
  const bounds = useBounds();
  useEffect(() => {
    if (signal > 0) bounds.refresh().clip().fit();
  }, [signal, bounds]);
  return null;
}

function Model({ modelUrl, slots, params, images }: ViewerProps) {
  const gltf = useGLTF(modelUrl);
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf.scene]);

  // マテリアル名ごとに複製し、元の glTF キャッシュを書き換えないようにする
  const materials = useMemo(() => {
    const byName = new Map<string, THREE.MeshStandardMaterial>();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // スキンメッシュは境界の計算がずれて消えることがあるため、視錐台カリングを切る
      mesh.frustumCulled = false;
      const replace = (m: THREE.Material) => {
        let copy = byName.get(m.name);
        if (!copy) {
          copy = (m as THREE.MeshStandardMaterial).clone();
          byName.set(m.name, copy);
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(replace) : replace(mesh.material);
    });
    return byName;
  }, [scene]);

  const printTextures = useMemo(() => {
    const result = new Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }>();
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
      result.set(slot.key, { canvas, texture });

      const material = materials.get(slot.material);
      if (material) {
        material.map = texture;
        material.color.set("#ffffff");
        const transparent = slot.background === "transparent";
        material.transparent = transparent;
        material.alphaTest = transparent ? 0.01 : 0;
        material.needsUpdate = true;
      }
    }
    return result;
  }, [slots, materials]);

  useEffect(() => () => printTextures.forEach(({ texture }) => texture.dispose()), [printTextures]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

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

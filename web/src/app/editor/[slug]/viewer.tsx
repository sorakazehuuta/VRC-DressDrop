"use client";

import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GimmickSelection } from "@/lib/gimmicks/schema";
import { backgroundColor, textureDimensions, type EditorParams } from "@/lib/templates/params";
import type { PrintSlot, Slot } from "@/lib/templates/schema";
import type { LoadedImage } from "./images";
import { applyMaterialFx, createPreviewRig, GimmickBody, GimmickEffects, NEUTRAL_FX, type PreviewRig } from "./gimmick-preview/preview-3d";
import type { PreviewState } from "./gimmick-preview/spec";
import { drawPrint } from "./print-canvas";

type ViewerProps = {
  modelUrl: string;
  slots: Slot[];
  params: EditorParams;
  images: Record<string, LoadedImage>;
  resetViewSignal: number;
  onCaptureReady?: (capture: () => Promise<Blob | null>) => void;
  // ギミックのプレビュー
  gimmicks: GimmickSelection[];
  preview: PreviewState;
  onPrimaryAction: (() => void) | null;
};

export default function Viewer(props: ViewerProps) {
  const rigRef = useRef<PreviewRig>(createPreviewRig());
  return (
    <ViewerErrorBoundary>
      <Canvas flat dpr={[1, 2]} camera={{ fov: 35, position: [0, 0.2, 2.5] }}>
        <Lights dark={props.preview.dark} rigRef={rigRef} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.25}>
            <GimmickBody
              rigRef={rigRef}
              selected={props.gimmicks}
              preview={props.preview}
              modelKey={props.modelUrl}
              onPrimary={props.onPrimaryAction}
            >
              <Model {...props} rigRef={rigRef} />
            </GimmickBody>
            <ResetView signal={props.resetViewSignal} />
            {props.onCaptureReady && <CaptureBridge onReady={props.onCaptureReady} rigRef={rigRef} />}
          </Bounds>
          <GimmickEffects rigRef={rigRef} selected={props.gimmicks} preview={props.preview} onPrimary={props.onPrimaryAction} />
        </Suspense>
        {/* 真下から見上げると中の空洞が見えるため、水平より少し下までに制限する */}
        <OrbitControls makeDefault enablePan={false} enableDamping maxPolarAngle={Math.PI * 0.6} />
      </Canvas>
    </ViewerErrorBoundary>
  );
}

const LIGHTING = {
  bright: { background: "#e4e4e7", hemisphere: 1.6, key: 1.8, fill: 0.7 },
  // 暗いワールドを想定した照明（光る・照らす・粒のギミックの見え方を確かめる）
  dark: { background: "#18181b", hemisphere: 0.18, key: 0.25, fill: 0.08 },
};

function Lights({ dark, rigRef }: { dark: boolean; rigRef: RefObject<PreviewRig> }) {
  const get = useThree((s) => s.get);
  const look = dark ? LIGHTING.dark : LIGHTING.bright;
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);

  // サムネイルはいつも明るい照明で撮る
  useEffect(() => {
    const hooks = rigRef.current.captureHooks;
    const hook = () => {
      const lights = [hemisphereRef.current, keyRef.current, fillRef.current];
      const saved = lights.map((l) => l?.intensity ?? 0);
      const scene = get().scene;
      const background = scene.background instanceof THREE.Color ? scene.background.clone() : null;
      setLighting(lights, [LIGHTING.bright.hemisphere, LIGHTING.bright.key, LIGHTING.bright.fill], scene, new THREE.Color(LIGHTING.bright.background));
      return () => setLighting(lights, saved, scene, background);
    };
    hooks.add(hook);
    return () => {
      hooks.delete(hook);
    };
  }, [get, rigRef]);

  return (
    <>
      <color attach="background" args={[look.background]} />
      <hemisphereLight ref={hemisphereRef} args={["#ffffff", "#8a8a8a", look.hemisphere]} intensity={look.hemisphere} />
      <directionalLight ref={keyRef} position={[2, 3, 4]} intensity={look.key} />
      <directionalLight ref={fillRef} position={[-3, 1, -3]} intensity={look.fill} />
    </>
  );
}

function setLighting(lights: (THREE.Light | null)[], intensities: number[], scene: THREE.Scene, background: THREE.Color | null) {
  lights.forEach((l, i) => {
    if (l) l.intensity = intensities[i];
  });
  if (background && scene.background instanceof THREE.Color) scene.background.copy(background);
}

const RESET_SECONDS = 0.6;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type ResetAnimation = {
  elapsed: number;
  from: { target: THREE.Vector3; spherical: THREE.Spherical };
  to: { target: THREE.Vector3; spherical: THREE.Spherical };
  damping: boolean;
};

// 正面（+Z 方向）から全体が収まる位置にカメラを戻す。
// 位置を直線で動かすとモデルの横や中を通って画面外に外れるため、注視点を中心に回り込みながら
// 距離だけを直線的に変える（常にモデルの方を向いたまま、近づく・離れる動きになる）
function ResetView({ signal }: { signal: number }) {
  const bounds = useBounds();
  const get = useThree((s) => s.get);
  // OrbitControls は makeDefault で登録されるまで null なので、登録されたら操作の監視を始める
  const hasControls = useThree((s) => Boolean(s.controls));
  const animation = useRef<ResetAnimation | null>(null);

  useEffect(() => {
    const { camera, controls: c } = get();
    const controls = c as OrbitControlsImpl | null;
    if (signal === 0 || !controls) return;
    const { center, distance } = bounds.refresh().getSize();
    const offset = camera.position.clone().sub(controls.target);
    const from = new THREE.Spherical().setFromVector3(offset);
    // 左右は近い向きから回り込む
    const theta = from.theta - Math.PI * 2 * Math.round(from.theta / (Math.PI * 2));
    animation.current = {
      elapsed: 0,
      from: { target: controls.target.clone(), spherical: new THREE.Spherical(from.radius, from.phi, theta) },
      to: { target: center.clone(), spherical: new THREE.Spherical(distance, Math.PI / 2, 0) },
      // 慣性が残っているとアニメーションの後にカメラが流れるため、動かしている間は切る（切ると慣性も消える）
      damping: animation.current?.damping ?? controls.enableDamping,
    };
    controls.enableDamping = false;
  }, [signal, bounds, get]);

  // 動かしている途中に利用者が操作したら、そこで止めて操作を優先する
  useEffect(() => {
    const controls = get().controls as OrbitControlsImpl | null;
    if (!hasControls || !controls) return;
    const stop = () => {
      if (!animation.current) return;
      controls.enableDamping = animation.current.damping;
      animation.current = null;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [hasControls, get]);

  useFrame((state, delta) => {
    const a = animation.current;
    const controls = state.controls as OrbitControlsImpl | null;
    if (!a || !controls) return;
    a.elapsed = Math.min(a.elapsed + delta, RESET_SECONDS);
    const t = easeInOut(a.elapsed / RESET_SECONDS);
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const spherical = new THREE.Spherical(
      lerp(a.from.spherical.radius, a.to.spherical.radius),
      lerp(a.from.spherical.phi, a.to.spherical.phi),
      lerp(a.from.spherical.theta, a.to.spherical.theta),
    );
    controls.target.lerpVectors(a.from.target, a.to.target, t);
    state.camera.position.setFromSpherical(spherical).add(controls.target);
    state.camera.lookAt(controls.target);
    controls.update();
    if (a.elapsed >= RESET_SECONDS) {
      controls.enableDamping = a.damping;
      animation.current = null;
    }
  });

  return null;
}

const THUMBNAIL = { width: 480, height: 360 };

// マイ作品のサムネイル（4:3 の JPEG）を撮る。利用者の視点やカメラの移動中かどうかに左右されないよう、
// 撮影の瞬間だけカメラを正面に置き、描画して写し取ったら元に戻す（同期処理なので画面には映らない）
function CaptureBridge({ onReady, rigRef }: { onReady: (capture: () => Promise<Blob | null>) => void; rigRef: RefObject<PreviewRig> }) {
  const { gl, scene, camera } = useThree();
  const bounds = useBounds();
  useEffect(() => {
    onReady(() => {
      // ギミックの動き・演出・暗い照明を止めた状態で撮る
      const restores = [...rigRef.current.captureHooks].map((hook) => hook());
      scene.updateMatrixWorld();
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
      restores.reverse().forEach((restore) => restore());
      scene.updateMatrixWorld();
      gl.render(scene, camera);

      if (!ctx) return Promise.resolve(null);
      return new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.85));
    });
  }, [gl, scene, camera, bounds, onReady, rigRef]);
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

function Model({ modelUrl, slots, params, images, rigRef }: ViewerProps & { rigRef: RefObject<PreviewRig> }) {
  const gltf = useGLTF(modelUrl);
  const { scene, materials, prints: printTextures } = useMemo(() => buildRig(gltf.scene, slots), [gltf.scene, slots]);

  // ギミックの発光・半透明を毎フレーム反映し、サムネイルの撮影中だけ元に戻す
  useFrame(() => applyMaterialFx(materials.values(), rigRef.current.fx));
  useEffect(() => {
    const hooks = rigRef.current.captureHooks;
    const hook = () => {
      applyMaterialFx(materials.values(), NEUTRAL_FX);
      return () => applyMaterialFx(materials.values(), rigRef.current.fx);
    };
    hooks.add(hook);
    return () => {
      hooks.delete(hook);
    };
  }, [materials, rigRef]);

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

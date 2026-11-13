"use client";

import { Bounds, OrbitControls, useBounds, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GimmickSelection } from "@/lib/gimmicks/schema";
import { buildEdgeMesh, printFaces, type FaceMap } from "@/lib/templates/acrylic-edge";
import { backgroundColor, textureDimensions, type EditorParams } from "@/lib/templates/params";
import type { PrintSlot, Slot } from "@/lib/templates/schema";
import { cameraDirection, type PreviewExtras } from "@/lib/templates/view";
import type { LoadedImage } from "./images";
import { applyMaterialFx, createPreviewRig, GimmickBody, GimmickEffects, NEUTRAL_FX, type PreviewRig } from "./gimmick-preview/preview-3d";
import type { PreviewState } from "./gimmick-preview/spec";
import { drawPrint } from "./print-canvas";
import { useTextFonts } from "./text-fonts";
import { useMessages } from "@/i18n/client";
import { editorMessages } from "./messages";

// 3D 表示に失敗したときの案内（エラー境界はクラスの部品で hook を使えないため、別の部品にする）
function ModelError() {
  const m = useMessages(editorMessages);
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
      {m.modelError1}
      <br />
      {m.modelError2}
    </div>
  );
}

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

// モデルを読み込むまでの仮の位置（読み込んだらプリント面の正面に移す）
const INITIAL_CAMERA = new THREE.Vector3(...cameraDirection()).multiplyScalar(2.5);

export default function Viewer(props: ViewerProps) {
  const rigRef = useRef<PreviewRig>(createPreviewRig());
  // 最初の視点・「視点をリセット」・サムネイルで使う、モデルの中心からカメラへの方向（モデルを読み込むと決まる）
  const viewDirRef = useRef(new THREE.Vector3(...cameraDirection()));
  return (
    <ViewerErrorBoundary>
      <Canvas flat dpr={[1, 2]} camera={{ fov: 35, position: INITIAL_CAMERA }}>
        <Lights dark={props.preview.dark} rigRef={rigRef} />
        <Suspense fallback={null}>
          {/* カメラの移動中に操作が始まると注視点が途中で止まるため、動かさずに合わせる */}
          <Bounds fit clip observe margin={1.25} maxDuration={0.001}>
            <GimmickBody
              rigRef={rigRef}
              selected={props.gimmicks}
              preview={props.preview}
              modelKey={props.modelUrl}
              onPrimary={props.onPrimaryAction}
            >
              <Model {...props} rigRef={rigRef} viewDirRef={viewDirRef} />
            </GimmickBody>
            <ResetView signal={props.resetViewSignal} viewDirRef={viewDirRef} />
            {props.onCaptureReady && <CaptureBridge onReady={props.onCaptureReady} rigRef={rigRef} viewDirRef={viewDirRef} />}
          </Bounds>
          <GimmickEffects rigRef={rigRef} selected={props.gimmicks} preview={props.preview} onPrimary={props.onPrimaryAction} />
        </Suspense>
        {/* スケートボードの裏のように下向きのプリント面もあるため、真下からも見られるようにする */}
        <OrbitControls makeDefault enablePan={false} enableDamping />
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

// 最初の視点（プリント面の正面）から全体が収まる位置にカメラを戻す。
// 位置を直線で動かすとモデルの横や中を通って画面外に外れるため、注視点を中心に回り込みながら
// 距離だけを直線的に変える（常にモデルの方を向いたまま、近づく・離れる動きになる）
function ResetView({ signal, viewDirRef }: { signal: number; viewDirRef: RefObject<THREE.Vector3> }) {
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
    const to = new THREE.Spherical().setFromVector3(viewDirRef.current.clone().multiplyScalar(distance));
    // 左右は近い向きから回り込む
    const theta = from.theta - Math.PI * 2 * Math.round((from.theta - to.theta) / (Math.PI * 2));
    animation.current = {
      elapsed: 0,
      from: { target: controls.target.clone(), spherical: new THREE.Spherical(from.radius, from.phi, theta) },
      to: { target: center.clone(), spherical: to },
      // 慣性が残っているとアニメーションの後にカメラが流れるため、動かしている間は切る（切ると慣性も消える）
      damping: animation.current?.damping ?? controls.enableDamping,
    };
    controls.enableDamping = false;
  }, [signal, bounds, get, viewDirRef]);

  // 動かしている途中に利用者が操作したら、そこで止めて操作を優先する。
  // パンはできないので、回転の中心はいつもモデルの中心に戻す
  useEffect(() => {
    const controls = get().controls as OrbitControlsImpl | null;
    if (!hasControls || !controls) return;
    const stop = () => {
      controls.target.copy(bounds.getSize().center);
      if (!animation.current) return;
      controls.enableDamping = animation.current.damping;
      animation.current = null;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [hasControls, get, bounds]);

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
// 撮影の瞬間だけカメラを最初の視点に置き、描画して写し取ったら元に戻す（同期処理なので画面には映らない）
function CaptureBridge({
  onReady,
  rigRef,
  viewDirRef,
}: {
  onReady: (capture: () => Promise<Blob | null>) => void;
  rigRef: RefObject<PreviewRig>;
  viewDirRef: RefObject<THREE.Vector3>;
}) {
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
      camera.position.copy(center).addScaledVector(viewDirRef.current, distance);
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
  }, [gl, scene, camera, bounds, onReady, rigRef, viewDirRef]);
  return null;
}

type Rig = {
  scene: THREE.Object3D;
  materials: Map<string, THREE.MeshStandardMaterial>;
  prints: Map<string, { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture }>;
  // アクリルの板の側面（印刷面ごと）。プリントの面（表と裏）の位置から、外周に沿った側面を作り直す
  edges: Map<string, { mesh: THREE.Mesh; faces: [FaceMap, FaceMap] }>;
};

// glb のノード（Unity の GameObject の名前）から、メッシュを 1 つ探す
function findMesh(scene: THREE.Object3D, name: string) {
  let found: THREE.Mesh | null = null;
  scene.traverse((obj) => {
    if (found || obj.name !== name) return;
    obj.traverse((child) => {
      if (!found && (child as THREE.Mesh).isMesh) found = child as THREE.Mesh;
    });
  });
  return found as THREE.Mesh | null;
}

// プリントの面のメッシュから、表と裏の面の対応を求める（glTF の UV は画像の上が 0 なので、そのまま (u, t) になる）
function meshFaces(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  if (!position || !uv) return null;
  const index = geometry.getIndex();
  const indices = index ? Array.from(index.array) : Array.from({ length: position.count }, (_, i) => i);
  // ノードに位置・向きがあっても、側面はプリントと同じノードの座標で作る
  return printFaces(position.array, uv.array, indices);
}

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

  const edges = new Map<string, { mesh: THREE.Mesh; faces: [FaceMap, FaceMap] }>();
  for (const slot of slots) {
    const edge = slot.type === "print" ? slot.outline?.edge : undefined;
    if (!edge) continue;
    const print = findMesh(scene, edge.printObject);
    const edgeMesh = findMesh(scene, edge.edgeObject);
    const faces = print && meshFaces(print);
    if (!print || !edgeMesh || !faces) continue;
    // 側面はプリントの面と同じ位置に置く（glb のノードは Prefab のルートからの位置で、どちらも同じ）
    edgeMesh.position.copy(print.position);
    edgeMesh.quaternion.copy(print.quaternion);
    edgeMesh.scale.copy(print.scale);
    edgeMesh.geometry = new THREE.BufferGeometry();
    edges.set(slot.key, { mesh: edgeMesh, faces });
  }
  return { scene, materials, prints, edges };
}

// 板の外周の線から側面の形を作り、メッシュに入れる
function updateEdge(target: { mesh: THREE.Mesh; faces: [FaceMap, FaceMap] }, loops: [number, number][][]) {
  const built = buildEdgeMesh(loops, target.faces[0], target.faces[1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  target.mesh.geometry.dispose();
  target.mesh.geometry = geometry;
}

function Model({
  modelUrl,
  slots,
  params,
  images,
  rigRef,
  viewDirRef,
}: ViewerProps & { rigRef: RefObject<PreviewRig>; viewDirRef: RefObject<THREE.Vector3> }) {
  const gltf = useGLTF(modelUrl);
  const camera = useThree((s) => s.camera);

  // プリント面の正面から見る。Bounds は今のカメラの方向のまま全体が収まる距離に合わせるため、
  // Bounds が位置を決める前（子のレイアウトエフェクトが先に動く）にカメラの方向だけを変えておく
  useLayoutEffect(() => {
    const extras = gltf.asset?.extras as { vrprintlab?: PreviewExtras } | undefined;
    viewDirRef.current.set(...cameraDirection(extras?.vrprintlab?.facing, extras?.vrprintlab?.up));
    camera.position.copy(viewDirRef.current).multiplyScalar(camera.position.length() || 2.5);
    camera.lookAt(0, 0, 0);
  }, [gltf, camera, viewDirRef]);
  const { scene, materials, prints: printTextures, edges } = useMemo(() => buildRig(gltf.scene, slots), [gltf.scene, slots]);
  const textFonts = useTextFonts(Object.values(params.slots).flatMap((p) => (p.kind === "print" && p.text ? [p.text.font] : [])));

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
      edges.forEach(({ mesh }) => mesh.geometry.dispose());
    },
    [printTextures, materials, edges],
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
        const loops = drawPrint(
          target.canvas,
          slotParams,
          image ?? null,
          backgroundColor(slot as PrintSlot, params),
          slotParams.text && textFonts[slotParams.text.font],
          (slot as PrintSlot).outline,
        );
        target.texture.needsUpdate = true;
        const edge = edges.get(slot.key);
        if (edge) updateEdge(edge, loops);
      }
    }
  }, [slots, params, images, materials, printTextures, textFonts, edges]);

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
        <ModelError />
      );
    }
    return this.props.children;
  }
}

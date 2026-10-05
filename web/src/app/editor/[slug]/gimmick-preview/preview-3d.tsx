"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { magicCircleSvg } from "@/lib/gimmicks/magic-circle";
import type { GimmickSelection } from "@/lib/gimmicks/schema";
import { bool, color, findSelection, num, type PreviewState } from "./spec";

// ギミックのプレビュー（3D側）。Unity の組み立てスクリプト（VRPrintLabPrefabBuilder.cs）と
// 各スクリプト（gimmicks/unity/Runtime）の動きを、大きさ・速さ・色をなるべく合わせて再現する。
//
// 構成:
//   GimmickBody   … モデルを包み、持ち上げ・回転・揺れなどの動きを付ける（Bounds の中に置く）
//   GimmickEffects … 粒・魔法陣・ライト・軌跡・スイッチ（視点合わせの範囲に入れないよう Bounds の外に置く）
// 両者とモデルのマテリアルは PreviewRig（ref）を通して値をやり取りする

export type MaterialFx = { emissive: THREE.Color; emissiveLevel: number; opacity: number };

export type PreviewRig = {
  // 動かしていないときのモデルの範囲（ワールド座標）
  box: THREE.Box3 | null;
  // 本体ごと動かすグループ（持ち上げ・ついてくる）。演出はこの位置に合わせて動く
  carry: THREE.Group | null;
  fx: MaterialFx;
  // 「手で触れると光る」用: 最後に触った時刻と、手で持っている最中かどうか
  touchedAt: number;
  holding: boolean;
  // 「持って振るとキラキラ」で、粒を出す回数の累計
  bursts: number;
  // サムネイルの撮影中だけ、動き・演出・暗さを止める処理（戻す関数を返す）
  captureHooks: Set<() => () => void>;
};

export const NEUTRAL_FX: MaterialFx = { emissive: new THREE.Color(0, 0, 0), emissiveLevel: 0, opacity: 1 };

export function createPreviewRig(): PreviewRig {
  return { box: null, carry: null, fx: { ...NEUTRAL_FX, emissive: new THREE.Color(0, 0, 0) }, touchedAt: -Infinity, holding: false, bursts: 0, captureHooks: new Set() };
}

// ---- マテリアル（発光・半透明） ----

type MaterialBase = { transparent: boolean; opacity: number; depthWrite: boolean; emissiveMap: THREE.Texture | null };
const materialBases = new WeakMap<THREE.MeshStandardMaterial, MaterialBase>();

// モデルの全マテリアルに発光・半透明を反映する（Unity では発光色にメインテクスチャを掛けるので、emissiveMap に同じ画像を使う）
export function applyMaterialFx(materials: Iterable<THREE.MeshStandardMaterial>, fx: MaterialFx) {
  for (const m of materials) {
    let base = materialBases.get(m);
    if (!base) {
      base = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, emissiveMap: m.emissiveMap };
      materialBases.set(m, base);
    }
    const glowing = fx.emissiveLevel > 0;
    m.emissive.copy(fx.emissive).multiplyScalar(glowing ? fx.emissiveLevel : 0);
    const emissiveMap = glowing ? (m.map ?? base.emissiveMap) : base.emissiveMap;
    const see = fx.opacity < 1;
    const transparent = see || base.transparent;
    if (m.emissiveMap !== emissiveMap || m.transparent !== transparent) m.needsUpdate = true;
    m.emissiveMap = emissiveMap;
    m.transparent = transparent;
    m.opacity = see ? fx.opacity : base.opacity;
    m.depthWrite = see ? false : base.depthWrite;
  }
}

// ---- 共通の計算 ----

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const axisOf = (value: unknown) => AXES[Number(value) === 0 ? 0 : Number(value) === 2 ? 2 : 1];
// Unity の Mathf.DeltaAngle と同じ（-180〜180°）
const deltaAngle = (from: number, to: number) => {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};

const HOLD_SECONDS = 3.4;
const SHAKE_SECONDS = 2.6;

type BodySim = {
  lastTouches: number;
  actionId: number | null;
  actionStart: number;
  spin: number;
  step: number;
  swayAngle: number;
  swayVelocity: number;
  swayAxis: THREE.Vector3;
  glow: number;
  follow: THREE.Vector3;
  fall: { y: number; vy: number } | null;
  lastShakeSign: number;
};

// ---- 本体の動き ----

export function GimmickBody({
  rigRef,
  selected,
  preview,
  modelKey,
  onPrimary,
  children,
}: {
  rigRef: RefObject<PreviewRig>;
  selected: GimmickSelection[];
  preview: PreviewState;
  modelKey: string;
  onPrimary: (() => void) | null;
  children: ReactNode;
}) {
  const carryRef = useRef<THREE.Group>(null);
  const motionRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);
  const simRef = useRef<BodySim>({
    lastTouches: 0,
    actionId: null,
    actionStart: 0,
    spin: 0,
    step: 0,
    swayAngle: 0,
    swayVelocity: 0,
    swayAxis: new THREE.Vector3(1, 0, 0),
    glow: 0,
    follow: new THREE.Vector3(),
    fall: null,
    lastShakeSign: 0,
  });

  // 動かしていない状態でモデルの範囲を測り、本体を包むグループの基準点にする
  useEffect(() => {
    const carry = carryRef.current;
    const motion = motionRef.current;
    const inner = innerRef.current;
    if (!carry || !motion || !inner) return;
    carry.position.set(0, 0, 0);
    carry.quaternion.identity();
    motion.position.set(0, 0, 0);
    motion.quaternion.identity();
    inner.position.set(0, 0, 0);
    carry.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(inner);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    carry.position.copy(center);
    inner.position.copy(center).negate();
    const rig = rigRef.current;
    rig.box = box;
    rig.carry = carry;
    return () => {
      rig.box = null;
      rig.carry = null;
    };
  }, [modelKey, rigRef]);

  // サムネイルの撮影中は止まった状態に戻す
  useEffect(() => {
    const hooks = rigRef.current.captureHooks;
    const hook = () => {
      const carry = carryRef.current;
      const motion = motionRef.current;
      const inner = innerRef.current;
      const box = rigRef.current.box;
      if (!carry || !motion || !inner || !box) return () => {};
      const saved = { carry: carry.position.clone(), carryQ: carry.quaternion.clone(), motionQ: motion.quaternion.clone(), visible: inner.visible };
      carry.position.copy(box.getCenter(new THREE.Vector3()));
      carry.quaternion.identity();
      motion.quaternion.identity();
      inner.visible = true;
      return () => {
        carry.position.copy(saved.carry);
        carry.quaternion.copy(saved.carryQ);
        motion.quaternion.copy(saved.motionQ);
        inner.visible = saved.visible;
      };
    };
    hooks.add(hook);
    return () => {
      hooks.delete(hook);
    };
  }, [rigRef]);

  useFrame((state, rawDelta) => {
    const rig = rigRef.current;
    const carry = carryRef.current;
    const motion = motionRef.current;
    const inner = innerRef.current;
    const sim = simRef.current;
    const box = rig.box;
    if (!carry || !motion || !inner || !box) return;
    const delta = Math.min(rawDelta, 0.1);
    const now = state.clock.elapsedTime;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const width = Math.max(size.x, size.z);
    const get = (slug: string) => findSelection(selected, slug);

    if (!preview.playing) {
      carry.position.copy(center);
      carry.quaternion.identity();
      motion.position.set(0, 0, 0);
      motion.quaternion.identity();
      inner.position.copy(center).negate();
      inner.visible = true;
      rig.fx.emissiveLevel = 0;
      rig.fx.opacity = 1;
      rig.holding = false;
      Object.assign(sim, { lastTouches: preview.touches, actionId: preview.action?.id ?? null, spin: 0, step: 0, swayAngle: 0, swayVelocity: 0, glow: 0, fall: null });
      sim.follow.set(0, 0, 0);
      return;
    }

    // 「触る」が押された（回数が増えた）
    if (preview.touches !== sim.lastTouches) {
      if (preview.touches > sim.lastTouches) {
        rig.touchedAt = now;
        const sway = get("sway-on-touch");
        if (sway) {
          // 実際は触れた側から押されたように倒れる（VRPLTouchSway）。正面から押すと奥へ倒れて見えにくいため、
          // プレビューでは横から触れたことにして、画面の左右に揺れるようにする（視線の向きを回転の軸にする）
          const view = carry.getWorldPosition(new THREE.Vector3()).sub(state.camera.position);
          view.y = 0;
          if (view.lengthSq() < 1e-6) view.set(0, 0, -1);
          sim.swayAxis.copy(view.normalize());
          sim.swayVelocity += num(sway.params, "strength", 15) * 8;
        }
      }
      sim.lastTouches = preview.touches;
    }
    if ((preview.action?.id ?? null) !== sim.actionId) {
      sim.actionId = preview.action?.id ?? null;
      sim.actionStart = now;
      sim.fall = null;
      sim.lastShakeSign = 0;
    }
    const odd = preview.touches % 2 === 1;

    // ---- 本体ごとの移動（持つ・振る・ついてくる） ----
    const offset = new THREE.Vector3();
    const tilt = new THREE.Euler();
    rig.holding = false;
    const action = preview.action;
    const t = now - sim.actionStart;
    // 動きは画面の中に収まる大きさにする（視点は本体が収まる距離に合わせているため）
    const lift = size.y * 0.12;
    const pickup = get("pickup");
    const shake = get("shake-sparkle");
    const follow = get("follow");
    if (action?.kind === "hold" && pickup && t < HOLD_SECONDS + 1.5) {
      const physics = bool(pickup.params, "physics", false);
      if (t < 0.5) {
        offset.y = lift * easeInOut(t / 0.5);
      } else if (t < 2.6) {
        const a = ((t - 0.5) / 2.1) * Math.PI * 2;
        offset.set(Math.sin(a) * width * 0.4, lift + Math.sin(a * 2) * size.y * 0.05, -(1 - Math.cos(a)) * width * 0.25);
        tilt.z = -Math.cos(a) * 0.12;
      } else if (physics) {
        // 物理あり: 手を離すと落ちて弾む
        if (!sim.fall) sim.fall = { y: lift, vy: 0 };
        const fall = sim.fall;
        fall.vy -= 9.8 * delta;
        fall.y += fall.vy * delta;
        if (fall.y < 0) {
          fall.y = 0;
          fall.vy = Math.abs(fall.vy) > 0.3 ? -fall.vy * 0.35 : 0;
        }
        offset.y = fall.y;
      } else {
        offset.y = lift * (1 - easeInOut(clamp01((t - 2.6) / 0.8)));
      }
      rig.holding = t < 2.6;
    } else if (action?.kind === "shake" && shake && t < SHAKE_SECONDS) {
      if (t < 0.4) {
        offset.y = lift * easeInOut(t / 0.4);
      } else if (t < 2.0) {
        const phase = (t - 0.4) * Math.PI * 2 * 3.5;
        const s = Math.sin(phase);
        offset.set(s * width * 0.2, lift, 0);
        tilt.z = -s * 0.25;
        // 振りの速さがいちばん速くなる（真ん中を通る）たびに粒を出す。VRPLShakeSparkle は 8 個ずつ
        const sign = Math.sign(Math.cos(phase));
        if (sim.lastShakeSign !== 0 && sign !== sim.lastShakeSign) rig.bursts += 1;
        sim.lastShakeSign = sign;
      } else {
        offset.y = lift * (1 - easeInOut(clamp01((t - 2.0) / 0.6)));
      }
      rig.holding = t < 2.0;
    }
    if (follow) {
      // 実際は触った人の肩のあたりについていく。プレビューでは歩き回る人についていく動きをその場で再現する
      const target = odd
        ? new THREE.Vector3(Math.sin(now * 0.7) * width * 0.35, size.y * 0.15 + Math.sin(now * 1.6) * size.y * 0.05, -Math.abs(Math.sin(now * 0.45)) * width * 0.4)
        : new THREE.Vector3();
      sim.follow.lerp(target, 1 - Math.exp(-(odd ? 3 : 2) * delta));
      offset.add(sim.follow);
    }
    carry.position.copy(center).add(offset);
    carry.quaternion.setFromEuler(tilt);

    // ---- 軸を中心にした回転（回転・段階回転・揺れ） ----
    const pivot = get("sway-on-touch") ? new THREE.Vector3(0, -size.y / 2, 0) : new THREE.Vector3();
    motion.position.copy(pivot);
    inner.position.copy(center).negate().sub(pivot);
    const spin = get("spin");
    const step = get("step-rotate");
    const sway = get("sway-on-touch");
    if (spin) {
      sim.spin = (sim.spin + num(spin.params, "speed", 45) * delta) % 360;
      motion.quaternion.setFromAxisAngle(axisOf(spin.params.axis), THREE.MathUtils.degToRad(sim.spin));
    } else if (step) {
      const steps = Math.max(2, Math.round(num(step.params, "steps", 4)));
      const target = (preview.touches % steps) * (360 / steps);
      // 最後の段階から最初に戻るときも同じ向きに回る（VRPLStepRotate と同じ）
      sim.step += deltaAngle(sim.step, target) * Math.min(1, delta * 8);
      motion.quaternion.setFromAxisAngle(axisOf(step.params.axis), THREE.MathUtils.degToRad(sim.step));
    } else if (sway) {
      // ばねの揺れ（VRPLTouchSway: stiffness 40, damping 4）
      const strength = num(sway.params, "strength", 15);
      const acceleration = -40 * sim.swayAngle - 4 * sim.swayVelocity;
      sim.swayVelocity += acceleration * delta;
      sim.swayAngle = THREE.MathUtils.clamp(sim.swayAngle + sim.swayVelocity * delta, -strength * 1.5, strength * 1.5);
      motion.quaternion.setFromAxisAngle(sim.swayAxis, THREE.MathUtils.degToRad(sim.swayAngle));
    } else {
      motion.quaternion.identity();
    }

    // ---- 表示・非表示 ----
    const visibility = get("toggle-visibility");
    inner.visible = visibility ? bool(visibility.params, "startVisible", true) !== odd : true;

    // ---- 発光・半透明（マテリアルの系統は1つしか選べない） ----
    const glow = get("glow");
    const touchGlow = get("glow-on-touch");
    const approach = get("glow-on-approach");
    const transparency = get("toggle-transparency");
    let level = 0;
    let glowColor = "#ffffff";
    if (glow) {
      level = num(glow.params, "intensity", 1);
      glowColor = color(glow.params, "glowColor", "#ffffff");
    } else if (touchGlow || approach) {
      const g = (touchGlow ?? approach)!;
      const near = touchGlow ? now - rig.touchedAt < 1.2 || rig.holding : preview.near;
      // fadeSpeed 4（0.25秒で切り替わる）
      sim.glow = near ? Math.min(1, sim.glow + delta * 4) : Math.max(0, sim.glow - delta * 4);
      level = num(g.params, "intensity", 2) * sim.glow;
      glowColor = color(g.params, "glowColor", "#ffffff");
    }
    rig.fx.emissive.set(glowColor);
    rig.fx.emissiveLevel = level;
    rig.fx.opacity = transparency && odd ? num(transparency.params, "opacity", 40) / 100 : 1;
  });

  function onClick(e: ThreeEvent<MouseEvent>) {
    // ドラッグで視点を回したときは触らない
    if (!onPrimary || !preview.playing || e.delta > 4) return;
    e.stopPropagation();
    onPrimary();
  }

  return (
    <group ref={carryRef}>
      <group ref={motionRef}>
        <group ref={innerRef} onClick={onClick}>
          {children}
        </group>
      </group>
    </group>
  );
}

// ---- 粒（パーティクル） ----

const MAX_PARTICLES = 300;

// Unity の Default-ParticleSystem に近い、ふちがぼやけた丸
function createDotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ワールド座標で動く粒の集まり（持って動かすと、出た粒はその場に残る。Unity の simulationSpace = World）
class ParticlePool {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 4);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly ages = new Float32Array(MAX_PARTICLES);
  private readonly lifetimes = new Float32Array(MAX_PARTICLES);
  private readonly tint = new THREE.Color();
  private next = 0;
  private pending = 0;

  constructor(texture: THREE.Texture) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({ size: 0.02, map: texture, vertexColors: true, transparent: true, depthWrite: false });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  setLook(size: number, hex: string) {
    (this.points.material as THREE.PointsMaterial).size = size;
    this.tint.set(hex);
  }

  // rate: 1秒あたりの数。sample で出る位置と速度を決める
  emitOverTime(rate: number, delta: number, lifetime: number, sample: (position: THREE.Vector3, velocity: THREE.Vector3) => void) {
    this.pending += rate * delta;
    const count = Math.floor(this.pending);
    this.pending -= count;
    this.emit(count, lifetime, sample);
  }

  emit(count: number, lifetime: number, sample: (position: THREE.Vector3, velocity: THREE.Vector3) => void) {
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      sample(p.set(0, 0, 0), v.set(0, 0, 0));
      p.toArray(this.positions, i * 3);
      v.toArray(this.velocities, i * 3);
      this.ages[i] = 0;
      this.lifetimes[i] = lifetime;
      this.colors[i * 4] = this.tint.r;
      this.colors[i * 4 + 1] = this.tint.g;
      this.colors[i * 4 + 2] = this.tint.b;
    }
  }

  update(delta: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.lifetimes[i] <= 0) {
        this.colors[i * 4 + 3] = 0;
        continue;
      }
      this.ages[i] += delta;
      const life = this.ages[i] / this.lifetimes[i];
      if (life >= 1) {
        this.lifetimes[i] = 0;
        this.colors[i * 4 + 3] = 0;
        continue;
      }
      for (let k = 0; k < 3; k++) this.positions[i * 3 + k] += this.velocities[i * 3 + k] * delta;
      // 出てすぐ現れ、だんだん消える（Unity の colorOverLifetime: 0→1（20%）→0）
      this.colors[i * 4 + 3] = life < 0.2 ? life / 0.2 : 1 - (life - 0.2) / 0.8;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.lifetimes.fill(0);
    this.colors.fill(0);
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ---- 軌跡 ----

const MAX_TRAIL_POINTS = 200;

// 通ったあとに残る光の帯（Unity の TrailRenderer。先頭が濃く、time 秒で消える）
class Trail {
  readonly mesh: THREE.Mesh;
  private readonly positions = new Float32Array(MAX_TRAIL_POINTS * 2 * 3);
  private readonly colors = new Float32Array(MAX_TRAIL_POINTS * 2 * 4);
  private readonly points: { p: THREE.Vector3; t: number }[] = [];
  private readonly tint = new THREE.Color();

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < MAX_TRAIL_POINTS - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geometry.setIndex(index);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(head: THREE.Vector3, now: number, time: number, width: number, hex: string, camera: THREE.Camera) {
    this.tint.set(hex);
    const last = this.points[this.points.length - 1];
    if (!last || last.p.distanceTo(head) >= 0.02) this.points.push({ p: head.clone(), t: now });
    while (this.points.length > MAX_TRAIL_POINTS || (this.points.length > 0 && now - this.points[0].t > time)) this.points.shift();

    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const n = this.points.length;
    for (let i = 0; i < MAX_TRAIL_POINTS; i++) {
      for (let k = 0; k < 2; k++) this.colors[(i * 2 + k) * 4 + 3] = 0;
    }
    for (let i = 0; i < n; i++) {
      const { p, t } = this.points[i];
      const a = this.points[Math.max(0, i - 1)].p;
      const b = i === n - 1 ? head : this.points[i + 1].p;
      tangent.subVectors(b, a);
      view.subVectors(camera.position, p);
      side.crossVectors(tangent, view).normalize().multiplyScalar(width / 2);
      p.clone().add(side).toArray(this.positions, i * 2 * 3);
      p.clone().sub(side).toArray(this.positions, (i * 2 + 1) * 3);
      const alpha = clamp01(1 - (now - t) / time);
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 4;
        this.colors[o] = this.tint.r;
        this.colors[o + 1] = this.tint.g;
        this.colors[o + 2] = this.tint.b;
        this.colors[o + 3] = alpha;
      }
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  clear() {
    this.points.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function createMagicCircleTexture() {
  const texture = new THREE.TextureLoader().load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(magicCircleSvg(512))}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 演出をまとめて作り、毎フレーム動かす（three.js のオブジェクトの書き換えはこのクラスの中で行う）
class EffectsScene {
  readonly root = new THREE.Group();
  // 本体ごと動く部分（魔法陣・ライト・スイッチ）。本体の中心を原点にした座標で置く
  readonly attached = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly sparkle: ParticlePool;
  readonly aura: ParticlePool;
  readonly trail = new Trail();
  readonly circle: THREE.Mesh;
  readonly light = new THREE.PointLight();
  readonly switchBox: THREE.Mesh;
  private readonly dot = createDotTexture();
  private readonly circleTexture = createMagicCircleTexture();
  private circleAngle = 0;
  private lastBursts = 0;

  constructor() {
    this.sparkle = new ParticlePool(this.dot);
    this.aura = new ParticlePool(this.dot);
    this.circle = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.circleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.circle.rotation.x = -Math.PI / 2;
    this.switchBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: new THREE.Color(0, 0.635, 0.612) }));
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: "#3f3f46", roughness: 0.9 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.light.decay = 1;
    this.attached.matrixAutoUpdate = false;
    this.attached.add(this.circle, this.light, this.switchBox);
    this.root.add(this.attached, this.sparkle.points, this.aura.points, this.trail.mesh, this.ground);
  }

  update(args: {
    rig: PreviewRig;
    selected: GimmickSelection[];
    preview: PreviewState;
    delta: number;
    now: number;
    camera: THREE.Camera;
  }) {
    const { rig, selected, preview, delta, now, camera } = args;
    const box = rig.box;
    const carry = rig.carry;
    const get = (slug: string) => findSelection(selected, slug);
    this.root.visible = Boolean(box && carry);
    if (!box || !carry) return;

    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.z) / 2;
    const magnitude = size.length();
    const odd = preview.touches % 2 === 1;
    // PointsMaterial の size は画面の高さの半分を基準にした値なので、ワールドの大きさに合わせて 1/tan(視野角/2) を掛ける
    const pointScale = camera instanceof THREE.PerspectiveCamera ? 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : 1;

    // 暗い場所で見るときは、光や魔法陣が映るように床を置く
    this.ground.visible = preview.dark;
    this.ground.position.set(box.getCenter(new THREE.Vector3()).x, box.min.y - 0.002, box.getCenter(new THREE.Vector3()).z);
    this.ground.scale.setScalar(magnitude * 2.5);

    const playing = preview.playing;
    this.attached.visible = playing;
    this.sparkle.points.visible = playing;
    this.aura.points.visible = playing;
    this.trail.mesh.visible = playing;
    if (!playing) {
      this.sparkle.clear();
      this.aura.clear();
      this.trail.clear();
      this.lastBursts = rig.bursts;
      return;
    }

    carry.updateWorldMatrix(true, false);
    this.attached.matrix.copy(carry.matrixWorld);
    this.attached.matrixWorldNeedsUpdate = true;
    const toWorld = (v: THREE.Vector3) => v.applyMatrix4(carry.matrixWorld);

    // キラキラ（本体を少し広げた箱の中から出る。Unity: 寿命 1.5 秒、大きさ = 範囲の対角 × 0.025）
    const particles = get("particles") ?? get("toggle-particles") ?? get("shake-sparkle");
    if (particles) {
      this.sparkle.setLook(magnitude * 0.025 * pointScale, color(particles.params, "color", "#fff4b0"));
      const sample = (p: THREE.Vector3, v: THREE.Vector3) => {
        toWorld(p.set((Math.random() - 0.5) * size.x * 1.15, (Math.random() - 0.5) * size.y * 1.15, (Math.random() - 0.5) * size.z * 1.15));
        v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.05);
      };
      const on = particles.slug === "particles" || (particles.slug === "toggle-particles" && bool(particles.params, "startOn", true) !== odd);
      if (on) this.sparkle.emitOverTime(num(particles.params, "amount", 20), delta, 1.5, sample);
      if (particles.slug === "shake-sparkle" && rig.bursts > this.lastBursts) this.sparkle.emit((rig.bursts - this.lastBursts) * 8, 1.5, sample);
    }
    this.lastBursts = rig.bursts;
    this.sparkle.update(delta);

    // 魔法陣と、足元から立ちのぼる光の粒（Unity: 寿命 2.5 秒、毎秒 12 個、上向きの速さ = 高さ × 0.25）
    const magic = get("magic-circle");
    this.circle.visible = Boolean(magic);
    if (magic) {
      const hex = color(magic.params, "color", "#a78bfa");
      const width = Math.max(size.x, size.z) * num(magic.params, "size", 1.6);
      this.circleAngle += THREE.MathUtils.degToRad(num(magic.params, "spinSpeed", 20)) * delta;
      this.circle.position.set(0, -size.y / 2 + 0.005, 0);
      this.circle.scale.set(width, width, 1);
      this.circle.rotation.set(-Math.PI / 2, 0, this.circleAngle);
      // Legacy Particles/Additive は 2 × 色 × テクスチャ。組み立てでは色を 0.6 倍にしている
      (this.circle.material as THREE.MeshBasicMaterial).color.set(hex).multiplyScalar(1.2);
      this.aura.setLook(magnitude * 0.03 * pointScale, hex);
      this.aura.emitOverTime(12, delta, 2.5, (p, v) => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * extent * 0.9;
        toWorld(p.set(Math.cos(a) * r, -size.y / 2, Math.sin(a) * r));
        v.set(0, Math.max(0.05, size.y * 0.25), 0);
      });
    }
    this.aura.update(delta);

    // ライト（本体の上端に置く点光源）
    const light = get("toggle-light");
    this.light.visible = Boolean(light) && bool(light?.params ?? {}, "startOn", false) !== odd;
    if (light) {
      this.light.color.set(color(light.params, "color", "#ffe6b0"));
      this.light.intensity = num(light.params, "intensity", 1.5) * 2;
      this.light.distance = num(light.params, "range", 5);
      this.light.position.set(0, size.y / 2, 0);
    }

    // スイッチ（本体の右下に置く小さな箱）
    const visibility = get("toggle-visibility");
    this.switchBox.visible = Boolean(visibility);
    if (visibility) {
      const s = THREE.MathUtils.clamp(magnitude * 0.06, 0.06, 0.3);
      this.switchBox.scale.setScalar(s);
      this.switchBox.position.set(size.x / 2 + s * 1.5, -size.y / 2 + s / 2, 0);
    }

    // 軌跡（本体の中心が通ったあと）
    const trail = get("trail");
    this.trail.mesh.visible = Boolean(trail);
    if (trail) {
      const head = toWorld(new THREE.Vector3());
      this.trail.update(head, now, num(trail.params, "time", 1), num(trail.params, "width", 0.05), color(trail.params, "color", "#7dd3fc"), camera);
    } else {
      this.trail.clear();
    }
  }

  dispose() {
    this.sparkle.dispose();
    this.aura.dispose();
    this.trail.dispose();
    this.dot.dispose();
    this.circleTexture.dispose();
    for (const mesh of [this.circle, this.switchBox, this.ground]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}

export function GimmickEffects({
  rigRef,
  selected,
  preview,
  onPrimary,
}: {
  rigRef: RefObject<PreviewRig>;
  selected: GimmickSelection[];
  preview: PreviewState;
  onPrimary: (() => void) | null;
}) {
  const effects = useMemo(() => new EffectsScene(), []);

  useEffect(() => () => effects.dispose(), [effects]);

  useEffect(() => {
    const hooks = rigRef.current.captureHooks;
    const hook = () => {
      const visible = effects.root.visible;
      hideObject(effects.root);
      return () => showObject(effects.root, visible);
    };
    hooks.add(hook);
    return () => {
      hooks.delete(hook);
    };
  }, [effects, rigRef]);

  useFrame((state, delta) => {
    effects.update({ rig: rigRef.current, selected, preview, delta: Math.min(delta, 0.1), now: state.clock.elapsedTime, camera: state.camera });
  });

  function onClick(e: ThreeEvent<MouseEvent>) {
    // 「スイッチで表示・非表示」のスイッチをクリックしたら押す
    if (e.object !== effects.switchBox || !onPrimary || e.delta > 4) return;
    e.stopPropagation();
    onPrimary();
  }

  return <primitive object={effects.root} onClick={onClick} />;
}

function hideObject(object: THREE.Object3D) {
  object.visible = false;
}
function showObject(object: THREE.Object3D, visible: boolean) {
  object.visible = visible;
}

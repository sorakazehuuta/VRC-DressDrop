# セダンのテンプレート用モデルを bpy（Blender の Python モジュール）で作り、FBX に書き出す。
#   python build_sedan.py <出力フォルダ>（Python 3.11 + pip install bpy で実行する）
# 寸法の単位はメートル。作業中の座標は 前 = +X、左 = +Y、上 = +Z（右ハンドル: 運転席は Y < 0）
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


# ---------------------------------------------------------------- 曲線
def curve(points):
    """キーポイントを単調な3次補間（PCHIP）でつなぐ関数を返す"""
    pts = sorted(points)
    xs = np.array([p[0] for p in pts], float)
    ys = np.array([p[1] for p in pts], float)
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros_like(xs)
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        x = float(np.clip(x, xs[0], xs[-1]))
        i = min(int(np.searchsorted(xs, x, side="right")) - 1, len(h) - 1)
        t = (x - xs[i]) / h[i]
        return float(
            (2 * t**3 - 3 * t**2 + 1) * ys[i]
            + (t**3 - 2 * t**2 + t) * h[i] * m[i]
            + (-2 * t**3 + 3 * t**2) * ys[i + 1]
            + (t**3 - t**2) * h[i] * m[i + 1]
        )

    return f


# 側面から見た中心線の高さ（前端 → ボンネット → 窓 → ルーフ → 後窓 → トランク → 後端）
Z_TOP = curve([
    (2.35, 0.60), (2.335, 0.67), (2.29, 0.745), (2.18, 0.80), (1.85, 0.865), (1.45, 0.925),
    (1.03, 1.00), (0.70, 1.19), (0.32, 1.385), (0.08, 1.435), (-0.30, 1.455), (-0.70, 1.44),
    (-0.98, 1.40), (-1.30, 1.27), (-1.62, 1.145), (-1.72, 1.135), (-2.10, 1.125), (-2.25, 1.105),
    (-2.32, 1.05), (-2.35, 0.94),
])
# 窓の下端（ベルトライン）。後ろへ行くほど上がる
Z_BELT = curve([
    (2.30, 0.72), (1.60, 0.835), (1.02, 0.955), (0.0, 0.995), (-1.0, 1.035), (-1.70, 1.075),
    (-2.20, 1.07), (-2.30, 1.02),
])
Z_SILL = curve([
    (2.35, 0.33), (2.22, 0.27), (2.02, 0.22), (1.70, 0.20), (-1.70, 0.20), (-2.0, 0.225),
    (-2.25, 0.28), (-2.35, 0.36),
])
WIDTH = curve([
    (2.35, 0.62), (2.335, 0.70), (2.29, 0.78), (2.14, 0.85), (1.85, 0.89), (1.40, 0.90),
    (-1.40, 0.90), (-1.90, 0.885), (-2.15, 0.85), (-2.29, 0.78), (-2.335, 0.70), (-2.35, 0.62),
])
ROOF_Y = 0.62
ROOF_CROWN = 0.05
ROWS = 13


def section(x):
    """断面の半分（床の中心 → 側面 → 窓 → ルーフの中心）を (y, z) の配列で返す"""
    w, top, sill = WIDTH(x), Z_TOP(x), Z_SILL(x)
    belt = min(Z_BELT(x), top - 0.012)
    shoulder = min(belt - 0.115, belt - 0.01)
    yb = w - 0.045
    rise = max(top - ROOF_CROWN - belt, 0.0)
    tum = min(rise / 0.40, 1.0)
    yt = yb + (ROOF_Y - yb) * tum
    zt = max(belt, top - ROOF_CROWN)
    c = top - zt
    y10 = yt - 0.012
    p7, p9 = (yb, belt), (yt, zt)
    return [
        (0.0, sill),
        (w - 0.14, sill),
        (w - 0.03, sill + 0.03),
        (w, sill + 0.09),
        (w + 0.012, sill + 0.09 + (shoulder - sill - 0.09) * 0.55),
        (w + 0.010, shoulder),
        (yb + 0.022, belt - 0.018),
        p7,
        (p7[0] + (p9[0] - p7[0]) * 0.88, p7[1] + (p9[1] - p7[1]) * 0.88),
        p9,
        (y10, top - c * (y10 / max(yt, 1e-6)) ** 2),
        (yt * 0.6, top - c * 0.36),
        (0.0, top),
    ]


def point(row, x):
    y, z = section(x)[row]
    return (x, y, z)


# ---------------------------------------------------------------- 外板のグリッド
# 列（前から後ろへ）。warp は行ごとの X のずらし（ドアの継ぎ目を斜めにする）
SEAM_F = [(2.12, 2.108)]            # フロントバンパーとボンネット・フェンダーの継ぎ目
SEAM_R = [(-2.16, -2.172)]          # リアバンパーとトランク・リアフェンダーの継ぎ目
DOOR_SEAMS = [(0.962, 0.95), (-0.10, -0.112), (-0.96, -0.972)]
C_WARP = {5: -0.05, 6: -0.14, 7: -0.22, 8: 0.03}

COLS = [
    (2.35, None), (2.335, None), (2.30, None), (2.24, None), (2.18, None), (2.12, None), (2.108, None),
    (1.88, None), (1.62, None), (1.35, None), (1.075, None), (1.062, None), (1.03, None),
    (0.962, None), (0.95, None), (0.72, None), (0.50, None), (0.32, None), (0.10, None),
    (-0.05, None), (-0.10, None), (-0.112, None), (-0.16, None), (-0.45, None), (-0.72, None),
    (-0.96, C_WARP), (-0.972, C_WARP), (-1.30, None), (-1.62, None), (-1.66, None), (-1.672, None),
    (-1.92, None), (-2.16, None), (-2.172, None), (-2.25, None), (-2.30, None), (-2.335, None), (-2.35, None),
]


def col_x(col, row):
    x, warp = COLS[col]
    if warp:
        x += warp.get(row, 0.0)
    return x


def in_pairs(a, b, pairs):
    return any(abs(a - p[0]) < 1e-6 and abs(b - p[1]) < 1e-6 for p in pairs)


def glass_side(a, b):
    """側面の窓の範囲か（B ピラーを除く）"""
    return (0.95 >= a and b >= -0.05) or (-0.16 >= a and b >= -0.96)


def glass_top(a, b):
    """フロントガラス・リアガラスの範囲か"""
    return (1.03 >= a and b >= 0.32) or (-0.972 >= a and b >= -1.62)


def outer_material(c, band, side):
    """列 c と c+1 の間、行 band と band+1 の間の面のマテリアル"""
    a, b = COLS[c][0], COLS[c + 1][0]
    mid = (a + b) / 2
    bump_seam = in_pairs(a, b, SEAM_F + SEAM_R)
    if band <= 1:
        return "Underbody"
    if band == 2:
        return "Mat_Base"
    if 3 <= band <= 5:
        if bump_seam or in_pairs(a, b, DOOR_SEAMS):
            return "Panel_Gap"
        return f"Mat_Print_Side{side}" if -2.16 < mid < 2.12 else "Mat_Base"
    if band == 6:
        if bump_seam:
            return "Panel_Gap"
        return "Trim_Black" if -0.96 < mid < 0.95 else "Mat_Base"
    if band == 7:
        if glass_side(a, b):
            return "Glass"
        return "Trim_Black" if -0.96 < mid < 0.95 else "Mat_Base"
    if band == 8:
        return "Mat_Base"
    if band == 9:
        if -2.16 < mid < 2.12:
            return "Panel_Gap"
        return "Mat_Base"
    # 上面（ボンネット・窓・ルーフ・トランク）
    if bump_seam:
        return "Panel_Gap"
    if 1.075 < mid < 2.108:
        return "Mat_Print_Hood"
    if 1.03 < mid <= 1.075:
        return "Trim_Black"
    if glass_top(a, b):
        return "Glass"
    if -0.96 < mid < 0.32:
        return "Mat_Print_Roof"
    if -0.972 <= mid <= -0.96:
        return "Trim_Black"
    if -1.672 < mid < -1.62:
        return "Panel_Gap" if mid < -1.66 else "Mat_Base"
    if -2.16 < mid < -1.672:
        return "Mat_Print_Trunk"
    return "Mat_Base"


MATERIALS = {
    # 名前: (色, 金属感, つや, 発光の強さ)
    "Mat_Base": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Print_SideL": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Print_SideR": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Print_Hood": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Print_Roof": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Print_Trunk": ((0.90, 0.91, 0.93), 0.0, 0.85, 0),
    "Mat_Wheel": ((0.62, 0.64, 0.67), 0.9, 0.7, 0),
    "Mat_Interior_Seat": ((0.33, 0.25, 0.17), 0.0, 0.35, 0),
    "Mat_Interior_Trim": ((0.10, 0.10, 0.105), 0.0, 0.3, 0),
    "Mat_Interior_Ceiling": ((0.62, 0.60, 0.56), 0.0, 0.15, 0),
    "Interior_Carpet": ((0.05, 0.05, 0.055), 0.0, 0.1, 0),
    "Interior_Dark": ((0.025, 0.025, 0.03), 0.0, 0.45, 0),
    "Screen": ((0.02, 0.04, 0.07), 0.0, 0.9, 0.08),
    "Glass": ((0.06, 0.08, 0.09), 0.0, 0.95, 0),
    "Panel_Gap": ((0.012, 0.012, 0.014), 0.0, 0.1, 0),
    "Trim_Black": ((0.015, 0.015, 0.017), 0.0, 0.6, 0),
    "Underbody": ((0.02, 0.02, 0.022), 0.0, 0.15, 0),
    "Chrome": ((0.85, 0.86, 0.88), 1.0, 0.92, 0),
    "Tire": ((0.022, 0.022, 0.024), 0.0, 0.25, 0),
    "Light_Head": ((0.80, 0.84, 0.90), 0.8, 0.95, 0),
    "Light_Tail": ((0.55, 0.02, 0.03), 0.0, 0.9, 0),
    "Plate": ((0.88, 0.88, 0.86), 0.0, 0.5, 0),
    "Mirror": ((0.8, 0.82, 0.85), 1.0, 0.98, 0),
}


def make_materials():
    out = {}
    for name, (rgb, metal, smooth, emission) in MATERIALS.items():
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = (*rgb, 1)
        p.inputs["Metallic"].default_value = metal
        p.inputs["Roughness"].default_value = 1 - smooth
        if emission:
            p.inputs["Emission Color"].default_value = (*rgb, 1)
            p.inputs["Emission Strength"].default_value = emission * 8
        if name == "Glass":
            p.inputs["Alpha"].default_value = 0.34
            m.diffuse_color = (*rgb, 0.34)
        else:
            m.diffuse_color = (*rgb, 1)
        out[name] = m
    return out


class Builder:
    """頂点と面を貯めて、マテリアルごとに面を持つ bmesh を作る"""

    def __init__(self, mats):
        self.bm = bmesh.new()
        self.mats = list(mats)

    def index(self, mat):
        return self.mats.index(mat)

    def add(self, verts, faces, mat):
        vs = [self.bm.verts.new(tuple(v)) for v in verts]
        for f in faces:
            if len(set(f)) < 3:
                continue
            try:
                face = self.bm.faces.new([vs[i] for i in f])
                face.material_index = self.index(mat)
            except ValueError:
                pass
        return vs

    def add_mirror(self, verts, faces, mat):
        """Y = 0 で反転した分も足す"""
        self.add(verts, faces, mat)
        self.add([(v[0], -v[1], v[2]) for v in verts], [tuple(reversed(f)) for f in faces], mat)

    def box(self, center, size, mat, bevel=0.2, rot=None, segments=1):
        """面取りした箱。rot は (軸, 角度) の並び"""
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel / 2, offset_type="OFFSET", segments=segments,
                            profile=0.5, affect="EDGES")
        m = Matrix.Translation(center)
        for axis, angle in rot or []:
            m = m @ Matrix.Rotation(angle, 4, axis)
        m = m @ Matrix.Diagonal((*size, 1))
        verts = [m @ v.co for v in tmp.verts]
        tmp.verts.index_update()
        faces = [tuple(v.index for v in f.verts) for f in tmp.faces]
        tmp.free()
        self.add(verts, faces, mat)

    def mirror_box(self, center, size, mat, bevel=0.2, rot=None):
        self.box(center, size, mat, bevel, rot)
        r = [(ax, -an if ax != "Y" else an) for ax, an in rot or []]
        self.box((center[0], -center[1], center[2]), size, mat, bevel, r)

    def lathe(self, profile, segments, mat, center=(0, 0, 0), axis="Y", scale=(1, 1, 1), away=(0.0, 0.0), flip=False):
        """profile = (半径, 軸方向の位置) の並びを軸のまわりに回す。

        面の表は、輪郭の平面で点 away（半径, 軸方向）から離れる向き（flip なら近づく向き）にする"""
        verts, faces = [], []
        n = len(profile)
        axis_vec = {"Y": Vector((0, 1, 0)), "X": Vector((1, 0, 0)), "Z": Vector((0, 0, 1))}[axis]
        for s in range(segments):
            a = 2 * math.pi * s / segments
            for r, t in profile:
                c, d = r * math.cos(a), r * math.sin(a)
                v = {"Y": (c, t, d), "X": (t, c, d), "Z": (c, d, t)}[axis]
                verts.append((v[0] * scale[0] + center[0], v[1] * scale[1] + center[1], v[2] * scale[2] + center[2]))
        for s in range(segments):
            s2 = (s + 1) % segments
            for i in range(n - 1):
                f = (s * n + i, s2 * n + i, s2 * n + i + 1, s * n + i + 1)
                p = [Vector(verts[k]) for k in f]
                normal = (p[2] - p[0]).cross(p[3] - p[1])
                mid = (p[0] + p[1] + p[2] + p[3]) / 4 - Vector(center)
                t = mid.dot(axis_vec)
                radial = mid - axis_vec * t
                r = radial.length
                if r > 1e-9:
                    radial /= r
                want = radial * (r - away[0]) + axis_vec * (t - away[1])
                if (normal.dot(want) < 0) != flip:
                    f = tuple(reversed(f))
                faces.append(f)
        return self.add(verts, faces, mat)

    def to_mesh(self, name, materials, sharp_angle):
        finish_mesh(self.bm, sharp_angle)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(materials[m])
        return me


def finish_mesh(bm, sharp_angle):
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method="BEAUTY", ngon_method="BEAUTY")
    limit = math.radians(sharp_angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = True
        if len(e.link_faces) == 2:
            a, b = e.link_faces
            if a.calc_area() > 1e-9 and b.calc_area() > 1e-9 and a.normal.angle(b.normal, 0) > limit:
                e.smooth = False
            if (a.material_index != b.material_index) and SHARP_MATERIALS & {a.material_index, b.material_index}:
                e.smooth = False


SHARP_MATERIALS = set()


# ---------------------------------------------------------------- 外板
def build_shell(materials):
    b = Builder(MATERIALS)
    verts, index = [], {}
    for c in range(len(COLS)):
        for r in range(ROWS):
            index[c, r] = len(verts)
            verts.append(point(r, col_x(c, r)))
    by_mat = {}
    for c in range(len(COLS) - 1):
        for band in range(ROWS - 1):
            f = (index[c, band], index[c + 1, band], index[c + 1, band + 1], index[c, band + 1])
            by_mat.setdefault((band, c), f)
    bm = b.bm
    for side, sign in (("L", 1), ("R", -1)):
        vs = [bm.verts.new((v[0], v[1] * sign, v[2])) for v in verts]
        for (band, c), f in by_mat.items():
            q = [vs[i] for i in (f if sign > 0 else reversed(f))]
            if len({v.co.to_tuple(5) for v in q}) < 3:
                continue
            face = bm.faces.new(q)
            face.material_index = b.index(outer_material(c, band, side))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # 前後の端をふさぐ
    edges = [e for e in bm.edges if e.is_boundary]
    made = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    for f in made["faces"]:
        f.material_index = b.index("Mat_Base")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("shell")
    bm.to_mesh(me)
    bm.free()
    for m in b.mats:
        me.materials.append(materials[m])
    return me


WHEEL_X = (1.40, -1.35)
WHEEL_R = 0.334
WHEEL_Y = 0.785
ARCH_R = 0.378


def cut_wheel_arches(shell_me, materials):
    """タイヤハウスをブーリアンで切り抜く"""
    obj = bpy.data.objects.new("shell", shell_me)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    idx = list(MATERIALS).index("Underbody")
    for x in WHEEL_X:
        for sign in (1, -1):
            ring = []
            for i in range(36):
                a = 2 * math.pi * i / 36
                ring.append((x + ARCH_R * math.cos(a), WHEEL_R + 0.02 + ARCH_R * math.sin(a)))
            y0, y1 = 0.60 * sign, 1.2 * sign
            lo = [bm.verts.new((p[0], y0, p[1])) for p in ring]
            hi = [bm.verts.new((p[0], y1, p[1])) for p in ring]
            for i in range(36):
                j = (i + 1) % 36
                bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
            bm.faces.new(lo)
            bm.faces.new(list(reversed(hi)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.material_index = idx
    cme = bpy.data.meshes.new("cutter")
    bm.to_mesh(cme)
    bm.free()
    for m in MATERIALS:
        cme.materials.append(materials[m])
    cutter = bpy.data.objects.new("cutter", cme)
    bpy.context.collection.objects.link(cutter)
    mod = obj.modifiers.new("arch", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "TRANSFER"
    deps = bpy.context.evaluated_depsgraph_get()
    result = bpy.data.meshes.new_from_object(obj.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
    bpy.data.objects.remove(obj)
    bpy.data.objects.remove(cutter)
    return result


def reduce_flat_faces(bm, angle):
    """平らな部分の面をまとめて三角形を減らす（マテリアルの境界は残す）"""
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle), use_dissolve_boundaries=False,
                             verts=list(bm.verts), edges=list(bm.edges), delimit={"MATERIAL"})


def assign_print_uv(bm):
    """プリント面の UV。どの面も外から見て画像が正立し、左右反転しないように投影する"""
    uv = bm.loops.layers.uv.verify()
    names = list(MATERIALS)
    # 面ごとの範囲を求める
    bounds = {}
    for f in bm.faces:
        name = names[f.material_index]
        if name.startswith("Mat_Print_"):
            pts = [v.co for v in f.verts]
            lo, hi = bounds.setdefault(name, [Vector((9, 9, 9)), Vector((-9, -9, -9))])
            for p in pts:
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
    aspect = {}
    for name, (lo, hi) in bounds.items():
        size = hi - lo
        aspect[name] = size.x / size.z if "Side" in name else size.y / size.x
    for f in bm.faces:
        name = names[f.material_index]
        if name not in bounds:
            for l in f.loops:
                l[uv].uv = (0, 0)
            continue
        lo, hi = bounds[name]
        size = hi - lo
        for l in f.loops:
            p = l.vert.co
            if name == "Mat_Print_SideL":    # 左側面（Y > 0）を外から見ると、車の前は画面の左
                u, v = (hi.x - p.x) / size.x, (p.z - lo.z) / size.z
            elif name == "Mat_Print_SideR":  # 右側面を外から見ると、車の前は画面の右
                u, v = (p.x - lo.x) / size.x, (p.z - lo.z) / size.z
            elif name == "Mat_Print_Trunk":  # 後ろから見て正立
                u, v = (hi.y - p.y) / size.y, (p.x - lo.x) / size.x
            else:                            # ボンネット・ルーフは前から見て正立
                u, v = (p.y - lo.y) / size.y, (hi.x - p.x) / size.x
            l[uv].uv = (u, v)
    return aspect


def build_body(materials):
    me = cut_wheel_arches(build_shell(materials), materials)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    reduce_flat_faces(bm, 0.6)
    bm.normal_update()
    print("  外板のあと面数", len(bm.faces), "非多様体の辺", sum(1 for e in bm.edges if not e.is_manifold))
    return bm


# ---------------------------------------------------------------- 表面に沿う小物
class Surface:
    def __init__(self, bm):
        self.tree = BVHTree.FromBMesh(bm)

    def hit(self, origin, direction):
        loc, normal, _, _ = self.tree.ray_cast(Vector(origin), Vector(direction).normalized(), 8.0)
        return (loc, normal) if loc is not None else (None, None)


def patch(b, surf, upper, lower, direction, mat, columns=6, rows=2, offset=0.012, mirror=True):
    """upper と lower の折れ線の間を、direction の向きに外板へ投影した面にする。

    点は start 面（投影の出発点）の座標。外板の外側に出発点を置く"""
    direction = Vector(direction).normalized()

    def along(line, t):
        s = t * (len(line) - 1)
        i = min(int(s), len(line) - 2)
        return Vector(line[i]).lerp(Vector(line[i + 1]), s - i)

    verts, grid = [], {}
    for c in range(columns + 1):
        a, d = along(upper, c / columns), along(lower, c / columns)
        for r in range(rows + 1):
            o = a.lerp(d, r / rows)
            loc, normal = surf.hit(o, direction)
            if loc is None:
                continue
            grid[c, r] = len(verts)
            verts.append(tuple(loc + (normal if normal.dot(direction) < 0 else -normal) * offset))
    faces = []
    for c in range(columns):
        for r in range(rows):
            ids = [grid.get(k) for k in ((c, r), (c, r + 1), (c + 1, r + 1), (c + 1, r))]
            if None in ids:
                continue
            p = [Vector(verts[i]) for i in ids]
            n = (p[1] - p[0]).cross(p[3] - p[0])
            faces.append(tuple(ids) if n.dot(direction) < 0 else tuple(reversed(ids)))
    if mirror:
        b.add_mirror(verts, faces, mat)
    else:
        b.add(verts, faces, mat)


def build_exterior_parts(materials, surf):
    b = Builder(MATERIALS)
    ORIGIN_F, ORIGIN_R = 3.0, -3.0
    front = (-1, 0, 0)
    rear = (1, 0, 0)

    def f(y, z):
        return (ORIGIN_F, y, z)

    def r(y, z):
        return (ORIGIN_R, y, z)

    # ヘッドライト（前から投影。端は側面へ回り込む）
    patch(b, surf, [f(0.385, 0.708), f(0.58, 0.733), f(0.74, 0.756), f(0.852, 0.780)],
          [f(0.44, 0.630), f(0.60, 0.638), f(0.74, 0.662), f(0.853, 0.734)], front, "Trim_Black", 7, 2, 0.010)
    patch(b, surf, [f(0.40, 0.700), f(0.58, 0.725), f(0.74, 0.748), f(0.845, 0.772)],
          [f(0.45, 0.640), f(0.60, 0.648), f(0.74, 0.672), f(0.848, 0.742)], front, "Light_Head", 7, 2, 0.016)
    # 中央のグリルと枠
    patch(b, surf, [f(0.0, 0.692), f(0.20, 0.690), f(0.40, 0.672)], [f(0.0, 0.565), f(0.20, 0.570), f(0.40, 0.600)],
          front, "Chrome", 5, 2, 0.012)
    patch(b, surf, [f(0.0, 0.680), f(0.20, 0.678), f(0.385, 0.662)], [f(0.0, 0.577), f(0.20, 0.582), f(0.385, 0.610)],
          front, "Trim_Black", 5, 2, 0.016)
    # バンパー下の開口
    patch(b, surf, [f(0.0, 0.50), f(0.30, 0.50), f(0.46, 0.515)], [f(0.0, 0.39), f(0.30, 0.39), f(0.42, 0.41)],
          front, "Trim_Black", 5, 2, 0.012)
    # ナンバープレート（文字なし）
    patch(b, surf, [f(0.0, 0.485), f(0.165, 0.485)], [f(0.0, 0.40), f(0.165, 0.40)], front, "Plate", 2, 2, 0.022)
    # テールランプ（後ろから投影）
    patch(b, surf, [r(0.36, 1.045), r(0.60, 1.065), r(0.78, 1.070), r(0.84, 1.075)],
          [r(0.40, 0.955), r(0.60, 0.965), r(0.74, 0.985), r(0.835, 1.03)], rear, "Light_Tail", 7, 2)
    # トランクのガーニッシュ
    patch(b, surf, [r(0.0, 1.02), r(0.36, 1.02)], [r(0.0, 0.985), r(0.40, 0.985)], rear, "Chrome", 4, 1, 0.012, True)
    patch(b, surf, [r(0.0, 0.875), r(0.30, 0.875)], [r(0.0, 0.72), r(0.27, 0.72)], rear, "Trim_Black", 3, 1, 0.012)
    patch(b, surf, [r(0.0, 0.84), r(0.165, 0.84)], [r(0.0, 0.755), r(0.165, 0.755)], rear, "Plate", 2, 2, 0.022)
    # リアバンパー下部の黒い部分
    patch(b, surf, [r(0.0, 0.50), r(0.45, 0.50), r(0.76, 0.54)], [r(0.0, 0.40), r(0.45, 0.40), r(0.68, 0.43)],
          rear, "Trim_Black", 5, 2, 0.012)

    # ドアミラー
    for sign in (1, -1):
        y = 0.985 * sign
        b.lathe([(0.0, 0.055), (0.045, 0.05), (0.06, 0.0), (0.05, -0.05), (0.0, -0.06)], 8, "Mat_Base",
                center=(0.70, y, 1.045), axis="X", scale=(1, 1.45, 0.95))
        b.box((0.685, y, 1.045), (0.012, 0.135, 0.09), "Mirror", 0.1)
        b.box((0.70, 0.905 * sign, 1.02), (0.05, 0.10, 0.03), "Trim_Black", 0.2)

    # ドアハンドル
    for x in (0.12, -0.74):
        y = WIDTH(x) + 0.004
        z = Z_BELT(x) - 0.095
        b.mirror_box((x, y + 0.012, z), (0.13, 0.02, 0.024), "Chrome", 0.3)

    # ワイパー
    for y0, y1 in ((-0.10, -0.62), (0.34, -0.12)):
        p0, p1 = Vector((1.045, y0, 0.995)), Vector((1.02, y1, 1.012))
        b.box((p0 + p1) / 2, ((p1 - p0).length, 0.012, 0.012), "Trim_Black", 0.2,
              [(Vector((0, 0, 1)), math.atan2((p1 - p0).y, (p1 - p0).x))])

    # シャークフィンアンテナ
    b.lathe([(0.0, 0.0), (0.03, 0.0), (0.03, 0.05), (0.0, 0.09)], 6, "Trim_Black", center=(-0.86, 0, 1.408),
            axis="Z", scale=(1.9, 0.9, 1))
    # マフラー
    for sign in (1, -1):
        b.lathe([(0.0, 0.0), (0.04, 0.0), (0.04, 0.05), (0.03, 0.05), (0.02, -0.04)], 10, "Chrome",
                center=(-2.345, 0.52 * sign, 0.355), axis="X")
    return b.to_mesh("Parts", materials, 45)


# ---------------------------------------------------------------- 内装
LINER_ROWS = [None, None, 3, 5, 7, 8, 9, 11, 12]
LINER_OUTER = {4: 7, 5: 8, 6: 10, 7: 11, 8: 12}
FLOOR_Z = 0.26


def liner_point(l, c):
    if l == 0:
        return (col_x(c, 0), 0.0, FLOOR_Z)
    if l == 1:
        x = col_x(c, 1)
        return (x, 0.56 if COLS[c][0] < -0.9 else WIDTH(x) - 0.11, FLOOR_Z)
    row = LINER_ROWS[l]
    x, y, z = point(row, col_x(c, row))
    if l == 2 and COLS[c][0] < -0.9:
        return (x, 0.56, 0.74)
    if l <= 3:
        return (x, y - 0.07, z)
    if l == 4:
        return (x, y - 0.05, z)
    if l == 5:
        return (x, y - 0.035, z - 0.01)
    return (x, y - (0.05 if l == 6 else 0), z - 0.045)


def build_liner(b):
    cols = [c for c in range(len(COLS)) if -1.62 - 1e-6 <= COLS[c][0] <= 1.03 + 1e-6]

    def is_hole(c, l):
        a, x = COLS[c][0], COLS[c + 1][0]
        if l == 4:
            return glass_side(a, x)
        if l in (6, 7):
            return glass_top(a, x)
        return False

    def liner_mat(c, l):
        if l <= 1:
            return "Interior_Carpet"
        if l <= 3:
            return "Mat_Interior_Trim"
        if l == 4:
            return "Mat_Interior_Trim"
        return "Mat_Interior_Ceiling"

    for c in cols[:-1]:
        for l in range(8):
            if is_hole(c, l):
                continue
            v = [liner_point(l, c), liner_point(l + 1, c), liner_point(l + 1, c + 1), liner_point(l, c + 1)]
            # 車内側を向くように、外板とは逆回り
            b.add_mirror(v, [(0, 1, 2, 3)], liner_mat(c, l))

    # 窓のまわりの見切り（内張りと外板のすき間をふさぐ）
    def outer(l, c):
        return point(LINER_OUTER[l], col_x(c, LINER_OUTER[l]))

    def reveal(p, q, target):
        a, d = Vector(liner_point(*p)), Vector(liner_point(*q))
        o1, o2 = Vector(outer(*p)), Vector(outer(*q))
        v = [a, d, o2, o1]
        n = (d - a).cross(o1 - a)
        face = (0, 1, 2, 3) if n.dot(target - a) > 0 else (3, 2, 1, 0)
        b.add_mirror([tuple(p) for p in v], [face], "Mat_Interior_Trim")

    def hole(c, l):
        return c in cols[:-1] and 0 <= l < 8 and is_hole(c, l)

    for c in cols[:-1]:
        for l in (4, 6, 7):
            if not is_hole(c, l):
                continue
            cen = Vector(liner_point(l, c)).lerp(Vector(liner_point(l + 1, c + 1)), 0.5)
            if not hole(c, l - 1):
                reveal((l, c), (l, c + 1), cen)
            if not hole(c, l + 1) and l != 7:
                reveal((l + 1, c), (l + 1, c + 1), cen)
            if not hole(c - 1, l):
                reveal((l, c), (l + 1, c), cen)
            if not hole(c + 1, l):
                reveal((l, c + 1), (l + 1, c + 1), cen)


def add_profile_strip(b, profile, ys, mat):
    """X-Z の断面を Y 方向に伸ばす。ys は (y, 断面の変形関数) の並び"""
    verts, faces = [], []
    n = len(profile)
    for y, fn in ys:
        for p in profile:
            q = fn(p) if fn else p
            verts.append((q[0], y, q[1]))
    for s in range(len(ys) - 1):
        for i in range(n - 1):
            a = s * n + i
            faces.append((a, a + n, a + n + 1, a + 1))
    b.add(verts, faces, mat)


def build_seat(b, x, y, width):
    """前席。座面・背もたれは中央をくぼませ、サイドを盛り上げる"""
    mat = "Mat_Interior_Seat"
    # 座面（左右の張り出しと中央）
    b.box((x, y, 0.445), (0.50, width * 0.62, 0.11), mat, 0.5, [("Y", -0.10)])
    for sign in (1, -1):
        b.box((x, y + sign * width * 0.40, 0.468), (0.52, width * 0.20, 0.14), mat, 0.6, [("Y", -0.10)])
    # 背もたれ
    tilt = 0.26
    bx, bz = x - 0.26, 0.76
    b.box((bx, y, bz), (0.12, width * 0.62, 0.60), mat, 0.5, [("Y", tilt)])
    for sign in (1, -1):
        b.box((bx + 0.012, y + sign * width * 0.40, bz), (0.17, width * 0.20, 0.60), mat, 0.6, [("Y", tilt)])
    # ヘッドレスト
    b.box((bx - 0.10, y, 1.145), (0.10, width * 0.54, 0.17), mat, 0.8, [("Y", tilt)], 2)
    for sign in (1, -1):
        b.box((bx - 0.075, y + sign * 0.06, 1.055), (0.012, 0.012, 0.06), "Chrome", 0)
    # 座面の下の台
    b.box((x, y, 0.32), (0.42, width * 0.8, 0.12), "Interior_Dark", 0.2)


def build_interior(materials):
    b = Builder(MATERIALS)
    build_liner(b)

    # ダッシュボード（断面を車幅方向に伸ばす）
    inner = 0.845
    prof = [(1.075, 0.975), (0.86, 0.985), (0.70, 0.965), (0.585, 0.935), (0.555, 0.88), (0.585, 0.74),
            (0.66, 0.60), (0.92, 0.50), (0.98, 0.26)]
    add_profile_strip(b, prof, [(-inner, None), (-0.60, None), (-0.13, None), (0.13, None), (0.60, None), (inner, None)],
                      "Mat_Interior_Trim")
    # メーターのひさし（右ハンドル）
    b.box((0.60, -0.39, 0.965), (0.20, 0.38, 0.08), "Mat_Interior_Trim", 0.3, None, 2)
    b.box((0.545, -0.39, 0.90), (0.012, 0.32, 0.085), "Screen", 0.1, [("Y", 0.25)])
    # センターの画面・エアコンの吹き出し口
    b.box((0.555, 0.0, 0.875), (0.02, 0.27, 0.15), "Screen", 0.1, [("Y", 0.12)])
    for y in (-0.70, -0.13, 0.13, 0.70):
        b.box((0.565, y, 0.905 if abs(y) < 0.5 else 0.885), (0.012, 0.11, 0.045), "Interior_Dark", 0.1)
    # 助手席側のパネルの線
    b.box((0.57, 0.40, 0.78), (0.015, 0.34, 0.012), "Chrome", 0.1)
    # センターコンソール
    b.box((0.16, 0, 0.385), (0.86, 0.20, 0.25), "Mat_Interior_Trim", 0.15)
    b.box((0.60, 0, 0.56), (0.24, 0.24, 0.58), "Mat_Interior_Trim", 0.15, [("Y", 0.35)])
    b.box((-0.16, 0, 0.53), (0.32, 0.17, 0.05), "Mat_Interior_Seat", 0.5)  # アームレスト
    b.box((0.26, 0.0, 0.525), (0.045, 0.03, 0.10), "Interior_Dark", 0.3)   # シフトレバー
    b.box((0.26, 0.0, 0.585), (0.06, 0.05, 0.06), "Chrome", 0.5)
    # ペダル（右ハンドル）
    for y, h in ((-0.50, 0.05), (-0.38, 0.05), (-0.26, 0.11)):
        b.box((0.78, y, 0.36 + h / 2), (0.015, 0.07, 0.03 + h), "Chrome", 0.15, [("Y", 0.45)])

    # 前席
    build_seat(b, -0.03, -0.39, 0.50)
    build_seat(b, -0.03, 0.39, 0.50)
    # 後席のベンチ
    mat = "Mat_Interior_Seat"
    b.box((-0.80, 0, 0.46), (0.34, 1.50, 0.17), mat, 0.4, [("Y", -0.08)])
    b.box((-1.02, 0, 0.46), (0.22, 1.10, 0.15), mat, 0.4, [("Y", -0.08)])
    b.box((-0.86, 0, 0.33), (0.46, 1.10, 0.12), "Interior_Dark", 0.1)
    b.box((-1.14, 0, 0.64), (0.13, 1.08, 0.34), mat, 0.4, [("Y", 0.20)])
    b.box((-1.185, 0, 0.91), (0.14, 1.50, 0.34), mat, 0.4, [("Y", 0.20)])
    for y in (-0.47, 0.47):
        b.box((-1.235, y, 1.125), (0.09, 0.26, 0.14), mat, 0.8, [("Y", 0.20)], 2)
    # 後席のアームレストの線・荷物棚
    b.box((-1.42, 0, 1.03), (0.46, 1.68, 0.06), "Interior_Dark", 0.05)
    b.box((-1.40, 0, 0.64), (0.40, 1.10, 0.76), "Interior_Dark", 0.0)

    # ドアの内張りの部品（アームレスト・引き手）
    for x0, x1 in ((0.85, -0.05), (-0.17, -0.90)):
        cx, ln = (x0 + x1) / 2, x0 - x1
        y = WIDTH(cx) - 0.095
        b.mirror_box((cx, y, 0.72), (ln * 0.72, 0.075, 0.05), "Mat_Interior_Seat", 0.5)
        b.mirror_box((cx, y + 0.03, 0.50), (ln * 0.72, 0.03, 0.09), "Interior_Dark", 0.2)
        b.mirror_box((x0 - 0.13, y + 0.018, 0.82), (0.09, 0.02, 0.028), "Chrome", 0.3)

    # ルームミラーとサンバイザー
    b.box((0.40, 0, 1.335), (0.02, 0.03, 0.05), "Interior_Dark", 0.2)
    b.box((0.385, 0, 1.285), (0.018, 0.24, 0.065), "Interior_Dark", 0.3)
    b.box((0.374, 0, 1.285), (0.003, 0.22, 0.05), "Mirror", 0)
    b.mirror_box((0.26, 0.34, 1.37), (0.16, 0.36, 0.014), "Mat_Interior_Ceiling", 0.3)
    return b.to_mesh("Interior", materials, 62)


def build_steering(materials):
    """ハンドル（原点は回転の中心。軸は X 方向に後ろ寄りへ傾いている）"""
    b = Builder(MATERIALS)
    rim_r, tube = 0.185, 0.016
    profile = []
    for i in range(6):
        a = 2 * math.pi * i / 6
        profile.append((rim_r + tube * math.cos(a), tube * math.sin(a)))
    profile.append(profile[0])
    b.lathe(profile, 24, "Interior_Dark", axis="X", away=(rim_r, 0.0))
    b.lathe([(0.0, 0.03), (0.05, 0.03), (0.06, 0.0), (0.03, -0.05)], 10, "Interior_Dark", center=(-0.012, 0, 0), axis="X")
    for a in (math.radians(-90), math.radians(15), math.radians(165)):
        c, d = math.cos(a), math.sin(a)
        b.box((0, 0.11 * c, 0.11 * d), (0.012, 0.13, 0.038), "Interior_Dark", 0.2, [("X", a)])
    b.lathe([(0.03, 0.03), (0.032, 0.30)], 8, "Interior_Dark", axis="X")
    tilt = Matrix.Rotation(math.radians(-22), 4, "Y")
    bmesh.ops.transform(b.bm, matrix=tilt, verts=b.bm.verts)
    return b.to_mesh("SteeringWheel", materials, 55)


def build_wheel(materials, side):
    """タイヤとホイール（原点は車軸の中心）。side = 1 は左、-1 は右"""
    b = Builder(MATERIALS)
    half = 0.108
    out = side
    tire = [(0.232, 0.098), (0.31, half), (WHEEL_R, 0.085), (WHEEL_R, -0.085), (0.31, -half), (0.232, -0.098)]
    b.lathe(tire, 28, "Tire", away=(0.27, 0.0))
    # リムは内側（車軸側）を向く
    rim = [(0.232, 0.102 * out), (0.222, 0.098 * out), (0.214, 0.03 * out), (0.214, -0.08 * out)]
    b.lathe(rim, 28, "Mat_Wheel", away=(0.0, 0.2 * out), flip=True)
    # 奥の円盤
    b.lathe([(0.214, -0.08 * out), (0.0, -0.08 * out)], 14, "Interior_Dark", away=(0.1, -0.5 * out))
    # ハブと5本スポーク
    b.lathe([(0.0, 0.085 * out), (0.055, 0.082 * out), (0.075, 0.05 * out)], 10, "Mat_Wheel", away=(0.0, 0.0))
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.3
        c, d = math.cos(a), math.sin(a)
        b.box((0.145 * c, 0.058 * out, 0.145 * d), (0.145, 0.018, 0.032), "Mat_Wheel", 0.15, [("Y", -a)])
    return b.to_mesh(f"Wheel_{'L' if side > 0 else 'R'}", materials, 50)


# ---------------------------------------------------------------- 仕上げと書き出し
def transform_to_blender(me):
    """作業用の座標（前 = +X）を Blender の座標（前 = -Y、FBX で Unity の +Z）に直す"""
    me.transform(Matrix.Rotation(math.radians(-90), 4, "Z"))
    me.update()


def to_blender_position(p):
    return Matrix.Rotation(math.radians(-90), 4, "Z") @ Vector(p)


def split_glass(bm, materials):
    """ガラスは別のオブジェクトにする（半透明の描画順を分けるため）"""
    glass = list(MATERIALS).index("Glass")
    gb = bm.copy()
    bmesh.ops.delete(gb, geom=[f for f in gb.faces if f.material_index != glass], context="FACES")
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == glass], context="FACES_ONLY")
    bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context="EDGES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    return gb


def bm_to_mesh(bm, name, materials, sharp):
    finish_mesh(bm, sharp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in MATERIALS:
        me.materials.append(materials[m])
    return me


def prune_materials(me):
    """使っていないマテリアルを外す"""
    used = sorted({p.material_index for p in me.polygons})
    keep = [me.materials[i] for i in used]
    remap = {old: new for new, old in enumerate(used)}
    indices = [remap[p.material_index] for p in me.polygons]
    me.materials.clear()
    for m in keep:
        me.materials.append(m)
    for p, i in zip(me.polygons, indices):
        p.material_index = i


def build_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    materials = make_materials()
    names = list(MATERIALS)
    SHARP_MATERIALS.update({names.index(n) for n in ("Glass", "Panel_Gap", "Trim_Black", "Light_Head", "Light_Tail")})

    bm = build_body(materials)
    surf = Surface(bm)
    aspect = assign_print_uv(bm)
    parts_me = build_exterior_parts(materials, surf)
    interior_me = build_interior(materials)
    glass_bm = split_glass(bm, materials)
    body_me = bm_to_mesh(bm, "Body", materials, 42)
    glass_me = bm_to_mesh(glass_bm, "Glass", materials, 25)
    steering_me = build_steering(materials)
    wheel_l, wheel_r = build_wheel(materials, 1), build_wheel(materials, -1)

    root = bpy.data.objects.new("Sedan", None)
    bpy.context.collection.objects.link(root)
    pivots = {}

    def place(name, me, pivot=(0, 0, 0)):
        transform_to_blender(me)
        prune_materials(me)
        o = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(o)
        o.parent = root
        o.location = to_blender_position(pivot)
        pivots[name] = pivot
        return o

    place("Body", body_me)
    place("Glass", glass_me)
    place("Parts", parts_me)
    place("Interior", interior_me)
    place("SteeringWheel", steering_me, (0.46, -0.39, 0.83))
    for label, x in (("F", WHEEL_X[0]), ("R", WHEEL_X[1])):
        place(f"Wheel_{label}L", wheel_l.copy(), (x, WHEEL_Y, WHEEL_R))
        place(f"Wheel_{label}R", wheel_r.copy(), (x, -WHEEL_Y, WHEEL_R))
    return root, aspect


def report():
    total = 0
    used = {}
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        me = o.data
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        total += n
        print(f"  {o.name:16s} 三角形 {n:6d}  マテリアル {[m.name for m in me.materials]}")
        for t in me.loop_triangles:
            name = me.materials[t.material_index].name
            used[name] = used.get(name, 0) + 1
    print("  合計", total)
    print("  マテリアルごと", dict(sorted(used.items(), key=lambda kv: -kv[1])))
    return total


def export_fbx(path):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.fbx(
        filepath=path, use_selection=False, object_types={"MESH", "EMPTY"}, apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL", axis_forward="-Z", axis_up="Y", bake_space_transform=True,
        mesh_smooth_type="FACE", use_tspace=False, add_leaf_bones=False, bake_anim=False,
        path_mode="COPY", embed_textures=False, use_mesh_modifiers=False,
    )


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    argv = sys.argv[1:]
    out_dir = argv[0]
    os.makedirs(out_dir, exist_ok=True)
    root, aspect = build_scene()
    report()
    print("  aspect", {k: round(v, 3) for k, v in aspect.items()})
    export_fbx(os.path.join(out_dir, "Sedan.fbx"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "Sedan.blend"))
    print("書き出しました:", os.path.join(out_dir, "Sedan.fbx"))

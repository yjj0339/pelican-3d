# Blender headless: 鹈鹕骑自行车 + 海滨道具，导出 GLB
# 游戏坐标：x 前进方向, y 上, z 侧向；写出时转 Blender(x, -z, y)
import bpy, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets')
SHOTS = os.path.join(HERE, '..', 'shots')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)
random.seed(42)

# ---------- 基础 ----------
def C(x, y, z):
    return (x, -z, y)

def S(r, g, b):
    return ((r/255)**2.2, (g/255)**2.2, (b/255)**2.2)

def mat(name, color, metallic=0.0, rough=0.55, emit=None, estr=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        ei = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
        if ei: ei.default_value = (*emit, 1)
        es = bsdf.inputs.get('Emission Strength')
        if es: es.default_value = estr
    return m

def smooth(me, verts, faces):
    ns = [[0.0, 0.0, 0.0] for _ in verts]
    for f in faces:
        if len(f) < 3: continue
        a, b, c = [verts[f[i]] for i in range(3)]
        u = (b[0]-a[0], b[1]-a[1], b[2]-a[2]); v = (c[0]-a[0], c[1]-a[1], c[2]-a[2])
        n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        for vi in f:
            ns[vi][0]+=n[0]; ns[vi][1]+=n[1]; ns[vi][2]+=n[2]
    flat = []
    for n in ns:
        l = math.sqrt(n[0]**2+n[1]**2+n[2]**2) or 1.0
        flat.append((n[0]/l, n[1]/l, n[2]/l))
    try:
        me.normals_split_custom_set_from_vertices(flat)
    except Exception:
        for p in me.polygons:
            p.use_smooth = True

def new_obj(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    smooth(me, verts, faces)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if material: ob.data.materials.append(material)
    return ob

# ---------- 路径放样（path 为游戏坐标点列；sections 给每点 (rn, rb) 半径） ----------
def loft_path(name, pts, secs, material, ring=12, cap=True):
    # 局部标架：t 切线；n = normalize(cross((0,0,1), t))；b = cross(t, n)
    verts, faces = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        if i == 0: t = [pts[1][k]-p[k] for k in range(3)]
        elif i == n-1: t = [p[k]-pts[i-1][k] for k in range(3)]
        else: t = [pts[i+1][k]-pts[i-1][k] for k in range(3)]
        tl = math.sqrt(sum(v*v for v in t)) or 1.0
        t = [v/tl for v in t]
        up = (0.0, 0.0, 1.0)
        nx = (up[1]*t[2]-up[2]*t[1], up[2]*t[0]-up[0]*t[2], up[0]*t[1]-up[1]*t[0])
        nl = math.sqrt(sum(v*v for v in nx)) or 1.0
        nv = tuple(v/nl for v in nx)
        bv = (t[1]*nv[2]-t[2]*nv[1], t[2]*nv[0]-t[0]*nv[2], t[0]*nv[1]-t[1]*nv[0])
        rn, rb = secs[i]
        for j in range(ring):
            a = 2*math.pi*j/ring
            ca, sa = math.cos(a)*rn, math.sin(a)*rb
            verts.append(C(p[0]+ca*nv[0]+sa*bv[0], p[1]+ca*nv[1]+sa*bv[1], p[2]+ca*nv[2]+sa*bv[2]))
    for i in range(n-1):
        for j in range(ring):
            a = i*ring+j; b = i*ring+(j+1)%ring
            c = (i+1)*ring+(j+1)%ring; d = (i+1)*ring+j
            faces.append((a, b, c, d))
    if cap:
        faces.append(tuple(range(ring-1, -1, -1)))
        faces.append(tuple((n-1)*ring+j for j in range(ring)))
    return new_obj(name, verts, faces, material)

# ---------- 两点圆管 ----------
def tube(name, p1, p2, r, material, ring=10):
    d = [p2[k]-p1[k] for k in range(3)]
    l = math.sqrt(sum(v*v for v in d))
    mid = tuple((p1[k]+p2[k])/2 for k in range(3))
    return loft_path(name, [p1, mid, p2], [(r, r)]*3, material, ring=ring)

# ---------- 椭球 ----------
def ellipsoid(name, cx, cy, cz, rx, ry, rz, material, seg=24, rings=16, rot_z=0.0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=C(cx, cy, cz))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (rx, rz, ry)  # Blender 轴: x=gx, y=-gz, z=gy
    if rot_z:  # 游戏内绕 z 轴（侧向）旋转 = Blender 绕 y 轴反向
        ob.rotation_euler = (0, -rot_z, 0)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    if material: ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

# ---------- 沿局部 -Y 的锥段（肢体，原点在关节；Blender -Z = 游戏 -Y） ----------
def limb(name, r_top, r_bot, L, material, ring=12):
    bpy.ops.mesh.primitive_cone_add(vertices=ring, radius1=r_bot, radius2=r_top, depth=L, location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    me = ob.data
    import mathutils
    me.transform(mathutils.Matrix.Translation((0, 0, -L/2)))  # 顶端(关节)到原点，向下延伸
    if material: me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    return ob

def sphere_at(name, p, r, material, seg=16, rings=12):
    return ellipsoid(name, p[0], p[1], p[2], r, r, r, material, seg=seg, rings=rings)

# =====================================================================
#  材质表
# =====================================================================
def build_mats():
    return {
        'Feather':  mat('Feather',  S(252, 250, 244), rough=0.85),
        'Feather2': mat('Feather2', S(232, 235, 238), rough=0.85),
        'Beak':     mat('Beak',     S(255, 176, 66),  rough=0.5),
        'Pouch':    mat('Pouch',    S(255, 150, 110), rough=0.6),
        'Leg':      mat('Leg',      S(250, 150, 60),  rough=0.6),
        'Eye':      mat('Eye',      S(255, 255, 255), rough=0.3),
        'Pupil':    mat('Pupil',    S(28, 30, 34),    rough=0.25),
        'Frame':    mat('Frame',    S(96, 205, 190),  metallic=0.35, rough=0.3),
        'Chrome':   mat('Chrome',   S(222, 228, 234), metallic=0.9, rough=0.25),
        'Tire':     mat('Tire',     S(45, 48, 52),    rough=0.95),
        'Rim':      mat('Rim',      S(235, 238, 242), metallic=0.8, rough=0.3),
        'Leather':  mat('Leather',  S(150, 96, 60),   rough=0.65),
        'Grip':     mat('Grip',     S(240, 220, 190), rough=0.7),
        'Dark':     mat('Dark',     S(70, 74, 80),    metallic=0.5, rough=0.5),
        'Bell':     mat('Bell',     S(255, 210, 90),  metallic=0.7, rough=0.25),
        'Trunk':    mat('Trunk',    S(176, 132, 92),  rough=0.9),
        'Palm':     mat('Palm',     S(96, 190, 110),  rough=0.8),
        'Palm2':    mat('Palm2',    S(70, 165, 95),   rough=0.8),
        'Cloud':    mat('Cloud',    S(255, 255, 255), rough=1.0),
        'Rock':     mat('Rock',     S(205, 200, 190), rough=0.95),
        'GrassM':   mat('GrassM',   S(120, 205, 120), rough=0.9),
        'UmbA':     mat('UmbA',     S(255, 120, 110), rough=0.7),
        'UmbB':     mat('UmbB',     S(255, 245, 235), rough=0.7),
        'Wood':     mat('Wood',     S(196, 150, 100), rough=0.85),
        'BuoyR':    mat('BuoyR',    S(240, 80, 70),   rough=0.6),
        'Hill':     mat('Hill',     S(170, 215, 200), rough=1.0),
        'GullM':    mat('GullM',    S(248, 249, 250), rough=0.85),
        'GullTip':  mat('GullTip',  S(150, 158, 168), rough=0.85),
        'Star':     mat('Star',     S(255, 170, 120), rough=0.8),
        'Shell':    mat('Shell',    S(255, 225, 215), rough=0.7),
    }

# =====================================================================
#  自行车 + 鹈鹕
# =====================================================================
# 关键尺寸（JS 端要保持一致）
WHEEL_R = 0.34
REAR_X, FRONT_X = -0.30, 0.32
AXLE_Y = 0.34
BB = (-0.03, 0.30)          # 五通
SEAT = (-0.155, 0.665)      # 鞍座
HT = (0.235, 0.585)         # 头管顶
HB = (0.270, 0.470)         # 头管底
CRANK_R = 0.17
HIP = (-0.16, 0.71)         # 髋部
LEG_A, LEG_B = 0.30, 0.33   # 大腿/小腿长
PEDAL_Z = 0.15              # 踏板侧向偏移
ANKLE_DY = 0.065            # 踝在踏板上方的高度

def build_wheel(name, cx, M):
    parts = []
    # 轮胎（torus 绕 z 侧向轴 → Blender 中绕 y）
    bpy.ops.mesh.primitive_torus_add(major_radius=WHEEL_R-0.035, minor_radius=0.035,
        major_segments=28, minor_segments=10, location=C(cx, AXLE_Y, 0),
        rotation=(math.pi/2, 0, 0))
    tire = bpy.context.object; tire.name = name + '_tire'
    tire.data.materials.append(M['Tire'])
    parts.append(tire)
    # 轮圈
    bpy.ops.mesh.primitive_torus_add(major_radius=WHEEL_R-0.07, minor_radius=0.012,
        major_segments=28, minor_segments=8, location=C(cx, AXLE_Y, 0),
        rotation=(math.pi/2, 0, 0))
    rim = bpy.context.object; rim.name = name + '_rim'
    rim.data.materials.append(M['Rim'])
    parts.append(rim)
    # 辐条
    for i in range(10):
        a = i * math.pi / 5 + (0.13 if i % 2 else 0)
        x2 = cx + (WHEEL_R-0.075) * math.cos(a)
        y2 = AXLE_Y + (WHEEL_R-0.075) * math.sin(a)
        z2 = 0.008 if i % 2 else -0.008
        sp = tube(name + '_sp%d' % i, (cx, AXLE_Y, -z2), (x2, y2, z2), 0.004, M['Chrome'], ring=6)
        parts.append(sp)
    # 轮毂
    hb = tube(name + '_hub', (cx, AXLE_Y, -0.045), (cx, AXLE_Y, 0.045), 0.022, M['Chrome'], ring=10)
    parts.append(hb)
    # 合并为一个轮对象（原点保持在轮轴处）
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = tire
    bpy.ops.object.join()
    tire.name = name
    # 原点到轮轴
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    return tire

def build_bike(M):
    F = M['Frame']
    # 车架管
    tubes = [
        (BB, HB, 0.020),          # 下管
        (BB, SEAT, 0.018),        # 座管
        (SEAT, HT, 0.016),        # 上管
        (HT, HB, 0.020),          # 头管
        (SEAT, (REAR_X, AXLE_Y), 0.010),   # 后上叉
        (BB, (REAR_X, AXLE_Y), 0.010),     # 后下叉
        (HB, (FRONT_X, AXLE_Y), 0.014),    # 前叉
    ]
    frame_parts = []
    for i, (p1, p2, r) in enumerate(tubes):
        for zz in ([0.016] if i < 4 else [-0.016, 0.016]):  # 叉/叉桥双侧
            frame_parts.append(tube('ft%d' % i, (p1[0], p1[1], zz), (p2[0], p2[1], zz), r, F))
    # 立管/把横
    frame_parts.append(tube('stem', (HT[0], HT[1], 0), (0.225, 0.650, 0), 0.014, M['Chrome']))
    frame_parts.append(tube('bar', (0.225, 0.650, -0.20), (0.225, 0.650, 0.20), 0.013, M['Chrome']))
    frame_parts.append(tube('gripL', (0.225, 0.650, -0.20), (0.232, 0.648, -0.265), 0.017, M['Grip']))
    frame_parts.append(tube('gripR', (0.225, 0.650, 0.20), (0.232, 0.648, 0.265), 0.017, M['Grip']))
    # 挡泥板（前后短弧，可爱圆润）
    for k, (cx, a0, a1) in enumerate([(REAR_X, 0.35, 2.5), (FRONT_X, 0.6, 2.8)]):
        pts = []
        for i in range(9):
            a = a0 + (a1-a0)*i/8
            pts.append((cx + (WHEEL_R+0.02)*math.cos(a), AXLE_Y + (WHEEL_R+0.02)*math.sin(a), 0))
        frame_parts.append(loft_path('fend%d' % k, pts, [(0.030, 0.045)]*9, F, ring=8, cap=True))
    # 合并车架
    for p in frame_parts: p.select_set(True)
    bpy.context.view_layer.objects.active = frame_parts[0]
    bpy.ops.object.join()
    frame_parts[0].name = 'Frame'
    # 鞍座
    sad = ellipsoid('Saddle', SEAT[0], SEAT[1]+0.02, 0, 0.115, 0.045, 0.055, M['Leather'])
    # 链条（两条细管近似）
    tube('chainT', (BB[0], BB[1]+0.10, -0.02), (REAR_X, AXLE_Y+0.028, -0.02), 0.006, M['Dark'], ring=6)
    tube('chainB', (BB[0], BB[1]-0.10, -0.02), (REAR_X, AXLE_Y-0.028, -0.02), 0.006, M['Dark'], ring=6)
    # 牙盘
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.105, depth=0.008, location=C(BB[0], BB[1], 0), rotation=(math.pi/2, 0, 0))
    ring_ob = bpy.context.object; ring_ob.name = 'chainring'; ring_ob.data.materials.append(M['Chrome'])
    # 铃铛
    sphere_at('Bell', (0.235, 0.672, -0.12), 0.022, M['Bell'])
    # 轮组（可旋转）
    build_wheel('WheelR', REAR_X, M)
    build_wheel('WheelF', FRONT_X, M)
    # 曲柄组（原点在 BB 轴上）
    crank_parts = []
    for s, zz in [(-1, -0.115), (1, 0.115)]:
        # 曲柄臂：从 BB 到踏板参考位（左下右上）
        a = math.radians(-90 if s < 0 else 90)
        px, py = BB[0] + CRANK_R*math.cos(a), BB[1] + CRANK_R*math.sin(a)
        crank_parts.append(tube('arm', (BB[0], BB[1], zz*0.4), (px, py, zz), 0.013, M['Dark']))
        crank_parts.append(tube('spindle', (px, py, zz), (px, py, zz + (0.035 if s < 0 else -0.035)), 0.008, M['Chrome'], ring=8))
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.028, depth=0.10, location=C(BB[0], BB[1], 0), rotation=(math.pi/2, 0, 0))
    crank_parts.append(bpy.context.object)
    bpy.context.object.data.materials.append(M['Dark'])
    for p in crank_parts: p.select_set(True)
    bpy.context.view_layer.objects.active = crank_parts[0]
    bpy.ops.object.join()
    crank_parts[0].name = 'Crank'
    bpy.context.scene.cursor.location = C(BB[0], BB[1], 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # 踏板（JS 控制位置，几何中心在原点）
    for s, nm in [(-1, 'PedalL'), (1, 'PedalR')]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
        pd = bpy.context.object; pd.name = nm
        pd.scale = (0.055, 0.012, 0.045)
        bpy.ops.object.transform_apply(scale=True)
        pd.data.materials.append(M['Dark'])

def build_pelican(M):
    FH, BK = M['Feather'], M['Beak']
    # 身体（蛋形，略前倾）
    body = ellipsoid('Body', -0.135, 0.875, 0, 0.215, 0.185, 0.150, FH, rot_z=math.radians(-8))
    # 胸羽
    ellipsoid('Chest', -0.035, 0.92, 0, 0.135, 0.150, 0.120, M['Feather'], rot_z=math.radians(-15))
    # 脖子（S 曲线放样）
    neck_pts = [(-0.045, 0.99, 0), (0.005, 1.06, 0), (0.030, 1.12, 0), (0.045, 1.165, 0)]
    neck = loft_path('Neck', neck_pts, [(0.075, 0.070), (0.062, 0.058), (0.055, 0.052), (0.058, 0.055)], FH, ring=12)
    # 头
    head = ellipsoid('Head', 0.062, 1.215, 0, 0.088, 0.082, 0.075, FH)
    # 头顶冠羽
    for i in range(3):
        a = math.radians(150 + i*16)
        bx, by = 0.062 + 0.075*math.cos(a), 1.215 + 0.075*math.sin(a)
        tx, ty = bx + 0.055*math.cos(a), by + 0.055*math.sin(a)
        loft_path('Crest%d' % i, [(bx, by, 0), ((bx+tx)/2, (by+ty)/2+0.012, 0), (tx, ty, 0)],
                  [(0.016, 0.016), (0.011, 0.011), (0.002, 0.002)], M['Feather2'], ring=8)
    # 上喙（长而渐细，微下垂）
    beak_pts = [(0.125, 1.205, 0), (0.22, 1.198, 0), (0.32, 1.180, 0), (0.42, 1.155, 0), (0.485, 1.130, 0)]
    beak_secs = [(0.030, 0.034), (0.027, 0.030), (0.022, 0.024), (0.014, 0.016), (0.003, 0.004)]
    loft_path('BeakUpper', beak_pts, beak_secs, BK, ring=12)
    # 喉囊（挂在喙下方，鼓出）
    pouch_pts = [(0.135, 1.180, 0), (0.22, 1.135, 0), (0.31, 1.105, 0), (0.395, 1.115, 0), (0.45, 1.125, 0)]
    pouch_secs = [(0.016, 0.028), (0.042, 0.026), (0.052, 0.020), (0.036, 0.013), (0.004, 0.004)]
    loft_path('Pouch', pouch_pts, pouch_secs, M['Pouch'], ring=12)
    # 眼睛
    for s, nm in [(-1, 'L'), (1, 'R')]:
        sphere_at('Eye' + nm, (0.085, 1.235, s*0.058), 0.026, M['Eye'])
        sphere_at('Pupil' + nm, (0.098, 1.238, s*0.075), 0.0125, M['Pupil'])
    # 翅膀（肩 → 把套，略微下前伸）
    for s, nm in [(-1, 'L'), (1, 'R')]:
        sh = (-0.075, 0.955, s*0.130)
        mid1 = (0.02, 0.86, s*0.165)
        mid2 = (0.13, 0.74, s*0.185)
        tip = (0.225, 0.660, s*0.205)
        wpts = [sh, mid1, mid2, tip]
        wsecs = [(0.070, 0.045), (0.058, 0.036), (0.040, 0.026), (0.012, 0.016)]
        w = loft_path('Wing' + nm, wpts, wsecs, M['Feather2'], ring=10)
        # 原点到肩点（挥动轴心）
        bpy.context.scene.cursor.location = C(*sh)
        bpy.ops.object.select_all(action='DESELECT')
        w.select_set(True)
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        # 翼尖覆羽（深色尖端）
        sphere_at('WingTip' + nm, tip, 0.020, M['Dark'], seg=10, rings=8)
    # 尾羽（后上方展开的扇）
    tail_pts = [(-0.30, 0.86, 0), (-0.38, 0.90, 0), (-0.47, 0.945, 0)]
    tail_secs = [(0.045, 0.05), (0.075, 0.035), (0.095, 0.012)]
    tail = loft_path('Tail', tail_pts, tail_secs, M['Feather2'], ring=12)
    # 腿：大腿/小腿/脚，原点在关节；按参考曲柄角摆好姿势（JS 端用同一套 IK 驱动）
    for s, nm in [(-1, 'L'), (1, 'R')]:
        hz = s*0.105
        up = limb('LegUp' + nm, 0.030, 0.024, LEG_A, M['Leg'])
        low = limb('LegLow' + nm, 0.024, 0.018, LEG_B, M['Leg'])
        foot = new_obj('Foot' + nm, *foot_mesh(), M['Leg'])
        # 参考姿势：左腿曲柄朝下，右腿朝上
        ang = math.radians(-90 if s < 0 else 90)
        px = BB[0] + CRANK_R*math.cos(ang); py = BB[1] + CRANK_R*math.sin(ang)
        T = (px, py + ANKLE_DY)          # 踝点
        K = ik_solve(HIP, T, LEG_A, LEG_B)
        # 大腿：局部 -Y 对准 (K-H)；游戏绕 z 转 φ = Blender 绕 y 转 -φ
        dxu, dyu = K[0]-HIP[0], K[1]-HIP[1]
        phi_u = math.atan2(dxu, -dyu)
        up.location = C(HIP[0], HIP[1], hz)
        up.rotation_euler = (0, -phi_u, 0)
        dxl, dyl = T[0]-K[0], T[1]-K[1]
        phi_l = math.atan2(dxl, -dyl)
        low.location = C(K[0], K[1], hz)
        low.rotation_euler = (0, -phi_l, 0)
        foot.location = C(T[0], T[1], s*PEDAL_Z)
        # 踏板也摆到参考位
        pd = bpy.data.objects.get('Pedal' + nm)
        if pd: pd.location = C(px, py, s*PEDAL_Z)
    # 覆羽（臀腿处的蓬松羽毛，遮住髋）
    for s in (-1, 1):
        ellipsoid('HipFluff', HIP[0]-0.01, HIP[1]-0.02, s*0.095, 0.085, 0.075, 0.055, FH)

def ik_solve(H, T, a, b):
    """两腿 IK：返回膝点，膝朝前(+x)"""
    dx, dy = T[0]-H[0], T[1]-H[1]
    d = max(1e-6, min(math.hypot(dx, dy), a+b-1e-4))
    base = math.atan2(dy, dx)
    cosA = max(-1.0, min(1.0, (a*a + d*d - b*b) / (2*a*d)))
    A = math.acos(cosA)
    best = None
    for bend in (1, -1):
        ka = base + bend*A
        K = (H[0] + a*math.cos(ka), H[1] + a*math.sin(ka))
        if best is None or K[0] > best[0]:
            best = K
    return best

def foot_mesh():
    # 蹼足网格：原点在踝（足背上缘），向前 +x 展开，游戏坐标
    verts2d = [(-0.035, 0.0), (0.10, 0.0), (0.155, -0.018), (0.16, -0.045),
               (0.10, -0.055), (-0.03, -0.05)]
    hw0, hw1 = 0.032, 0.052  # 后部/前部半宽
    verts = []
    for zsgn in (-1, 1):
        for i, (x, y) in enumerate(verts2d):
            t = i / (len(verts2d)-1)
            hw = hw0 + (hw1-hw0)*t
            verts.append(C(x, y, zsgn*hw))
    n = len(verts2d)
    faces = []
    faces.append(tuple(range(n-1, -1, -1)))
    faces.append(tuple(range(n, 2*n)))
    for i in range(n):
        j = (i+1) % n
        faces.append((i, j, n+j, n+i))
    return verts, faces

# =====================================================================
#  道具场景 GLB
# =====================================================================
def build_palm(M, name='Palm'):
    trunk_pts = [(0, 0, 0), (0.06, 0.5, 0), (0.16, 1.0, 0), (0.30, 1.42, 0)]
    loft_path(name + '_trunk', trunk_pts, [(0.075, 0.075), (0.062, 0.062), (0.052, 0.052), (0.045, 0.045)], M['Trunk'], ring=10)
    top = trunk_pts[-1]
    for i in range(7):
        a = 2*math.pi*i/7 + 0.3
        dx, dz = math.cos(a), math.sin(a)
        pts = [top,
               (top[0]+dx*0.32, top[1]+0.16, top[2]+dz*0.32),
               (top[0]+dx*0.62, top[1]+0.10, top[2]+dz*0.62),
               (top[0]+dx*0.85, top[1]-0.10, top[2]+dz*0.85)]
        secs = [(0.015, 0.10), (0.012, 0.12), (0.009, 0.09), (0.003, 0.02)]
        loft_path('%s_frond%d' % (name, i), pts, secs, M['Palm'] if i % 2 else M['Palm2'], ring=6)
    for i in range(3):
        sphere_at('%s_coco%d' % (name, i), (top[0]+0.05*i-0.05, top[1]-0.06, 0.05*i-0.05), 0.045, M['Trunk'], seg=10, rings=8)

def build_umbrella(M):
    tube('Umb_pole', (0, 0, 0), (0, 1.35, 0), 0.018, M['Wood'])
    # 伞面：8 瓣锥，双色交替
    for i in range(8):
        a0 = 2*math.pi*i/8; a1 = 2*math.pi*(i+1)/8
        top = (0, 1.62, 0); r = 0.75
        p0 = (r*math.cos(a0), 1.30, r*math.sin(a0))
        p1 = (r*math.cos(a1), 1.30, r*math.sin(a1))
        pm = (r*0.5*math.cos((a0+a1)/2), 1.46, r*0.5*math.sin((a0+a1)/2))
        verts = [C(*top), C(*p0), C(*pm), C(*p1)]
        new_obj('Umb_p%d' % i, verts, [(0, 1, 2), (0, 2, 3)], M['UmbA'] if i % 2 else M['UmbB'])
    sphere_at('Umb_tip', (0, 1.64, 0), 0.03, M['Wood'], seg=8, rings=6)

def build_gull(M):
    ellipsoid('GullBody', 0, 0, 0, 0.085, 0.05, 0.045, M['GullM'])
    ellipsoid('GullHead', 0.085, 0.035, 0, 0.038, 0.035, 0.032, M['GullM'])
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.012, radius2=0.0, depth=0.05, location=C(0.135, 0.03, 0), rotation=(0, math.pi/2, 0))
    bpy.context.object.name = 'GullBeak'; bpy.context.object.data.materials.append(M['Beak'])
    loft_path('GullTail', [(-0.08, 0.01, 0), (-0.16, 0.02, 0)], [(0.03, 0.035), (0.006, 0.05)], M['GullTip'], ring=8)
    for s, nm in [(-1, 'L'), (1, 'R')]:
        pts = [(0, 0.02, s*0.02), (0.02, 0.05, s*0.16), (0.06, 0.04, s*0.30)]
        secs = [(0.018, 0.05), (0.014, 0.075), (0.004, 0.05)]
        w = loft_path('GullWing' + nm, pts, secs, M['GullM'], ring=6)
        bpy.context.scene.cursor.location = C(0, 0.02, s*0.02)
        bpy.ops.object.select_all(action='DESELECT')
        w.select_set(True)
        bpy.context.view_layer.objects.active = w
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

def build_scenery(M):
    build_palm(M)
    build_umbrella(M)
    build_gull(M)
    # 云（合并球簇）
    for ci in range(3):
        cx = 0
        for k, (ox, oy, r) in enumerate([(-0.5, 0, 0.28), (0, 0.12, 0.4), (0.55, 0.02, 0.3), (0.15, -0.08, 0.32)]):
            sphere_at('Cloud%d_%d' % (ci, k), (cx+ox, oy, 0), r*(0.8+0.4*ci/2), M['Cloud'], seg=12, rings=8)
        # 把一簇云合并
        obs = [o for o in bpy.context.scene.objects if o.name.startswith('Cloud%d_' % ci)]
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.join()
        obs[0].name = 'Cloud%d' % ci
    # 石头
    for i in range(2):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.16+0.08*i, location=C(0, 0.1, 0))
        ob = bpy.context.object; ob.name = 'Rock%d' % i
        ob.scale = (1.3, 0.7, 1.0)
        bpy.ops.object.transform_apply(scale=True)
        ob.data.materials.append(M['Rock'])
        for p in ob.data.polygons: p.use_smooth = True
    # 草丛
    for gi in range(2):
        for b in range(5):
            a = 2*math.pi*b/5 + gi
            h = 0.16 + 0.07*random.random()
            pts = [(0, 0, 0), (0.05*math.cos(a), h*0.6, 0.05*math.sin(a)), (0.09*math.cos(a), h, 0.09*math.sin(a))]
            loft_path('Grass%d_%d' % (gi, b), pts, [(0.016, 0.008), (0.010, 0.006), (0.001, 0.001)], M['GrassM'], ring=5)
        obs = [o for o in bpy.context.scene.objects if o.name.startswith('Grass%d_' % gi)]
        bpy.ops.object.select_all(action='DESELECT')
        for o in obs: o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.join()
        obs[0].name = 'Grass%d' % gi
    # 浮标
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.14, radius2=0.05, depth=0.35, location=C(0, 0.17, 0))
    ob = bpy.context.object; ob.name = 'Buoy'; ob.data.materials.append(M['BuoyR'])
    sphere_at('BuoyTop', (0, 0.38, 0), 0.04, M['UmbB'], seg=8, rings=6)
    # 远山（圆润大丘）
    for i in range(3):
        ellipsoid('Hill%d' % i, 0, 0, 0, 3.0+1.5*i, 1.0+0.5*i, 1.5+0.5*i, M['Hill'], seg=16, rings=12)
    # 海星
    verts, faces = [], []
    for i in range(10):
        a = math.pi/2 + 2*math.pi*i/10
        r = 0.11 if i % 2 == 0 else 0.045
        verts.append(C(0.0 if False else r*math.cos(a), 0.012, r*math.sin(a)))
        verts.append(C(0.5*r*math.cos(a), 0.045, 0.5*r*math.sin(a)))
    verts.append(C(0, 0.0, 0)); verts.append(C(0, 0.055, 0))
    cb, ct = 20, 21
    for i in range(10):
        j = (i+1) % 10
        faces.append((2*i, 2*j, ct)); faces.append((2*j, 2*i, cb))
    new_obj('Starfish', verts, faces, M['Star'])
    # 木牌
    tube('Sign_post', (0, 0, 0), (0, 1.05, 0), 0.035, M['Wood'])
    bpy.ops.mesh.primitive_cube_add(size=1, location=C(0, 1.18, 0))
    bd = bpy.context.object; bd.name = 'Sign_board'; bd.scale = (0.42, 0.14, 0.03)
    bpy.ops.object.transform_apply(scale=True); bd.data.materials.append(M['Wood'])
    # 字（SEASIDE）放在牌面上
    bpy.ops.object.text_add(location=C(-0.36, 1.14, 0.035), rotation=(math.pi/2, 0, 0))
    txt = bpy.context.object; txt.name = 'Sign_text'
    txt.data.body = 'SEASIDE'
    txt.data.size = 0.16
    txt.data.extrude = 0.008
    txt.data.materials.append(M['UmbB'])
    bpy.ops.object.convert(target='MESH')

# =====================================================================
#  渲染预览（验收用）
# =====================================================================
def preview(prefix, focus=(0, 0.7, 0), dist=2.6, hide_prefixes=()):
    for ob in bpy.context.scene.objects:
        if any(ob.name.startswith(h) for h in hide_prefixes):
            ob.hide_render = True
    bpy.ops.object.camera_add(location=C(dist*0.7, focus[1]+0.35, dist))
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    # 对准焦点
    import mathutils
    direction = mathutils.Vector(C(*focus)) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.light_add(type='SUN', location=C(2, 4, 3))
    sun = bpy.context.object
    sun.rotation_euler = (math.radians(35), math.radians(-25), 0)
    sun.data.energy = 4
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.87, 0.97, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    bpy.context.scene.world = world
    # 地面
    bpy.ops.mesh.primitive_plane_add(size=20, location=C(0, 0, 0), rotation=(math.pi/2, 0, 0))
    pl = bpy.context.object
    plm = mat('GroundP', S(235, 230, 215), rough=0.95)
    pl.data.materials.append(plm)
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE'
    except Exception:
        sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    for tag, loc in [('34', C(dist*0.7, focus[1]+0.35, dist)), ('side', C(0.05, focus[1]+0.1, dist*1.15)), ('front', C(dist*1.2, focus[1]+0.3, dist*0.25))]:
        cam.location = loc
        direction = mathutils.Vector(C(*focus)) - cam.location
        cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(SHOTS, '%s_%s.png' % (prefix, tag))
        bpy.ops.render.render(write_still=True)

# =====================================================================
#  主流程
# =====================================================================
def export_glb(path):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                              export_yup=True, export_apply=True,
                              export_animations=False, export_skins=False,
                              export_materials='EXPORT')

M = build_mats()
bpy.ops.wm.read_factory_settings(use_empty=True)
build_mats()  # 场景重置后材质被清，重建
M = build_mats()
build_bike(M)
build_pelican(M)
export_glb(os.path.join(OUT, 'pelican_bike.glb'))
preview('model_bike')

bpy.ops.wm.read_factory_settings(use_empty=True)
M = build_mats()
build_scenery(M)
export_glb(os.path.join(OUT, 'scenery.glb'))
preview('model_props', focus=(0, 0.8, 0), dist=4.5, hide_prefixes=('Hill',))

print('DONE')

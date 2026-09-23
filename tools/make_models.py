# Blender headless: 鹈鹕骑行 3D — 鹈鹕 + 自行车 + 场景道具，导出 GLB
# 坐标约定：脚本内统一用「游戏坐标」(x右, y上, z车头前)，写出时转 Blender(x, -z, y)
import bpy, math, os, sys
import mathutils

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shots')
os.makedirs(OUT, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def C(x, y, z):
    """游戏坐标 -> Blender 坐标"""
    return (x, -z, y)

# ---------------- 材质 ----------------
def S(r, g, b):
    """sRGB 0-255 -> 线性 0-1"""
    return ((r/255)**2.2, (g/255)**2.2, (b/255)**2.2)

def mat(name, color, metallic=0.0, rough=0.6, emit=None, estr=0.0):
    m = bpy.data.materials.new(name)
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

M = {
  # 鹈鹕
  'Body':   mat('Body',   S(252,249,242), rough=.65),
  'Head':   mat('Head',   S(250,243,214), rough=.65),
  'Wing':   mat('Wing',   S(240,236,228), rough=.7),
  'WingTip':mat('WingTip',S(216,212,204), rough=.7),
  'Beak':   mat('Beak',   S(255,168,54),  rough=.5),
  'Nail':   mat('Nail',   S(240,120,40),  rough=.45),
  'Pouch':  mat('Pouch',  S(255,138,92),  rough=.6),
  'Leg':    mat('Leg',    S(255,152,62),  rough=.55),
  'Pupil':  mat('Pupil',  S(44,40,48),    rough=.35),
  'EyeW':   mat('EyeW',   S(255,255,255),rough=.4),
  'Glint':  mat('Glint',  S(255,255,255), emit=S(255,255,255), estr=2.2),
  'Scarf':  mat('Scarf',  S(255,99,90),   rough=.8),
  'ScarfD': mat('ScarfD', S(240,86,80),   rough=.8),
  # 自行车
  'Frame':  mat('Frame',  S(64,197,183),  rough=.35),
  'Rim':    mat('Rim',    S(248,242,226), rough=.45),
  'Tire':   mat('Tire',   S(56,54,60),    rough=.95),
  'Chrome': mat('Chrome', S(216,222,230), metallic=.9, rough=.25),
  'Spoke':  mat('Spoke',  S(198,203,212), metallic=.6, rough=.35),
  'Saddle': mat('Saddle', S(158,104,66),  rough=.6),
  'Grip':   mat('Grip',   S(150,98,62),   rough=.7),
  'Bell':   mat('Bell',   S(244,200,96),  metallic=.85, rough=.28),
  'Basket': mat('Basket', S(208,164,110), rough=.8),
  'BasketD':mat('BasketD',S(184,138,88),  rough=.8),
  'LensW':  mat('LensW',  S(255,236,170), emit=S(255,236,170), estr=4.0),
  'LensR':  mat('LensR',  S(255,70,54),   emit=S(255,60,44), estr=2.5),
  'Dark':   mat('Dark',   S(84,88,96),    rough=.5),
  'Bedroll':mat('Bedroll',S(233,102,90),  rough=.8),
  'Strap':  mat('Strap',  S(120,78,50),   rough=.7),
  'Fish':   mat('Fish',   S(168,196,214), rough=.5),
  'FishB':  mat('FishB',  S(235,242,246), rough=.5),
  # 道具
  'Trunk':  mat('Trunk',  S(132,92,60),   rough=.85),
  'TrunkD': mat('TrunkD', S(108,74,48),   rough=.85),
  'BlossA': mat('BlossA', S(255,188,200), rough=.75),
  'BlossB': mat('BlossB', S(255,160,182), rough=.75),
  'BlossC': mat('BlossC', S(255,206,216), rough=.75),
  'Leaf':   mat('Leaf',   S(108,188,118), rough=.75),
  'LeafD':  mat('LeafD',  S(78,156,94),   rough=.75),
  'LeafL':  mat('LeafL',  S(140,208,132), rough=.75),
  'PalmT':  mat('PalmT',  S(196,164,116), rough=.85),
  'Coconut':mat('Coconut',S(112,82,54),   rough=.8),
  'LhW':    mat('LhW',    S(250,250,248), rough=.6),
  'LhR':    mat('LhR',    S(232,86,72),   rough=.5),
  'Lantern':mat('Lantern',S(255,224,150), emit=S(255,224,150), estr=3.0),
  'LhRail': mat('LhRail', S(188,192,198), rough=.5),
  'Hull':   mat('Hull',   S(252,250,244), rough=.5),
  'HullB':  mat('HullB',  S(70,120,180),  rough=.5),
  'SailM':  mat('SailM',  S(252,250,246), rough=.8),
  'SailJ':  mat('SailJ',  S(255,232,200), rough=.8),
  'MillW':  mat('MillW',  S(248,244,236), rough=.6),
  'MillCap':mat('MillCap',S(226,98,84),   rough=.55),
  'Blade':  mat('Blade',  S(224,196,142), rough=.7),
  'BladeF': mat('BladeF', S(150,118,80),  rough=.7),
  'BalloC': mat('BalloC', S(250,238,216), rough=.7),
  'BalloT': mat('BalloT', S(232,122,90),  rough=.7),
  'BasketB':mat('BasketB',S(150,108,68),  rough=.85),
  'Rope':   mat('Rope',   S(200,192,176), rough=.9),
  'Petal':  mat('Petal',  S(255,202,64),  rough=.7),
  'SunC':   mat('SunC',   S(124,84,46),   rough=.8),
  'Stem':   mat('Stem',   S(92,160,84),   rough=.8),
  'Berry':  mat('Berry',  S(240,84,74),   rough=.5),
  'Rock':   mat('Rock',   S(178,182,188), rough=.85),
  'Rock2':  mat('Rock2',  S(160,164,172), rough=.85),
  'Fence':  mat('Fence',  S(250,250,250), rough=.6),
  'Cloud':  mat('Cloud',  S(255,255,255), emit=S(224,232,244), estr=.45),
  'GullW':  mat('GullW',  S(250,250,252), rough=.7),
  'GullG':  mat('GullG',  S(210,214,222), rough=.7),
  'GullB':  mat('GullB',  S(255,170,60),  rough=.5),
  'SignP':  mat('SignP',  S(150,110,72),  rough=.8),
  'SignW':  mat('SignW',  S(196,152,100), rough=.8),
  'SignA':  mat('SignA',  S(246,238,220), rough=.7),
}

# ---------------- 基础工具 ----------------
def assign(o, m): o.data.materials.append(m)

def smooth_mesh(me, verts, faces):
    ns = [[0.0,0.0,0.0] for _ in verts]
    for f in faces:
        if len(f) < 3: continue
        a,b,c = [verts[f[i]] for i in range(3)]
        u = (b[0]-a[0], b[1]-a[1], b[2]-a[2]); v = (c[0]-a[0], c[1]-a[1], c[2]-a[2])
        n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        for vi in f:
            ns[vi][0]+=n[0]; ns[vi][1]+=n[1]; ns[vi][2]+=n[2]
    flat = []
    for n in ns:
        l = math.sqrt(n[0]**2+n[1]**2+n[2]**2) or 1.0
        flat.append((n[0]/l, n[1]/l, n[2]/l))
    try: me.normals_split_custom_set_from_vertices(flat)
    except Exception:
        for p in me.polygons: p.use_smooth = True

def mko(name, verts, faces, m, smooth=True, parent=None, keep=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([C(*v) for v in verts], [], faces); me.update()
    if smooth: smooth_mesh(me, verts, faces)
    else:
        for p in me.polygons: p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def empty(name, loc=(0,0,0), parent=None, keep=False):
    o = bpy.data.objects.new(name, None)
    o.location = C(*loc)
    bpy.context.collection.objects.link(o)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def parent_keep(o, parent):
    o.parent = parent
    bpy.context.view_layer.update()
    o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def loft(name, secs, m, radial=18, top_exp=.9, bot_sq=.45, rect=False, parent=None, keep=False):
    """secs: [(z, w, yb, yt)] 或 [(z, w, yb, yt, xoff)] 游戏坐标放样；rect=True 为矩形截面"""
    verts, faces = [], []
    n = len(secs)
    for sec in secs:
        z, w, yb, yt = sec[0], sec[1], sec[2], sec[3]
        xo = sec[4] if len(sec) > 4 else 0.0
        ym = (yt+yb)/2; ry = (yt-yb)/2
        for k in range(radial):
            th = k/radial*math.tau
            c, s = math.cos(th), math.sin(th)
            if rect:
                px = w/2 * (1 if c >= 0 else -1)
                py = ym + ry*(1 if s >= 0 else -1)
            else:
                px = w * (1 if c >= 0 else -1) * abs(c)**0.72
                py = ym + ry*(s**top_exp if s >= 0 else bot_sq*s)
            verts.append((px+xo, py, z))
    for i in range(n-1):
        for k in range(radial):
            a = i*radial+k; b = i*radial+(k+1)%radial
            c2 = (i+1)*radial+k; d = (i+1)*radial+(k+1)%radial
            faces.append((a, c2, b)); faces.append((b, c2, d))
    for ring, flip in ((0, True), (n-1, False)):
        z = secs[ring][0]; yb, yt = secs[ring][2], secs[ring][3]
        xo = secs[ring][4] if len(secs[ring]) > 4 else 0.0
        ci = len(verts)
        verts.append((xo, (yt+yb)/2, z))
        for k in range(radial):
            a = ring*radial+k; b = ring*radial+(k+1)%radial
            faces.append((ci, b, a) if flip else (ci, a, b))
    return mko(name, verts, faces, m, parent=parent, keep=keep)

def tube(name, pts, radii, m, radial=12, parent=None, keep=False):
    """沿折线的变半径圆管（平行传输标架），pts 为游戏坐标"""
    n = len(pts)
    def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
    def nrm(a):
        l = math.sqrt(a[0]**2+a[1]**2+a[2]**2) or 1.0
        return (a[0]/l, a[1]/l, a[2]/l)
    def cross(a, b):
        return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    def dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
    tans = [nrm(sub(pts[min(i+1,n-1)], pts[max(i-1,0)])) for i in range(n)]
    ref = (0,1,0) if abs(tans[0][1]) < .9 else (1,0,0)
    nrm0 = nrm(cross(tans[0], cross(ref, tans[0])))
    verts, faces = [], []
    frame = nrm0
    for i in range(n):
        t = tans[i]
        frame = nrm(sub(frame, (t[0]*dot(frame,t), t[1]*dot(frame,t), t[2]*dot(frame,t))))
        bin = cross(t, frame)
        r = radii[i]; P = pts[i]
        for k in range(radial):
            th = k/radial*math.tau
            c, s = math.cos(th), math.sin(th)
            verts.append((P[0]+r*(c*frame[0]+s*bin[0]),
                          P[1]+r*(c*frame[1]+s*bin[1]),
                          P[2]+r*(c*frame[2]+s*bin[2])))
    for i in range(n-1):
        for k in range(radial):
            a = i*radial+k; b = i*radial+(k+1)%radial
            c2 = (i+1)*radial+k; d = (i+1)*radial+(k+1)%radial
            faces.append((a, c2, b)); faces.append((b, c2, d))
    # 端盖
    for ring, flip in ((0, True), (n-1, False)):
        ci = len(verts)
        P = pts[ring]; verts.append(P)
        for k in range(radial):
            a = ring*radial+k; b = ring*radial+(k+1)%radial
            faces.append((ci, b, a) if flip else (ci, a, b))
    return mko(name, verts, faces, m, parent=parent, keep=keep)

def plate(name, secs, m, th=.012, parent=None, keep=False, xoff=0.0):
    """薄片：secs=[(z, w, y中心)]，沿 z 的矩形窄条（羽毛/帆/翅"""
    verts, faces = [], []
    n = len(secs)
    for (z, w, y) in secs:
        hw = w/2; ht = th/2
        verts.append((xoff-hw, y-ht, z)); verts.append((xoff+hw, y-ht, z))
        verts.append((xoff+hw, y+ht, z));  verts.append((xoff-hw, y+ht, z))
    for i in range(n-1):
        a = i*4
        b = (i+1)*4
        faces.append((a, b, b+1, a+1)); faces.append((a+3, b+3, b+2, a+2))
        faces.append((a+1, b+1, b+2, a+2)); faces.append((a, b, b+3, a+3))
    # 端封
    for ring, flip in ((0, True), (n-1, False)):
        a = ring*4
        if flip: faces.append((a, a+1, a+2, a+3))
        else:    faces.append((a, a+3, a+2, a+1))
    return mko(name, verts, faces, m, smooth=False, parent=parent, keep=keep)

def arc_strip(name, center, R, a0, a1, width, th, m, parent=None, keep=False):
    """挡泥板弧形条：绕 x 轴的 y-z 平面圆弧，角度从 +Y 向 +Z（度）"""
    N = max(8, int(abs(a1-a0)/6))
    verts, faces = [], []
    for i in range(N+1):
        a = math.radians(a0 + (a1-a0)*i/N)
        cy, cz = math.cos(a), math.sin(a)
        for (rr, xx) in ((R, -width/2), (R+th, -width/2), (R+th, width/2), (R, width/2)):
            verts.append((center[0]+xx, center[1]+rr*cy, center[2]+rr*cz))
    for i in range(N):
        a = i*4; b = (i+1)*4
        faces.append((a, b, b+1, a+1)); faces.append((a+1, b+1, b+2, a+2))
        faces.append((a+2, b+2, b+3, a+3)); faces.append((a+3, b+3, b, a))
    return mko(name, verts, faces, m, smooth=False, parent=parent, keep=keep)

def sphere(name, r, loc, m, scale=(1,1,1), parent=None, keep=False):
    me = bpy.data.meshes.new(name)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=r)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    o.location = C(*loc); o.scale = (scale[0], scale[2], scale[1])
    bpy.context.collection.objects.link(o)
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def cyl(name, r, depth, loc, m, axis='x', parent=None, keep=False, verts=16):
    rot = (0, math.pi/2, 0) if axis=='x' else (math.pi/2,0,0) if axis=='z' else (0,0,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
        location=C(*loc), rotation=rot)
    o = bpy.context.active_object; o.name = name
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def cone(name, r1, r2, depth, loc, m, rot=(0,0,0), parent=None, keep=False, verts=14):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
        depth=depth, location=C(*loc), rotation=rot)
    o = bpy.context.active_object; o.name = name
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def torus(name, major, minor, loc, m, parent=None, keep=False):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
        major_segments=26, minor_segments=12, location=C(*loc), rotation=(0, math.pi/2, 0))
    o = bpy.context.active_object; o.name = name
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep: o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def box(name, dims, loc, m, rot=(0,0,0), bevel=0.0, parent=None, keep=False):
    rot_bl = (rot[0], -rot[2], rot[1])
    bpy.ops.mesh.primitive_cube_add(size=1, location=C(*loc), rotation=rot_bl)
    o = bpy.context.active_object; o.name = name
    o.scale = (dims[0], dims[2], dims[1])
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        be = o.modifiers.new('bev', 'BEVEL'); be.width = bevel; be.segments = 2
        bpy.context.view_layer.objects.active = o
        try: bpy.ops.object.modifier_apply(modifier='bev')
        except Exception: pass
    assign(o, m)
    if parent is not None:
        o.parent = parent
        if keep:
            bpy.context.view_layer.update()
            o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

# ============================================================
#  自行车
# ============================================================
def aim_plate(o, dir_game):
    """把 plate（局部沿游戏 +z 延伸）指向 dir_game 方向"""
    d = mathutils.Vector(C(*dir_game))
    o.rotation_quaternion = d.to_track_quat('-Y', 'Z')

WB = (0, 0.34, -0.50)   # 后轴
WF = (0, 0.34, 0.62)    # 前轴
BB = (0, 0.30, -0.06)   # 五通
bike = empty('Bike', (0,0,0))

# 车架管
tube('HeadTube', [(0,0.60,0.585),(0,0.84,0.545)], [.028,.028], M['Frame'], radial=12, parent=bike)
tube('DownTube', [(0,0.63,0.56),(0,0.44,0.24),(0,0.30,-0.06)], [.030,.031,.030], M['Frame'], radial=14, parent=bike)
tube('TopTube',  [(0,0.815,0.545),(0,0.78,0.15),(0,0.745,-0.20)], [.026,.025,.024], M['Frame'], radial=12, parent=bike)
tube('SeatTube', [(0,0.30,-0.06),(0,0.60,-0.17),(0,0.78,-0.245)], [.026,.025,.024], M['Frame'], radial=12, parent=bike)
tube('SeatPost', [(0,0.77,-0.245),(0,0.85,-0.256)], [.014,.014], M['Chrome'], radial=10, parent=bike)
for sx in (1,-1):
    tube('SeatStay', [(sx*0.032,0.75,-0.245),(sx*0.042,0.55,-0.38),(sx*0.046,0.345,-0.50)], [.014,.013,.012], M['Frame'], radial=10, parent=bike)
    tube('ChainStay',[(sx*0.046,0.30,-0.06),(sx*0.046,0.32,-0.30),(sx*0.046,0.345,-0.50)], [.016,.015,.013], M['Frame'], radial=10, parent=bike)
# 五通壳
cyl('BBShell', 0.045, 0.09, BB, M['Dark'], axis='x', parent=bike)

# 转向组（把立/横把/前叉/前轮/车篮/灯 都挂在 B_Steer 下）
steer = empty('B_Steer', (0, 0.84, 0.545))
parent_keep(steer, bike)
tube('Stem', [(0,0.845,0.545),(0,0.925,0.505)], [.020,.020], M['Chrome'], radial=10, parent=steer, keep=True)
for sx in (1,-1):
    tube('BarArm', [(abs(sx)*0.0,0.925,0.505),(sx*0.10,0.935,0.47),(sx*0.185,0.915,0.405)], [.016,.015,.014], M['Chrome'], radial=10, parent=steer, keep=True)
    # 握把
    tube('Grip', [(sx*0.185,0.915,0.405),(sx*0.245,0.905,0.365)], [.023,.022], M['Grip'], radial=10, parent=steer, keep=True)
    # 车铃（左手边）
    if sx < 0:
        sph = sphere('BellDome', 0.030, (-0.115, 0.947, 0.452), M['Bell'], scale=(1,.82,1), parent=steer, keep=True)
        cyl('BellBase', 0.026, 0.008, (-0.115, 0.936, 0.452), M['Dark'], axis='y', parent=steer, keep=True, verts=14)
        box('BellLever', (0.012, 0.008, 0.030), (-0.098, 0.945, 0.470), M['Chrome'], bevel=0, parent=steer, keep=True)
    # 前叉
    tube('Fork', [(sx*0.028,0.60,0.575),(sx*0.030,0.46,0.60),(sx*0.030,0.34,0.62)], [.017,.016,.015], M['Frame'], radial=10, parent=steer, keep=True)
# 前轮（挂在 steer 下自转）
wheelF = empty('B_WheelF', WF)
parent_keep(wheelF, steer)
torus('TireF', 0.265, 0.078, (0,0,0), M['Tire'], parent=wheelF)
cyl('RimF', 0.205, 0.052, (0,0,0), M['Rim'], axis='x', parent=wheelF, verts=22)
cyl('HubF', 0.030, 0.10, (0,0,0), M['Chrome'], axis='x', parent=wheelF)
for i in range(12):
    sp = box('SpokeF', (0.013, 0.40, 0.018), (0,0,0), M['Spoke'], bevel=0, parent=wheelF)
    sp.rotation_euler = (i/12*math.tau, 0, 0)
arc_strip('FenderF', WF, 0.352, 18, 162, 0.085, 0.013, M['Frame'], parent=steer, keep=True)
# 前车灯
cyl('HeadLamp', 0.034, 0.055, (0, 0.70, 0.648), M['Dark'], axis='z', parent=steer, keep=True)
sphere('HeadLens', 0.030, (0, 0.70, 0.675), M['LensW'], scale=(1,1,.6), parent=steer, keep=True)

# 车篮 + 鱼
basket = empty('BasketGrp', (0, 0.775, 0.685))
parent_keep(basket, steer)
cone('BasketBody', 0.108, 0.142, 0.15, (0, 0, 0), M['Basket'], parent=basket, keep=True, verts=18)
for i, h in enumerate((-0.055, 0.0, 0.055)):
    rr = 0.108 + (0.142 - 0.108) * (h + 0.075) / 0.15
    torus('BasketRing%d'%i, rr, 0.006, (0, h, 0), M['BasketD'], parent=basket, keep=True)
for i in range(10):
    a = i/10*math.tau
    bx = math.sin(a)*0.125; bz = math.cos(a)*0.125
    st = box('BasketStrip%d'%i, (0.016, 0.15, 0.006), (bx, 0, bz), M['BasketD'], bevel=0, parent=basket, keep=True)
    st.rotation_euler = (0, 0, math.atan2(bx, bz))
tube('BasketStrut1', [(0.05,0.71,0.635),(0.028,0.815,0.565)], [.008,.008], M['Dark'], radial=8, parent=steer, keep=True)
tube('BasketStrut2', [(-0.05,0.71,0.635),(-0.028,0.815,0.565)], [.008,.008], M['Dark'], radial=8, parent=steer, keep=True)
fish = empty('FishGrp', (0, 0.845, 0.66))
parent_keep(fish, basket)
fish.rotation_euler = (0, 0, 0)
loft('FishBody', [
    (-0.115, 0.012, -0.012, 0.012),
    (-0.06, 0.055, -0.035, 0.045),
    (0.0, 0.062, -0.03, 0.055),
    (0.06, 0.045, -0.02, 0.04),
    (0.105, 0.012, -0.008, 0.008),
], M['Fish'], radial=12, parent=fish, keep=True)
plate('FishTail', [(-0.105,0.004,0),(-0.15,0.05,0.01),(-0.155,0.002,0.015)], M['Fish'], th=.008, parent=fish, keep=True)
sphere('FishEye', 0.010, (0.075, 0.022, 0.045), M['Pupil'], parent=fish, keep=True)
sphere('FishEye2', 0.010, (0.075, 0.022, -0.045), M['Pupil'], parent=fish, keep=True)

# 后轮
wheelR = empty('B_WheelR', WB)
wheelR.parent = bike
torus('TireR', 0.265, 0.078, (0,0,0), M['Tire'], parent=wheelR)
cyl('RimR', 0.205, 0.052, (0,0,0), M['Rim'], axis='x', parent=wheelR, verts=22)
cyl('HubR', 0.030, 0.10, (0,0,0), M['Chrome'], axis='x', parent=wheelR)
for i in range(12):
    sp = box('SpokeR', (0.013, 0.40, 0.018), (0,0,0), M['Spoke'], bevel=0, parent=wheelR)
    sp.rotation_euler = (i/12*math.tau, 0, 0)
arc_strip('FenderR', WB, 0.352, 62, 258, 0.085, 0.013, M['Frame'], parent=bike)
cyl('CogR', 0.048, 0.016, (0.055, 0.34, -0.50), M['Spoke'], axis='x', parent=bike, verts=16)
box('TailLight', (0.05, 0.025, 0.012), (0, 0.36, -0.862), M['LensR'], bevel=0, parent=bike)
# 链条
tube('ChainTop', [(0.058,0.388,-0.50),(0.064,0.395,-0.28),(0.068,0.402,-0.06)], [.007,.007,.007], M['Dark'], radial=8, parent=bike)
tube('ChainBot', [(0.058,0.292,-0.50),(0.064,0.255,-0.28),(0.068,0.198,-0.06)], [.007,.007,.007], M['Dark'], radial=8, parent=bike)

# 曲柄组
crank = empty('B_Crank', BB)
crank.parent = bike
cyl('ChainRing', 0.102, 0.014, (0.062, 0.30, -0.06), M['Spoke'], axis='x', parent=crank, keep=True, verts=24)
for i in range(8):
    a = i/8*math.tau
    box('RingCut%d'%i, (0.012, 0.05, 0.05), (0.062, 0.30+math.sin(a)*0.075, -0.06+math.cos(a)*0.075), M['Dark'], bevel=0, parent=crank, keep=True)
box('CrankArmL', (0.026, 0.36, 0.020), (-0.088, 0.465, -0.06), M['Chrome'], bevel=0.006, parent=crank, keep=True)
box('CrankArmR', (0.026, 0.36, 0.020), (0.088, 0.135, -0.06), M['Chrome'], bevel=0.006, parent=crank, keep=True)
pedalL = empty('B_PedalL', (-0.115, 0.465, -0.06)); parent_keep(pedalL, crank)
pedalR = empty('B_PedalR', (0.115, 0.135, -0.06));  parent_keep(pedalR, crank)
box('PedalL', (0.070, 0.016, 0.105), (0,0,0), M['Dark'], bevel=0.004, parent=pedalL)
box('PedalR', (0.070, 0.016, 0.105), (0,0,0), M['Dark'], bevel=0.004, parent=pedalR)

# 车座
loft('Saddle', [
    (-0.355, 0.035, 0.850, 0.878),
    (-0.30, 0.10, 0.848, 0.884),
    (-0.22, 0.15, 0.848, 0.888),
    (-0.12, 0.165, 0.850, 0.890),
    (-0.02, 0.13, 0.852, 0.888),
    (0.06, 0.085, 0.856, 0.880),
    (0.11, 0.03, 0.860, 0.868),
], M['Saddle'], radial=14, parent=bike)
sphere('SeatSpringL', 0.014, (-0.315, 0.845, -0.02), M['Chrome'], parent=bike)
sphere('SeatSpringR', 0.014, (-0.315, 0.845, 0.02), M['Chrome'], parent=bike)

# 后货架 + 铺盖卷
rack = empty('Rack', (0,0,0)); rack.parent = bike
box('RackTop', (0.15, 0.014, 0.30), (0, 0.785, -0.46), M['Dark'], bevel=0.004, parent=rack)
for sx in (1,-1):
    tube('RackLeg1', [(sx*0.055,0.78,-0.36),(sx*0.045,0.72,-0.245)], [.008,.008], M['Dark'], radial=8, parent=rack)
    tube('RackLeg2', [(sx*0.055,0.78,-0.56),(sx*0.046,0.35,-0.50)], [.008,.008], M['Dark'], radial=8, parent=rack)
cyl('Bedroll', 0.062, 0.235, (0, 0.855, -0.46), M['Bedroll'], axis='x', parent=rack, verts=16)
torus('Strap1', 0.064, 0.008, (0.062, 0.855, -0.52), M['Strap'], parent=rack)
torus('Strap2', 0.064, 0.008, (0.062, 0.855, -0.40), M['Strap'], parent=rack)

# ============================================================
#  鹈鹕骑手
# ============================================================
pelican = empty('Pelican', (0,0,0))

loft('PBody', [
    (-0.60, 0.10, 1.03, 1.14),
    (-0.52, 0.135, 0.985, 1.175),
    (-0.40, 0.155, 0.965, 1.19),
    (-0.26, 0.165, 0.955, 1.195),
    (-0.10, 0.155, 0.965, 1.21),
    (0.00, 0.115, 1.00, 1.19),
], M['Body'], radial=20, parent=pelican)
# 肚皮暖色
sphere('PBelly', 0.115, (0, 0.985, -0.28), M['Head'], scale=(1.15,.85,1.25), parent=pelican)

# 尾羽（向 -z 后方展开）
tail = empty('P_Tail', (0, 1.10, -0.585)); tail.parent = pelican
for i in range(5):
    a = (i-2)/2 * 0.28
    L = 0.24 - abs(i-2)*0.02
    f = plate('TailF%d'%i, [
        (0.0, 0.05, 0.01),
        (-L*0.5, 0.045, 0.035 + a*0.3),
        (-L*0.9, 0.03, 0.075 + a*0.6),
    ], M['WingTip'] if i in (0,4) else M['Wing'], th=.014, parent=tail)
    f.rotation_euler = (0, -a, 0)
    f.location = C(math.sin(a)*0.015, 0, 0)

# 颈 -> 头（头组挂 P_Head）
head = empty('P_Head', (0, 1.455, 0.005)); head.parent = pelican
tube('Neck', [(0,1.10,-0.12),(0,1.20,-0.115),(0,1.31,-0.08),(0,1.40,-0.035),(0,1.455,0.005)],
     [.062,.063,.058,.052,.05], M['Head'], radial=14, parent=pelican)
sphere('HeadBall', 0.088, (0, 0.028, 0.035), M['Head'], scale=(1,.95,1.08), parent=head)
for i, (dx, dz) in enumerate(((0,0),(0.018,-0.012),(-0.018,-0.012))):
    cn = cone('Crest%d'%i, 0.001, 0.014, 0.07, (dx*0.6, 1.55 - i*0.008, -0.05), M['WingTip'],
              rot=(0.55 + i*0.12, 0, 0), parent=head, keep=True, verts=8)
# 眼睛（挂头组）
for sx in (1,-1):
    sphere('EyeW_%d'%sx, 0.027, (sx*0.058, 0.062, 0.072), M['EyeW'], parent=head)
    sphere('Pupil_%d'%sx, 0.0145, (sx*0.070, 0.064, 0.082), M['Pupil'], parent=head)
    sphere('Glint_%d'%sx, 0.005, (sx*0.076, 0.072, 0.090), M['Glint'], parent=head)
# 上喙（挂头组）
loft('BeakUp', [
    (0.115, 0.068, 0.022, 0.062),
    (0.19, 0.070, 0.014, 0.052),
    (0.30, 0.052, 0.006, 0.036),
    (0.40, 0.030, 0.002, 0.018),
    (0.475, 0.010, 0.000, 0.006),
], M['Beak'], radial=12, parent=head)
cone('BeakNail', 0.001, 0.012, 0.030, (0, 1.462, 0.495), M['Nail'], rot=(3.49,0,0), parent=head, keep=True, verts=8)
# 下喙 + 喉囊（挂 P_BeakLower，可开合；世界坐标建模后 keep 挂载）
jaw = empty('P_BeakLower', (0, 0.020, 0.095)); jaw.parent = head
loft('Pouch', [
    (-0.030, 0.058, 1.377, 1.470),
    (0.065, 0.078, 1.333, 1.468),
    (0.175, 0.072, 1.347, 1.466),
    (0.295, 0.048, 1.403, 1.464),
    (0.415, 0.018, 1.443, 1.460),
], M['Pouch'], radial=14, parent=jaw, keep=True)

# 翅膀（挂 P_WingL/R，肩部 pivot；折叠时贴身侧）
for sx, tag in ((1,'R'), (-1,'L')):
    wing = empty('P_Wing'+tag, (sx*0.16, 1.175, -0.16)); wing.parent = pelican
    loft('Wing'+tag, [
        (-0.14, 0.052, 1.06, 1.20, sx*0.158),
        (-0.28, 0.048, 1.045, 1.185, sx*0.155),
        (-0.42, 0.040, 1.035, 1.16, sx*0.148),
        (-0.54, 0.030, 1.03, 1.13, sx*0.138),
    ], M['Wing'], radial=12, parent=wing, keep=True)
    for fi in range(3):
        plate('WingF%s%d'%(tag,fi), [
            (-0.50 - fi*0.028, 0.026, 1.135 - fi*0.006),
            (-0.585 - fi*0.028, 0.020, 1.115 - fi*0.012),
            (-0.645 - fi*0.028, 0.010, 1.095 - fi*0.02),
        ], M['WingTip'], th=.012, parent=wing, keep=True, xoff=sx*(0.150 - fi*0.006))

# 腿（平面两骨 IK：髋->膝->踝，全部绕 X 转）
for sx, tag in ((1,'R'), (-1,'L')):
    hip = empty('P_Hip'+tag, (sx*0.10, 1.00, -0.27)); hip.parent = pelican
    tube('Thigh'+tag, [(0,0,0),(0,-0.24,0.02),(0,-0.42,0.03)], [.048,.042,.036], M['Leg'], radial=10, parent=hip)
    cone('Fluff'+tag, 0.085, 0.045, 0.16, (0, -0.02, 0.01), M['Body'], parent=hip, keep=True, verts=12)
    knee = empty('P_Knee'+tag, (0, -0.42, 0.03)); knee.parent = hip
    tube('Shin'+tag, [(0,0,0),(0,-0.20,-0.012),(0,-0.44,-0.02)], [.032,.027,.022], M['Leg'], radial=10, parent=knee)
    foot = empty('P_Foot'+tag, (0, -0.44, -0.02)); foot.parent = knee
    plate('WebFoot'+tag, [
        (0.0, 0.052, -0.006),
        (0.055, 0.068, -0.004),
        (0.115, 0.030, 0.0),
    ], M['Leg'], th=.014, parent=foot)
    plate('WebToe'+tag, [
        (0.10, 0.024, 0.0),
        (0.145, 0.012, 0.002),
    ], M['Leg'], th=.010, parent=foot)
    sphere('Heel'+tag, 0.018, (-0.02, 0.0, -0.004), M['Leg'], parent=foot)

# 围巾（颈根环 + 三段飘带链）
scarfRing = torus('ScarfRing', 0.068, 0.024, (0, 1.185, -0.10), M['Scarf'])
scarfRing.parent = pelican
scarfRing.rotation_euler = (0.42, 0, 0)
s1 = empty('P_Scarf1', (0.045, 1.17, -0.16)); s1.parent = pelican
s2 = empty('P_Scarf2', (0, -0.02, -0.13)); s2.parent = s1
s3 = empty('P_Scarf3', (0, -0.02, -0.13)); s3.parent = s2
box('ScarfSeg1', (0.055, 0.016, 0.14), (0, -0.005, -0.065), M['Scarf'], bevel=0.005, parent=s1)
box('ScarfSeg2', (0.050, 0.014, 0.13), (0, -0.008, -0.06), M['Scarf'], bevel=0.005, parent=s2)
box('ScarfSeg3', (0.044, 0.012, 0.12), (0, -0.010, -0.055), M['ScarfD'], bevel=0.005, parent=s3)
for i in range(3):
    box('Fringe%d'%i, (0.012, 0.008, 0.045), (-0.014 + i*0.014, -0.012, -0.115), M['ScarfD'], bevel=0, parent=s3)

# ============================================================
#  场景道具（各 root，导出后由 three.js 实例化）
# ============================================================
props = []

# 1 樱花树
t = empty('CherryTree'); props.append(t)
tube('CTrunk', [(0,0,0),(0.02,0.5,0.01),(0.05,1.0,0.0),(0.04,1.45,-0.02),(0.02,1.8,0)],
     [.065,.058,.05,.042,.032], M['Trunk'], radial=10, parent=t)
for (x,y,z,r,m) in ((0.02,2.02,0,.44,M['BlossA']),(.34,1.82,.16,.34,M['BlossB']),
                    (-.32,1.88,-.12,.32,M['BlossB']),(.08,1.68,-.3,.27,M['BlossC']),(-.15,1.98,.22,.26,M['BlossC'])):
    sphere('CB%d_%d'%(int(x*100),int(y*100)), r, (x,y,z), m, scale=(1,.88,1), parent=t)

# 2 松树
t = empty('PineTree'); props.append(t)
cyl('PTTrunk', 0.075, 0.55, (0, 0.25, 0), M['TrunkD'], axis='y', parent=t)
cone('PT1', 0.56, 0.02, 0.85, (0, 0.85, 0), M['LeafD'], parent=t, verts=12)
cone('PT2', 0.44, 0.02, 0.72, (0, 1.38, 0), M['Leaf'], parent=t, verts=12)
cone('PT3', 0.30, 0.02, 0.6, (0, 1.85, 0), M['LeafL'], parent=t, verts=12)

# 3 椰树
t = empty('PalmTree'); props.append(t)
tube('PalTrunk', [(0,0,0),(.14,0.7,.03),(.33,1.4,.08),(.52,2.05,.12)],
     [.09,.08,.068,.055], M['PalmT'], radial=10, parent=t)
for i in range(3):
    sphere('Coconut%d'%i, 0.055, (.52+math.sin(i*2.1)*0.07, 2.03, .12+math.cos(i*2.1)*0.07), M['Coconut'], parent=t)
for i in range(7):
    a = i/7*math.tau + 0.4
    fr = empty('Fr%d'%i, (.52, 2.05, .12)); fr.parent = t
    p = plate('Frond%d'%i, [
        (0.0, 0.035, 0.0),
        (0.30, 0.13, -0.02),
        (0.60, 0.115, -0.09),
        (0.85, 0.075, -0.22),
        (1.02, 0.035, -0.38),
    ], M['Leaf'] if i%2 else M['LeafD'], th=.018, parent=fr)
    aim_plate(fr, (math.cos(a), 0.42, math.sin(a)))

# 4 灯塔
t = empty('Lighthouse'); props.append(t)
cone('LhBody', 0.52, 0.34, 1.8, (0, 0.9, 0), M['LhW'], parent=t, verts=18)
cyl('LhStripe1', 0.486, 0.20, (0, 0.42, 0), M['LhR'], axis='y', parent=t, verts=18)
cyl('LhStripe2', 0.425, 0.20, (0, 1.02, 0), M['LhR'], axis='y', parent=t, verts=18)
cyl('LhGal', 0.40, 0.06, (0, 1.83, 0), M['LhRail'], axis='y', parent=t, verts=18)
torus('LhRail', 0.385, 0.011, (0, 1.95, 0), M['LhRail'], parent=t)
for i in range(6):
    a = i/6*math.tau
    cyl('LhPost%d'%i, 0.008, 0.12, (math.sin(a)*0.385, 1.89, math.cos(a)*0.385), M['LhRail'], axis='y', parent=t)
cyl('LhLantern', 0.24, 0.30, (0, 2.02, 0), M['Lantern'], axis='y', parent=t, verts=12)
cone('LhRoof', 0.30, 0.005, 0.26, (0, 2.30, 0), M['LhR'], parent=t, verts=12)
sphere('LhBall', 0.035, (0, 2.45, 0), M['LhRail'], parent=t)
box('LhDoor', (0.22, 0.34, 0.04), (0, 0.28, 0.485), M['TrunkD'], bevel=0.008, parent=t)

# 5 帆船
t = empty('Sailboat'); props.append(t)
loft('Hull', [
    (-0.58, 0.14, 0.02, 0.15),
    (-0.35, 0.19, 0.0, 0.22),
    (0.0, 0.20, 0.0, 0.23),
    (0.30, 0.18, 0.0, 0.21),
    (0.55, 0.11, 0.04, 0.13),
], M['Hull'], radial=12, parent=t)
box('HullStripe', (0.335, 0.035, 1.08), (0, 0.115, 0), M['HullB'], bevel=0, parent=t)
box('Deck', (0.24, 0.02, 1.0), (0, 0.225, 0), M['SailJ'], bevel=0.005, parent=t)
cyl('Mast', 0.018, 1.95, (0, 1.2, -0.05), M['Spoke'], axis='y', parent=t)
cyl('Boom', 0.013, 0.70, (0, 0.34, -0.42), M['Spoke'], axis='z', parent=t)
plate('SailMain', [
    (-0.055, 0.02, 0.38), (-0.075, 0.02, 2.02), (-0.74, 0.02, 0.44)
], M['SailM'], th=.012, parent=t)
plate('SailJib', [
    (0.02, 0.02, 0.44), (0.04, 0.02, 1.66), (0.31, 0.02, 0.48)
], M['SailJ'], th=.010, parent=t)

# 6 风车
t = empty('Windmill'); props.append(t)
cone('MillTower', 0.48, 0.26, 1.9, (0, 0.95, 0), M['MillW'], parent=t, verts=16)
sphere('MillCap', 0.31, (0, 1.95, 0), M['MillCap'], scale=(1,.75,1.1), parent=t)
hub = empty('MillHub', (0, 1.95, 0.30)); hub.parent = t
sphere('MillHubBall', 0.055, (0,0,0), M['BladeF'], parent=hub)
for i in range(4):
    a = i*math.pi/2
    bl = empty('Bl%d'%i, (0,0,0)); bl.parent = hub
    plate('Blade%d'%i, [
        (0.12, 0.13, 0.0),
        (0.55, 0.26, -0.005),
        (1.05, 0.30, -0.01),
        (1.45, 0.20, -0.012),
    ], M['Blade'], th=.03, parent=bl)
    box('BladeBar%d'%i, (0.05, 0.045, 1.38), (0, 0, 0.72), M['BladeF'], bevel=0, parent=bl)
    aim_plate(bl, (math.cos(a), math.sin(a), 0))

# 7 热气球
t = empty('Balloon'); props.append(t)
sphere('BalEnv', 0.85, (0, 1.55, 0), M['BalloC'], scale=(1,1.12,1), parent=t)
torus('BalBand', 0.845, 0.055, (0, 1.55, 0), M['BalloT'], parent=t)
cone('BalNeck', 0.12, 0.30, 0.28, (0, 0.92, 0), M['BalloT'], parent=t, verts=14)
box('BalBasket', (0.30, 0.22, 0.30), (0, 0.38, 0), M['BasketB'], bevel=0.02, parent=t)
for sx in (1,-1):
    for sz in (1,-1):
        tube('BalRope%d%d'%(int(sx),int(sz)),
             [(sx*0.12, 0.49, sz*0.12), (sx*0.20, 0.75, sz*0.20), (sx*0.14, 1.02, sz*0.14)],
             [.008,.008,.008], M['Rope'], radial=6, parent=t)
box('Sandbag1', (0.10, 0.14, 0.08), (0.20, 0.33, 0.05), M['SailJ'], bevel=0.015, parent=t)
box('Sandbag2', (0.10, 0.14, 0.08), (-0.18, 0.33, -0.08), M['SailJ'], bevel=0.015, parent=t)

# 8 向日葵丛
t = empty('Sunflowers'); props.append(t)
for i, (x, z, h, tilt) in enumerate(((0, 0, 1.05, 0.15), (0.16, 0.10, 0.8, -0.2), (-0.14, -0.08, 0.68, 0.35))):
    st = empty('SF%d'%i, (x, 0, z)); st.parent = t
    st.rotation_euler = (tilt, 0, 0)
    cyl('Stem%d'%i, 0.018, h, (0, h/2, 0), M['Stem'], axis='y', parent=st)
    sphere('LeafA%d'%i, 0.07, (0.05, h*0.45, 0.02), M['Leaf'], scale=(1,.4,1.6), parent=st)
    sphere('LeafB%d'%i, 0.06, (-0.05, h*0.6, -0.02), M['LeafL'], scale=(1,.4,1.5), parent=st)
    hd = empty('SFH%d'%i, (0, h, 0)); hd.parent = st
    hd.rotation_euler = (0.5, 0, 0)
    cyl('SunC%d'%i, 0.085, 0.05, (0, 0, 0.01), M['SunC'], axis='z', parent=hd, verts=14)
    for k in range(12):
        a = k/12*math.tau
        pt = box('Petal%d_%d'%(i,k), (0.105, 0.008, 0.034),
                 (math.cos(a)*0.125, math.sin(a)*0.125, 0.0), M['Petal'], bevel=0.002, parent=hd)
        pt.rotation_euler = (0, -a, 0)

# 9 灌木
t = empty('Bush'); props.append(t)
sphere('Bu1', 0.26, (0, 0.22, 0), M['Leaf'], scale=(1.15,.85,1), parent=t)
sphere('Bu2', 0.20, (0.22, 0.16, 0.08), M['LeafD'], scale=(1,.8,1), parent=t)
sphere('Bu3', 0.17, (-0.18, 0.15, -0.06), M['LeafL'], scale=(1,.8,1), parent=t)
for i in range(5):
    a = i*1.7
    sphere('Berry%d'%i, 0.026, (math.sin(a)*0.2, 0.2+math.sin(i)*0.1, math.cos(a)*0.18), M['Berry'], parent=t)

# 10 岩石
t = empty('Rock'); props.append(t)
sphere('Rk1', 0.35, (0, 0.20, 0), M['Rock'], scale=(1.25,.62,1), parent=t)
sphere('Rk2', 0.16, (0.38, 0.10, 0.15), M['Rock2'], scale=(1,.6,1), parent=t)
sphere('Rk3', 0.11, (-0.36, 0.08, -0.1), M['Rock2'], scale=(1,.55,1), parent=t)

# 11 栅栏段
t = empty('Fence'); props.append(t)
for i, x in enumerate((-0.55, 0, 0.55)):
    box('Post%d'%i, (0.055, 0.68, 0.055), (x, 0.34, 0), M['Fence'], bevel=0.008, parent=t)
    sphere('PostCap%d'%i, 0.038, (x, 0.68, 0), M['Fence'], scale=(1,.6,1), parent=t)
box('Rail1', (1.25, 0.06, 0.035), (0, 0.48, 0), M['Fence'], bevel=0.006, parent=t)
box('Rail2', (1.25, 0.06, 0.035), (0, 0.28, 0), M['Fence'], bevel=0.006, parent=t)

# 12 云朵
t = empty('Cloud'); props.append(t)
for (x,y,z,r) in ((-0.45,0,0,.38),(-0.05,0.10,0.05,.52),(0.42,0.01,-0.02,.36),(0.05,-0.12,-0.08,.30)):
    sphere('Cd%d_%d'%(int(x*100),int(y*100)), r, (x,y,z), M['Cloud'], scale=(1,.72,1), parent=t)

# 13 海鸥
t = empty('Gull'); props.append(t)
loft('GullBody', [
    (-0.09, 0.012, -0.005, 0.02),
    (-0.02, 0.045, -0.008, 0.038),
    (0.05, 0.036, -0.006, 0.028),
    (0.10, 0.010, -0.002, 0.010),
], M['GullW'], radial=10, parent=t)
sphere('GullHead', 0.022, (0.105, 0.018, 0.005), M['GullW'], parent=t)
cone('GullBeak', 0.001, 0.007, 0.028, (0.138, 0.012, 0.005), M['GullB'], rot=(math.pi,0,0), parent=t, keep=True, verts=6)
plate('GullTail', [(-0.09,0.03,0.002),(-0.145,0.045,0.004)], M['GullG'], th=.006, parent=t)
for sx, tag in ((1,'R'),(-1,'L')):
    gw = empty('GullW'+tag, (sx*0.018, 0.025, 0)); gw.parent = t
    plate('GW'+tag, [
        (0.0, 0.030, 0.004), (0.10, 0.052, 0.012), (0.22, 0.036, 0.018),
    ], M['GullG'], th=.008, parent=gw)
    aim_plate(gw, (sx, 0.22, -0.05))

# 14 路牌
t = empty('Sign'); props.append(t)
cyl('SignPost', 0.028, 1.1, (0, 0.55, 0), M['SignP'], axis='y', parent=t)
box('SignBoard', (0.58, 0.17, 0.026), (0.05, 0.98, 0), M['SignW'], bevel=0.008, parent=t)
box('SignArrow', (0.44, 0.07, 0.028), (0.05, 0.98, 0), M['Frame'], bevel=0.004, parent=t)
cone('SignTip', 0.085, 0.001, 0.17, (0.38, 0.98, 0), M['SignW'], rot=(0,0,-math.pi/2), parent=t, keep=True, verts=4)

# 15 路灯（黄昏场景用）
t = empty('StreetLamp'); props.append(t)
cyl('LampPost', 0.035, 1.9, (0, 0.95, 0), M['Dark'], axis='y', parent=t)
cyl('LampBase', 0.09, 0.08, (0, 0.04, 0), M['Dark'], axis='y', parent=t)
tube('LampArm', [(0,1.86,0),(0,1.92,0.12),(0,1.88,0.24)], [.022,.020,.018], M['Dark'], radial=8, parent=t)
sphere('LampHead', 0.075, (0, 1.84, 0.27), M['Dark'], scale=(1,.8,1), parent=t)
sphere('LampGlow', 0.055, (0, 1.80, 0.27), M['Lantern'], parent=t)

# ============================================================
#  预览渲染（材质检查用，不进 GLB）
# ============================================================
import mathutils

scene = bpy.context.scene
scene.world = bpy.data.worlds.new('W')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background') or list(scene.world.node_tree.nodes)[-1]
try:
    bg.inputs['Color'].default_value = (0.87, 0.92, 0.97, 1)
    bg.inputs['Strength'].default_value = 1.0
except KeyError:
    bg.inputs[0].default_value = (0.87, 0.92, 0.97, 1)
    bg.inputs[1].default_value = 1.0

sun_data = bpy.data.lights.new('Sun', 'SUN'); sun_data.energy = 3.2
sun = bpy.data.objects.new('Sun', sun_data)
sun.location = C(4, 7, 3)
sun.rotation_euler = mathutils.Vector(C(0.4, 0.85, 0.7)).to_track_quat('-Z','Y').to_euler()
scene.collection.objects.link(sun)

fill_data = bpy.data.lights.new('Fill', 'AREA'); fill_data.energy = 180; fill_data.size = 6
fill = bpy.data.objects.new('Fill', fill_data)
fill.location = C(-5, 3, -3)
fill.rotation_euler = mathutils.Vector(C(5, -3, 3)).to_track_quat('-Z','Y').to_euler()
scene.collection.objects.link(fill)

cam_data = bpy.data.cameras.new('Cam'); cam_data.lens = 50
cam = bpy.data.objects.new('Cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

def shoot(name, eye, target, lens=50, res=(960, 960)):
    cam.location = C(*eye)
    cam.rotation_euler = (mathutils.Vector(C(*target)) - mathutils.Vector(C(*eye))).to_track_quat('-Z','Y').to_euler()
    cam_data.lens = lens
    scene.render.resolution_x = res[0]; scene.render.resolution_y = res[1]
    scene.render.filepath = os.path.join(SHOTS, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('RENDER', name)

# 道具摆到网格上预览，渲染后归零
grid = [(-6,0,3),(-3,0,3),(0,0,3),(3,0,3),(6,0,3),
        (-6,0,0),(-3,0,0),(0,0,0),(3,0,0),(6,0,0),
        (-6,0,-3),(-3,0,-3),(0,0,-3),(3,0,-3),(6,0,-3)]
orig = []
for p, (gx, gy, gz) in zip(props, grid):
    orig.append((p, p.location.copy()))
    p.location = C(gx, 0, gz)

scene.render.engine = 'BLENDER_WORKBENCH'
try:
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_object_outline = True
except Exception:
    pass

shoot('props_grid', (8, 9, 10), (0, 0.8, 0), lens=52, res=(1600, 1000))

# hero 镜头前把道具挪到远处，避免堆在原点污染画面
for p in props:
    p.location = (100.0, 0.0, 0.0)

shoot('hero_side', (3.6, 1.5, 0.2), (0, 0.95, 0.0), lens=55)
shoot('hero_front', (0.2, 1.35, 4.6), (0, 1.0, 0.0), lens=50)
shoot('hero_34', (-3.2, 1.9, 3.4), (0, 1.0, 0.1), lens=55)
shoot('hero_face', (-0.65, 1.62, 0.9), (0, 1.47, 0.15), lens=60)

# 归位到原点再导出（GLB 节点保持 identity）
for p, loc in orig:
    p.location = loc

# ============================================================
#  导出 GLB
# ============================================================
def export_sel(rootlist, path):
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for ch in o.children: sel(ch)
    for r in rootlist: sel(r)
    kw = dict(filepath=path, export_format='GLB', export_apply=True,
              export_yup=True, export_animations=False, export_skins=False,
              export_morph=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(use_selection=True, **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path)

export_sel([pelican], os.path.join(OUT, 'pelican.glb'))
export_sel([bike], os.path.join(OUT, 'bike.glb'))
export_sel(props, os.path.join(OUT, 'props.glb'))

# 保存 blend 便于复查
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(OUT), 'models.blend'))
print('DONE')

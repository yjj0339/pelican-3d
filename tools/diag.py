# 诊断：检查关键网格的包围盒/顶点数/面数
import bpy, mathutils

scene = bpy.context.scene
names = ['PBody', 'PBelly', 'Neck', 'HeadBall', 'BeakUp', 'Pouch', 'WingL', 'TailF2',
         'ThighL', 'ShinL', 'TireF', 'TireR', 'DownTube', 'Saddle', 'ChainRing',
         'CherryTree', 'Sailboat', 'Windmill', 'Balloon', 'Cloud']
for n in names:
    o = bpy.data.objects.get(n)
    if not o:
        print(n, 'MISSING'); continue
    if o.type != 'MESH':
        print(n, o.type, 'loc', tuple(round(v,3) for v in o.location)); continue
    me = o.data
    bb = [o.matrix_world @ mathutils.Vector((v.co.x, v.co.y, v.co.z)) for v in me.vertices]
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    nan = any(v.length != v.length for v in bb)
    print('%-12s verts=%-5d faces=%-5d nan=%-5s bb x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f]' % (
        n, len(me.vertices), len(me.polygons), nan,
        min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))

cam = scene.camera
print('cam', tuple(round(v,3) for v in cam.location), 'lens', cam.data.lens)

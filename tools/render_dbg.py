# 调试渲染：打开 models.blend，Workbench 引擎，可指定相机 eye/target
# 用法: blender -b models.blend -P tools/render_dbg.py --  ex ey ez tx ty tz [name] [res]
import bpy, os, sys, mathutils

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
try:
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_object_outline = True
except Exception as e:
    print('shading err', e)

cam = scene.camera
if len(argv) >= 6:
    eye = tuple(float(v) for v in argv[0:6][0:3])
    tgt = tuple(float(v) for v in argv[3:6])
    # 传入的是游戏坐标 -> Blender (x,-z,y)
    cam.location = (eye[0], -eye[2], eye[1])
    dirb = mathutils.Vector((tgt[0]-eye[0], -(tgt[2]-eye[2]), tgt[1]-eye[1]))
    cam.rotation_euler = dirb.to_track_quat('-Z', 'Y').to_euler()
name = argv[6] if len(argv) > 6 else 'dbg'
res = int(argv[7]) if len(argv) > 7 else 960

scene.render.resolution_x = res
scene.render.resolution_y = res
scene.render.filepath = os.path.join(ROOT, 'shots', 'dbg_%s.png' % name)
print('cam loc', cam.location[:], 'engine', scene.render.engine)
bpy.ops.render.render(write_still=True)
print('DBG DONE ->', scene.render.filepath)

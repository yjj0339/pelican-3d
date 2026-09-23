# Cycles 质量预览：真实灯光/世界背景，无头 CPU 渲染
# 用法: blender -b models.blend -P tools/render_quality.py -- shot_name
import bpy, os, sys, mathutils

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
shot = argv[0] if argv else 'hero_side'

SHOTS = {
    'hero_side': ((3.6, 1.5, 0.2), (0, 0.95, 0.0), 55, (960, 960)),
    'hero_front': ((0.2, 1.35, 4.6), (0, 1.0, 0.0), 50, (960, 960)),
    'hero_34': ((-3.2, 1.9, 3.4), (0, 1.0, 0.1), 55, (960, 960)),
    'hero_face': ((-0.65, 1.62, 0.9), (0, 1.47, 0.15), 60, (960, 960)),
    'props_grid': ((8, 9, 10), (0, 0.8, 0), 52, (1600, 1000)),
    'bike_rear': ((-2.0, 1.3, -3.6), (0, 0.7, -0.2), 55, (960, 960)),
}

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
try:
    scene.cycles.device = 'CPU'
except Exception:
    pass
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

# 世界背景浅蓝
w = scene.world
for n in w.node_tree.nodes:
    if n.type == 'BACKGROUND':
        n.inputs[0].default_value = (0.78, 0.87, 0.96, 1)
        n.inputs[1].default_value = 1.0

eye, tgt, lens, res = SHOTS[shot]

# hero 镜头把道具挪远，避免堆在原点
PROPS = ['CherryTree', 'PineTree', 'PalmTree', 'Lighthouse', 'Sailboat', 'Windmill',
         'Balloon', 'Sunflowers', 'Bush', 'Rock', 'Fence', 'Cloud', 'Gull', 'Sign', 'StreetLamp']
if not shot.startswith('props'):
    import mathutils as mu
    for pn in PROPS:
        o = bpy.data.objects.get(pn)
        if o:
            o.location = mu.Vector((100.0, 0.0, 0.0))
    bpy.context.view_layer.update()

cam = scene.camera
cam.location = (eye[0], -eye[2], eye[1])
dirb = mathutils.Vector((tgt[0]-eye[0], -(tgt[2]-eye[2]), tgt[1]-eye[1]))
cam.rotation_euler = dirb.to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = lens

scene.render.resolution_x = res[0]
scene.render.resolution_y = res[1]
out = os.path.join(ROOT, 'shots', 'q_%s.png' % shot)
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('Q RENDER DONE ->', out)

# DEVLOG — 鹈鹕骑行·3D立体版（pelican-3d）

系列第六代，首次 3D 化。前五代：pelican-bike / tihu-bike / tihu-ride / pelican-cruise / pelican-pedal（均为 2D）。

## 目标
- Blender 精细建模：鹈鹕（可动关节：头/下喙/双翅/尾/双腿IK/围巾）+ 自行车（转向/前后轮/曲柄/脚蹬）+ 15 种场景道具
- Three.js 卡通渲染（渐变影调）+ 自定义 Shader（天空/海面/路面）+ 粒子（花瓣/浪沫/速度线）
- 三大场景轮换：海岸晨风 / 樱花原野 / 落日葵海（明亮浅色铁律）
- WebAudio：车铃合成 + 风/海浪环境音 + 轻量生成式音乐盒
- 交互：拖拽运镜/速度/滑翔模式/拍照/机位/场景切换
- 部署 GitHub Pages → yjj0339.github.io/pelican-3d

## 关键约定（游戏坐标系 x右/y上/z前，脚本内转 Blender (x,-z,y)）
- 自行车：后轴 (0,0.34,-0.50) 前轴 (0,0.34,0.62) BB (0,0.30,-0.06) 曲柄R=0.165 轮R=0.34
- 鹈鹕：髋 (±0.10,1.00,-0.27) 大腿L1=0.42 小腿L2=0.44，肩 (±0.16,1.18,-0.16)
- 关节空物体：B_Steer/B_WheelF/B_WheelR/B_Crank/B_PedalL/B_PedalR；P_Head/P_BeakLower/P_WingL/P_WingR/P_Tail/P_HipL/R→P_KneeL/R→P_FootL/R、P_Scarf1..3；MillHub/Balloon/GullWL/GullWR
- 腿IK为矢状面平面解（绕X旋转），膝盖朝前

## 进度
- [x] 2026-09-23 立项，vendor 就位（three 0.170 单文件 + GLTFLoader 已改相对导入，免 importmap）
- [ ] 建模 make_models.py（进行中）

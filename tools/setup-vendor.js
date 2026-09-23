// 构建步骤：从本地 node_modules 复制 three.js 官方构建产物到 vendor/
// GLTFLoader 的裸导入 'three' 改为相对路径，免 importmap（兼容微信内置浏览器）
const fs = require('fs');
const path = require('path');

const SRC = 'E:/ZCODE/node_modules/three';
const DST = path.join(__dirname, '..', 'vendor');
fs.mkdirSync(DST, { recursive: true });

const jobs = [
  ['build/three.module.js', 'three.module.js'],
  ['examples/jsm/loaders/GLTFLoader.js', 'GLTFLoader.js'],
];

for (const [rel, name] of jobs) {
  let text = fs.readFileSync(path.join(SRC, rel), 'utf8');
  if (name === 'GLTFLoader.js') {
    text = text.replace(/from 'three'/g, "from './three.module.js'");
  }
  fs.writeFileSync(path.join(DST, name), text);
  console.log('vendor <-', name, (text.length / 1024).toFixed(0) + 'KB');
}
console.log('DONE');

/**
 * 构建脚本：把 package.json 版本号与构建时间写进 sw.js 的 CACHE_NAME。
 * 避免每次改完 JS/CSS 忘记手动升级缓存版本。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const swPath = path.join(root, 'sw.js');
const { version } = require(path.join(root, 'package.json'));

const source = fs.readFileSync(swPath, 'utf8');
const cacheName = `chinese-calendar-${version}-${Date.now()}`;
const next = source.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = '${cacheName}';`);

if (next === source) {
    console.error('stamp-sw: 未在 sw.js 中找到 CACHE_NAME');
    process.exit(1);
}

fs.writeFileSync(swPath, next);
console.log(`stamp-sw: CACHE_NAME -> ${cacheName}`);

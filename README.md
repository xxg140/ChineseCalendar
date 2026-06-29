# 日历 PWA

中国农历日历渐进式网页应用，支持离线使用。

## 功能

- 公历与农历对照
- 二十四节气显示
- 传统节日和现代节日
- 天干地支和生肖
- PWA 支持（可安装到桌面）
- 离线浏览
- 响应式设计

## 使用

```bash
npm install
npm run dev
```

访问 http://localhost:3000

## 部署

### GitHub Pages
1. 推送代码到 GitHub
2. 在仓库设置中启用 Pages
3. 选择 main 分支根目录

### Cloudflare Pages
1. 登录 Cloudflare Dashboard
2. 创建 Pages 项目，连接 Git 仓库
3. 构建设置：Framework=None, Output=`.`

## 项目结构

```
├── index.html          # 主页面
├── manifest.json       # PWA 配置
├── sw.js              # Service Worker
├── css/styles.css     # 样式
├── js/
│   ├── lunar.js       # 农历库
│   ├── calendar.js    # 日历计算
│   ├── holiday.js     # 节假日数据
│   └── app.js         # 主程序
└── icons/             # 应用图标
```

## 许可证

MIT

# 部署说明

JS-Obf 是纯静态文件（HTML + CSS + JS），没有后端、没有构建步骤，任何静态托管都能直接用。

## Cloudflare Pages

1. 把 `js-obf/` 整个目录推到一个 Git 仓库（GitHub / GitLab 均可）
2. Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. 选中仓库，构建设置留空（Build command 留空，Build output directory 填 `/` 或项目根目录）
4. 部署完成后即可通过分配的域名访问

## GitHub Pages

1. 把 `js-obf/` 内容放进仓库根目录（或 `docs/` 目录）
2. 仓库 Settings → Pages → Source 选择对应分支/目录
3. 保存后等待几分钟即可通过 `https://<用户名>.github.io/<仓库名>/` 访问

## 其他静态托管（Netlify / Vercel / 自建 Nginx 等）

原理都一样：把整个 `js-obf/` 目录作为静态资源根目录托管即可，不需要任何服务端运行时。唯一要注意的是响应头不要给 `.js` 文件设置奇怪的 CSP 限制，否则 Web Worker（`worker.js` 里的 `importScripts`）可能加载失败。

## 注意事项

- 项目里的 `lib/javascript-obfuscator.browser.js` 体积约 1.7MB，是官方发布的浏览器构建版本，按需要可以自己重新从 npm 拉取更新版本替换（`npm install javascript-obfuscator` 后从 `node_modules/javascript-obfuscator/dist/index.browser.js` 复制）。
- 纯静态托管即可满足"代码不上传服务器"的隐私承诺，不需要额外配置。

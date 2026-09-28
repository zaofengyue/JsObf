# 部署指南

> [!TIP]
> **现成极简部署包下载**：
> 运行本项目仅需 `index.html`、`styles.css`、`app.js`、`worker.js` 以及 `lib/javascript-obfuscator.browser.js`。若无需二次开发修改代码，可直接前往 [GitHub Releases](https://github.com/zaofengyue/JsObf/releases) 下载最新自动打包好的 **`jsobf-pages.zip`**，即解即用！

---

## 方式一：Cloudflare Pages（Git 联动部署，推荐）

1. 将代码推送到你的 GitHub 仓库（通过 Git 命令或在网页上拖拽上传均可）。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)。
3. 在左侧菜单点击进入 **Workers & Pages**。
4. 点击 **Create application** → 选择 **Pages** 标签页 → **Connect to Git**。
5. 授权并选择你的 GitHub 账号，选中 `JsObf` 仓库。
6. 进入 "Set up builds and deployments" 构建配置页，按如下参数填写：
   - **Production branch**：`main`（或你的默认主分支）
   - **Framework preset**：选择 **None**
   - **Build command**：留空（纯静态，无需任何构建编译命令）
   - **Build output directory**：`/`（项目根目录）
7. 点击 **Save and Deploy**。
8. 等待数十秒，Cloudflare 会生成一个类似 `https://<项目名>.pages.dev` 的访问网址。
9. 之后每次你往 `main` 分支推送新提交，Cloudflare 会自动完成持续集成与重新部署。

**绑定自定义域名（可选）**：进入项目详情页 → **Custom domains** → **Set up a custom domain**，按指引绑定你已在 Cloudflare 管理的域名即可。

---

## 方式二：Cloudflare Pages（Direct Upload，拖拽直传）

如果你不想关联 GitHub 仓库，也可以直接上传打包好的部署压缩包：

1. 前往 [GitHub Releases](https://github.com/zaofengyue/JsObf/releases) 下载最新的 **`jsobf-pages.zip`**。
2. 登录 Cloudflare Dashboard → **Workers & Pages**。
3. 点击 **Create application** → **Pages** → **Upload assets**（Direct Upload）。
4. 输入自定义项目名称，例如 `jsobf`。
5. **直接将 `jsobf-pages.zip` 拖拽进上传框**（或解压后拖入包含静态资源的文件夹）。
6. 点击 **Deploy site**，几秒后即可完成上线。
7. 后续若有更新，进入该项目管理面板点击 **Create deployment**，重新拖拽最新 zip 即可覆盖升级。

---

## 方式三：GitHub Pages

1. 在 GitHub 仓库设置中，进入 **Settings** → 左侧 **Pages**。
2. 在 **Build and deployment** 下的 **Source** 选择 **Deploy from a branch**。
3. 分支选择 `main`，目录选择 `/ (root)`，点击 **Save**。
4. 等待 1~2 分钟，页面顶部会显示绿色的部署成功链接：`https://<你的用户名>.github.io/<仓库名>/`。

---

## 方式四：通用虚拟主机（AlwaysData / CT8 / 宝塔面板 / Nginx）

JS-Obf 为纯静态架构，不依赖任何 Node.js 服务端运行时：

1. 登录你的主机面板（如宝塔面板、cPanel、AlwaysData 或 CT8），进入网站根目录（如 `www/` 或 `public_html/`）。
2. 将 `jsobf-pages.zip` 解压后的所有文件（确保 `index.html` 位于根部，并包含 `lib/` 目录）上传至网站目录。
3. 检查 Web 服务器（Nginx / Apache）的 MIME 类型配置，确保 `.js` 文件的 Content-Type 为 `application/javascript` 或 `text/javascript`。
4. 访问你的站点域名即可正常运行。

---

## 部署后排错与上线自检清单

部署完成后，建议在浏览器中按 `F12` 打开控制台并验证：

- [ ] 打开页面，顶部右侧状态指示灯显示绿色 **引擎就绪 (本地离线)**。
- [ ] 点击「加载示例」按钮，输入框正确填入示例代码，下方行数与大小统计正常刷新。
- [ ] 点击「▶ 混淆代码」，右侧在 1 秒内输出混淆结果，下方的原始与混淆大小对比看板正确展开。
- [ ] 检查浏览器控制台无任何 404 错误（尤其是 `worker.js` 与 `lib/javascript-obfuscator.browser.js` 必须能被正常请求加载）。
- [ ] 确保 Web 服务器未配置过于严苛的 CSP 头（Content-Security-Policy 需允许 Web Worker 运行及 `blob:` URL 导出）。

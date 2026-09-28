# JS-Obf

在浏览器里混淆 JavaScript 代码的现代化工具。纯静态网页，混淆引擎用的是 [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)（业界标准库，`obfuscator.io` 背后同一个库）的浏览器本地构建版本，代码全程只在你自己的浏览器沙箱中处理，绝不上传到任何服务器。

## 功能特性

- **三档智能预设**：
  - **低混淆**：变量重命名 + 压缩，性能损耗极低，日常开发与生产部署首选；
  - **中混淆**：低混淆 + 字符串提取加密（Base64） + 数组打乱 + 数值等价表达式；
  - **高混淆**：中混淆 + 控制流平坦化 + 死代码注入 + RC4 加密 + 长字符串分块拆分 + Unicode 转义 + 对象属性混淆，防御等级最高。
- **丰富的自定义选项**：
  - 标识符重命名风格（Hex / Mangled）；
  - 字符串加密模式（None / Base64 / RC4）；
  - 数值转算术/位运算表达式（`numbersToExpressions`）；
  - Unicode 字符串转义（`unicodeEscapeSequence`）；
  - 随机种子（`seed`，用于结果复现）；
  - 字符串分块拆分（`splitStrings`）；
  - 对象属性混淆（`transformObjectKeys`）；
  - 控制台输出禁用（`disableConsoleOutput`）；
  - 控制流平坦化、死代码注入、自我防御、调试保护、域名锁定；
  - 可选生成独立 Source Map。
- **开发与交互体验**：
  - 内置快速体验示例（`加载示例`）与一键清空；
  - 支持拖拽 `.js` 脚本文件释放自动加载；
  - 文本框支持按 `Tab` 键自动缩进（2 空格）；
  - 实时可视化指标（原始大小、混淆后大小、体积变化率、代码行数对比）；
  - 引擎状态指示灯（LED 呼吸状态提示）；
  - 语法错误结构化解析与行号列号定位指引。
- **高性能与隔离**：
  - 混淆计算在后台 Web Worker 中执行，无论大文件还是高强度变换均不阻塞主线程 UI。

## 目录结构

```
JsObf-main/
├── index.html                           # 页面骨架与选项面板
├── styles.css                           # 现代风格样式与动效
├── app.js                              # 交互逻辑、参数采集与状态反馈
├── worker.js                           # Web Worker：独立线程调用混淆引擎
├── CHANGELOG.md                        # 本地版本更新日志
├── README.md                           # 项目说明文档
├── DEPLOY.md                           # 静态站点部署指南
├── 项目方案.txt                        # 项目方案设计文档
└── lib/
    └── javascript-obfuscator.browser.js # 本地构建版混淆核心库
```

## 本地预览

这是纯静态项目，但由于使用了 Web Worker（`importScripts`），直接用 `file://` 双击打开可能会触发部分浏览器的同源安全策略拦截，推荐使用任意静态文件服务器启动：

```bash
# 进入目录
cd JsObf-main

# 使用 Python 内置静态服务器
python -m http.server 8080

# 或使用 Node.js 的 npx serve / http-server
# npx serve .

# 浏览器访问 http://localhost:8080 即可体验
```

## 部署

支持一键推送到 Cloudflare Pages、GitHub Pages、Vercel 等纯静态托管平台，详见 [DEPLOY.md](./DEPLOY.md)。

## 关于混淆安全边界

混淆不等于加密，核心目标是大幅提高逆向工程与代码分析的人工门槛。控制流平坦化、字符串加密、自我防御等组合具备极高的防护强度，但依然不建议将未加密的私钥或商业鉴权纯前端硬编码——敏感逻辑的服务端校验仍是不可或缺的防线。

## License

MIT

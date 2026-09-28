# JS-Obf

在浏览器里混淆 JavaScript 代码的小工具。纯静态网页，混淆引擎用的是 [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)（业界标准库，`obfuscator.io` 背后同一个库）的浏览器构建版本，代码全程只在你自己的浏览器里处理，不会上传到任何服务器。

## 功能

- 三档预设：低混淆（变量重命名+压缩）/ 中混淆（+字符串数组加密）/ 高混淆（+控制流平坦化+死代码注入+字符串数组轮转打乱）
- 自定义模式：标识符命名风格（hex/mangled/base64）、字符串加密（base64/rc4）、字符串数组轮转打乱、控制流平坦化、死代码注入、自我防御、调试保护、域名锁定
- 上传 .js 文件 / 粘贴代码，混淆结果一键复制或下载
- 可选生成 Source Map
- 高强度选项在 Web Worker 里跑，不卡页面

## 目录结构

```
js-obf/
├── index.html
├── styles.css
├── app.js
├── worker.js
├── lib/
│   └── javascript-obfuscator.browser.js   # javascript-obfuscator 官方浏览器构建版本
├── README.md
└── DEPLOY.md
```

## 本地预览

这是纯静态项目，但因为用了 Web Worker（`importScripts`），直接用 `file://` 打开可能会被浏览器的同源策略拦截，建议起一个本地静态服务器：

```bash
cd js-obf
python3 -m http.server 8080
# 然后打开 http://localhost:8080
```

## 部署

详见 [DEPLOY.md](./DEPLOY.md)。

## 关于混淆强度

混淆不等于加密，只是提高逆向门槛。控制流平坦化、字符串数组加密、自我防御这些选项组合起来属于生产级混淆强度，但依然不建议把密钥、License 校验逻辑这类真正敏感的东西硬编码在前端代码里指望混淆能保护——服务端校验才是根本。

## License

MIT

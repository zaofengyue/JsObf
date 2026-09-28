const PRESET_DESC = {
  low: '变量重命名 + 压缩，性能损耗最小，适合日常开发与生产部署。',
  medium: '字符串提取与 Base64 加密 + 轮转打乱 + 数值等价表达式，兼顾安全性与运行速度。',
  high: '控制流平坦化 + RC4 字符串加密 + 死代码注入 + 字符串拆分 + Unicode 转义 + 对象键名混淆，最强防护（体积和计算代价最大）。',
  custom: '自由配置各项变换，支持数值混淆、控制流平坦化、死代码注入及域名锁定等。',
};

const EXAMPLE_JS = `/**
 * 示例业务模块：订单计算与安全签名
 */
class OrderProcessor {
  constructor(taxRate = 0.08) {
    this.taxRate = taxRate;
    this.secretKey = "SK_LIVE_9988_SECURE_TOKEN";
  }

  calculateTotal(items, discountCode) {
    let subtotal = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      subtotal += item.price * item.quantity;
    }

    let discount = 0;
    if (discountCode === "VIP2026") {
      discount = subtotal * 0.15;
    }

    const tax = (subtotal - discount) * this.taxRate;
    const finalPrice = Math.round((subtotal - discount + tax) * 100) / 100;

    console.log("[DEBUG] 计算完成:", { subtotal, discount, tax, finalPrice });
    return {
      finalPrice: finalPrice,
      signature: this.signOrder(finalPrice)
    };
  }

  signOrder(amount) {
    return btoa(this.secretKey + "_" + amount.toFixed(2));
  }
}

// 模拟调用
const processor = new OrderProcessor(0.06);
const result = processor.calculateTotal([
  { name: "TypeScript 进阶指南", price: 68.5, quantity: 2 },
  { name: "开发者键盘", price: 299.0, quantity: 1 }
], "VIP2026");

console.log("订单结果:", result);
`;

const els = {
  tabs: document.querySelectorAll('.preset-tab'),
  presetDesc: document.getElementById('presetDesc'),
  customPanel: document.getElementById('customPanel'),
  input: document.getElementById('inputCode'),
  output: document.getElementById('outputCode'),
  dropZone: document.getElementById('dropZone'),
  inputMeta: document.getElementById('inputMeta'),
  outputMeta: document.getElementById('outputMeta'),
  fileInput: document.getElementById('fileInput'),
  btnExample: document.getElementById('btnExample'),
  btnClear: document.getElementById('btnClear'),
  obfuscateBtn: document.getElementById('obfuscateBtn'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadMapBtn: document.getElementById('downloadMapBtn'),
  statusIndicator: document.getElementById('statusIndicator'),
  statusIndicatorText: document.getElementById('statusIndicatorText'),
  statsPanel: document.getElementById('statsPanel'),
  statOrigSize: document.getElementById('statOrigSize'),
  statObfSize: document.getElementById('statObfSize'),
  statDeltaRate: document.getElementById('statDeltaRate'),
  statLinesCompare: document.getElementById('statLinesCompare'),
  errorBox: document.getElementById('errorBox'),
  riskWarningBox: document.getElementById('riskWarningBox'),
  riskWarningText: document.getElementById('riskWarningText'),
  // 自定义选项控件
  optIdentifier: document.getElementById('optIdentifier'),
  optStringEncoding: document.getElementById('optStringEncoding'),
  optSeed: document.getElementById('optSeed'),
  optNumbersToExpressions: document.getElementById('optNumbersToExpressions'),
  optUnicodeEscapeSequence: document.getElementById('optUnicodeEscapeSequence'),
  optStringRotate: document.getElementById('optStringRotate'),
  optSplitStrings: document.getElementById('optSplitStrings'),
  optTransformObjectKeys: document.getElementById('optTransformObjectKeys'),
  optDisableConsole: document.getElementById('optDisableConsole'),
  optControlFlow: document.getElementById('optControlFlow'),
  optDeadCode: document.getElementById('optDeadCode'),
  optSelfDefending: document.getElementById('optSelfDefending'),
  optDebugProtection: document.getElementById('optDebugProtection'),
  optSourceMap: document.getElementById('optSourceMap'),
  optDomainLock: document.getElementById('optDomainLock'),
};

let currentPreset = 'low';
let lastMap = null;
let worker = null;
let activeRequestId = 0;
let watchdogTimer = null;

function setEngineStatus(state, msg) {
  els.statusIndicator.className = `status-indicator ${state}`;
  els.statusIndicatorText.textContent = msg;
}

function showError(msg) {
  els.errorBox.textContent = msg;
  els.errorBox.style.display = 'block';
}

function hideError() {
  els.errorBox.textContent = '';
  els.errorBox.style.display = 'none';
}

function resetRunningState() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
  els.obfuscateBtn.disabled = false;
}

// 统一的 Worker 消息处理（校验 requestId）
function handleWorkerMessage(e) {
  if (!e.data || e.data.requestId !== activeRequestId) {
    // 丢弃非当前请求的过期响应，消除异步竞态
    return;
  }

  resetRunningState();
  const { ok, code: result, error, line, column, sourceMap: map } = e.data;

  if (!ok) {
    setEngineStatus('error', '混淆失败');
    els.output.value = '';
    els.outputMeta.textContent = '—';
    els.statsPanel.style.display = 'none';

    let errorMsg = `混淆执行失败: ${error}`;
    if (line !== null && line !== undefined) {
      errorMsg = `[语法错误 SyntaxError] 第 ${line} 行，第 ${column || 0} 列：\n${error}\n\n请检查源码中是否存在尚未闭合的括号、非法变量名或非标准 JS 语法。`;
    }
    showError(errorMsg);
    return;
  }

  els.output.value = result;
  const origCode = els.input.value.trim();
  const origBytes = bytes(origCode);
  const obfBytes = bytes(result);
  const origLines = origCode ? origCode.split('\n').length : 0;
  const obfLines = result ? result.split('\n').length : 0;

  els.outputMeta.textContent = `${obfLines} 行 · ${formatBytes(obfBytes)}`;

  // 渲染统计指标
  els.statOrigSize.textContent = formatBytes(origBytes);
  els.statObfSize.textContent = formatBytes(obfBytes);
  els.statLinesCompare.textContent = `${origLines} 行 → ${obfLines} 行`;

  const deltaPercent = origBytes === 0 ? 0 : (((obfBytes - origBytes) / origBytes) * 100).toFixed(1);
  if (deltaPercent >= 0) {
    els.statDeltaRate.className = 'stats-badge grow';
    els.statDeltaRate.textContent = `+${deltaPercent}% (体积膨胀)`;
  } else {
    els.statDeltaRate.className = 'stats-badge shrink';
    els.statDeltaRate.textContent = `${deltaPercent}% (体积压缩)`;
  }
  els.statsPanel.style.display = 'grid';

  els.copyBtn.disabled = false;
  els.downloadBtn.disabled = false;

  if (map) {
    lastMap = map;
    els.downloadMapBtn.hidden = false;
    els.downloadMapBtn.disabled = false;
  } else {
    lastMap = null;
  }

  setEngineStatus('ready', '混淆完成');
}

// 获取 Worker 实例并挂载健壮的生命周期错误监听
function getWorker() {
  if (!worker) {
    try {
      worker = new Worker('worker.js');
    } catch (err) {
      setEngineStatus('error', 'Worker 创建失败');
      showError(`Web Worker 初始化失败: ${err && err.message ? err.message : String(err)}\n\n排查建议：请勿直接通过 file:// 协议双击打开网页（浏览器的同源安全策略会拦截 Worker 脚本）。推荐通过本地静态服务器（如运行 python -m http.server 8080）访问。`);
      return null;
    }

    worker.onmessage = handleWorkerMessage;

    worker.onerror = (event) => {
      resetRunningState();
      setEngineStatus('error', 'Worker 异常挂起');
      const msg = event && event.message ? event.message : 'Web Worker 内部加载或脚本解析发生错误';
      showError(`[Web Worker 异常] ${msg}\n\n可能原因：\n1. 直接使用 file:// 协议打开，触发同源隔离限制；\n2. lib/javascript-obfuscator.browser.js 路径未找到或加载受 CSP 拦截。\n建议：通过静态 HTTP 服务访问本工具。`);
      
      // 终止并重置，防止 Worker 损坏后后续混淆死锁
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    worker.onmessageerror = () => {
      resetRunningState();
      setEngineStatus('error', 'Worker 序列化错误');
      showError('Web Worker 消息反序列化异常，传输数据可能损坏或超出浏览器限制。');
    };
  }
  return worker;
}

function bytes(str) {
  return new Blob([str]).size;
}

function formatBytes(b) {
  if (b === 0) return '0 B';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function updateInputMeta() {
  const code = els.input.value;
  const lines = code ? code.split('\n').length : 0;
  els.inputMeta.textContent = `${lines} 行 · ${formatBytes(bytes(code))}`;
}

// 标签切换
els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    currentPreset = tab.dataset.preset;
    els.presetDesc.textContent = PRESET_DESC[currentPreset];
    els.customPanel.hidden = currentPreset !== 'custom';
  });
});

// 加载示例与清空
els.btnExample.addEventListener('click', () => {
  els.input.value = EXAMPLE_JS;
  updateInputMeta();
  hideError();
});

els.btnClear.addEventListener('click', () => {
  els.input.value = '';
  els.output.value = '';
  els.outputMeta.textContent = '—';
  els.statsPanel.style.display = 'none';
  hideError();
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  lastMap = null;
  updateInputMeta();
});

// Tab 缩进支持 (2 空格)
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = els.input.selectionStart;
    const end = els.input.selectionEnd;
    const val = els.input.value;
    els.input.value = val.substring(0, start) + '  ' + val.substring(end);
    els.input.selectionStart = els.input.selectionEnd = start + 2;
    updateInputMeta();
  }
});

// 拖拽上传 .js 文件支持
if (els.dropZone) {
  ['dragenter', 'dragover'].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.dropZone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      els.dropZone.classList.remove('is-dragover');
    });
  });

  els.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      const file = dt.files[0];
      readFile(file);
    }
  });
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    els.input.value = reader.result;
    updateInputMeta();
    hideError();
  };
  reader.readAsText(file);
}

els.fileInput.addEventListener('change', () => {
  readFile(els.fileInput.files[0]);
});

els.input.addEventListener('input', updateInputMeta);
updateInputMeta();

// 联动校验与防呆：清洗并验证用户输入的域名
function sanitizeAndValidateDomain(domainStr) {
  if (!domainStr || !domainStr.trim()) {
    return { ok: true, domains: [] };
  }
  const parts = domainStr.split(',').map((s) => s.trim()).filter(Boolean);
  const cleaned = [];
  const invalid = [];

  for (const raw of parts) {
    // 自动剥离用户误填的 http://、https:// 前缀、路径后缀以及端口号
    let clean = raw.replace(/^https?:\/\//i, '').replace(/:\d+$/, '').replace(/\/.*$/, '').trim();
    // 基础主机名/域名正则校验 (允许 localhost、example.com、*.example.com、sub.example.com 等)
    const domainRegex = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$|^localhost$/i;
    if (domainRegex.test(clean)) {
      cleaned.push(clean);
    } else {
      invalid.push(raw);
    }
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `域名锁定格式不合法: "${invalid.join(', ')}"\n请输入标准的主机名或域名（如 example.com 或 api.site.com，无需加 http:// 或 / 路径）。`,
      domains: cleaned,
    };
  }

  return { ok: true, domains: cleaned };
}

// 选项动态联动与互锁（UI Interlock）
function syncOptionInterlocks() {
  const isStringDisabled = els.optStringEncoding.value === 'none';

  // 当字符串未开启加密时，依赖于字符串数组的打乱与分块强制禁用并置灰
  els.optStringRotate.disabled = isStringDisabled;
  els.optSplitStrings.disabled = isStringDisabled;

  const rotateLabel = els.optStringRotate.closest('.option-check');
  const splitLabel = els.optSplitStrings.closest('.option-check');

  if (rotateLabel) rotateLabel.classList.toggle('is-disabled', isStringDisabled);
  if (splitLabel) splitLabel.classList.toggle('is-disabled', isStringDisabled);

  if (isStringDisabled) {
    els.optStringRotate.checked = false;
    els.optSplitStrings.checked = false;
  }
}

// 高风险选项动态提示
function checkRiskWarnings() {
  syncOptionInterlocks();
  const warnings = [];

  if (els.optSelfDefending.checked) {
    warnings.push('「自我防御」：代码将强制以紧凑压缩模式运行，任何外部格式化、美化或篡改都会直接触发死循环阻断。');
  }
  if (els.optDebugProtection.checked) {
    warnings.push('「调试保护」：在浏览器中打开 DevTools (F12) 控制台时将触发无限断点并冻结页面。');
  }
  const domainRaw = els.optDomainLock.value.trim();
  if (domainRaw) {
    const domainCheck = sanitizeAndValidateDomain(domainRaw);
    if (domainCheck.ok && domainCheck.domains.length > 0) {
      warnings.push(`「域名锁定」：代码将仅限在 [${domainCheck.domains.join(', ')}] 运行，在未绑定的域名或本地打开将直接无法执行。`);
    }
  }

  if (warnings.length > 0) {
    els.riskWarningBox.style.display = 'block';
    els.riskWarningText.textContent = warnings.join(' ');
  } else {
    els.riskWarningBox.style.display = 'none';
    els.riskWarningText.textContent = '';
  }
}

els.optStringEncoding.addEventListener('change', checkRiskWarnings);
[els.optSelfDefending, els.optDebugProtection, els.optDomainLock].forEach((item) => {
  item.addEventListener('input', checkRiskWarnings);
  item.addEventListener('change', checkRiskWarnings);
});

// 初始化选项互锁状态
syncOptionInterlocks();

function readCustomOptions(validatedDomains) {
  const identifierNamesGenerator = els.optIdentifier.value;
  const stringEncoding = els.optStringEncoding.value;
  const seedRaw = els.optSeed.value.trim();
  const isStringArrayEnabled = stringEncoding !== 'none';

  const options = {
    compact: true,
    identifierNamesGenerator,
    numbersToExpressions: els.optNumbersToExpressions.checked,
    unicodeEscapeSequence: els.optUnicodeEscapeSequence.checked,
    splitStrings: isStringArrayEnabled && els.optSplitStrings.checked,
    splitStringsChunkLength: 5,
    transformObjectKeys: els.optTransformObjectKeys.checked,
    disableConsoleOutput: els.optDisableConsole.checked,
    controlFlowFlattening: els.optControlFlow.checked,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: els.optDeadCode.checked,
    deadCodeInjectionThreshold: 0.4,
    stringArray: isStringArrayEnabled,
    stringArrayEncoding: isStringArrayEnabled ? [stringEncoding] : [],
    stringArrayThreshold: 0.75,
    stringArrayRotate: isStringArrayEnabled && els.optStringRotate.checked,
    stringArrayShuffle: isStringArrayEnabled && els.optStringRotate.checked,
    selfDefending: els.optSelfDefending.checked,
    debugProtection: els.optDebugProtection.checked,
  };

  if (seedRaw) {
    options.seed = seedRaw;
  }

  if (validatedDomains && validatedDomains.length > 0) {
    options.domainLock = validatedDomains;
  }

  return options;
}

// 点击混淆
els.obfuscateBtn.addEventListener('click', () => {
  const code = els.input.value.trim();
  if (!code) {
    showError('提示：请先在左侧输入或上传一段 JavaScript 代码。');
    return;
  }

  let validatedDomains = [];
  if (currentPreset === 'custom') {
    const domainRaw = els.optDomainLock.value.trim();
    if (domainRaw) {
      const domainCheck = sanitizeAndValidateDomain(domainRaw);
      if (!domainCheck.ok) {
        showError(domainCheck.error);
        return;
      }
      validatedDomains = domainCheck.domains;
    }
  }

  const sourceMap = currentPreset === 'custom' && els.optSourceMap.checked;

  const risky = currentPreset === 'custom' &&
    (els.optDebugProtection.checked || validatedDomains.length > 0);

  if (risky && !confirm(
    '当前开启了「调试保护」或「域名锁定」——若未部署到目标域名或试图调试，代码将无法正常执行。确认以此配置混淆吗？'
  )) {
    return;
  }

  const w = getWorker();
  if (!w) return;

  const reqId = ++activeRequestId;

  els.obfuscateBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  hideError();
  setEngineStatus('running', '正在混淆…（高强度计算可能需要数秒）');

  // 60秒超时保护 Watchdog，防止不可恢复的死循环卡死
  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(() => {
    if (els.obfuscateBtn.disabled && activeRequestId === reqId) {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      resetRunningState();
      setEngineStatus('error', '混淆执行超时');
      showError('混淆执行超时（已超过 60 秒）已自动终止保护。\n建议：源码较大或嵌套较深时，请尝试关闭「控制流平坦化」或「死代码注入」以减少计算开销。');
    }
  }, 60000);

  const payload = {
    requestId: reqId,
    code,
    preset: currentPreset,
    custom: currentPreset === 'custom' ? readCustomOptions(validatedDomains) : null,
    sourceMap,
  };

  w.postMessage(payload);
});

// 复制
els.copyBtn.addEventListener('click', async () => {
  if (!els.output.value) return;
  try {
    await navigator.clipboard.writeText(els.output.value);
    const originalText = els.copyBtn.textContent;
    els.copyBtn.textContent = '✓ 已复制';
    setTimeout(() => { els.copyBtn.textContent = originalText; }, 1800);
  } catch {
    els.output.select();
    document.execCommand('copy');
    const originalText = els.copyBtn.textContent;
    els.copyBtn.textContent = '✓ 已复制';
    setTimeout(() => { els.copyBtn.textContent = originalText; }, 1800);
  }
});

// 安全文件下载：解决移动端/特定浏览器异步下载取消风险与 Blob 内存泄漏
function download(filename, content) {
  const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;

  // 必须挂载至 DOM 树以兼容沙箱与部分现代浏览器安全策略
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 延时 4000ms 撤销对象 URL，确保异步下载流程完整拉起，避免网络错误，同时防止内存泄漏
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

els.downloadBtn.addEventListener('click', () => {
  if (els.output.value) {
    download('obfuscated.js', els.output.value);
  }
});

els.downloadMapBtn.addEventListener('click', () => {
  if (lastMap) {
    download('obfuscated.js.map', lastMap);
  }
});

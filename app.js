const PRESET_DESC = {
  low: '短名压缩（mangled）+ 结构紧凑化，体积最小、性能最好，适合生产与日常发布。',
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
  cancelBtn: document.getElementById('cancelBtn'),
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
  optTarget: document.getElementById('optTarget'),
  optIdentifier: document.getElementById('optIdentifier'),
  optStringEncoding: document.getElementById('optStringEncoding'),
  optSeed: document.getElementById('optSeed'),
  optNumbersToExpressions: document.getElementById('optNumbersToExpressions'),
  optUnicodeEscapeSequence: document.getElementById('optUnicodeEscapeSequence'),
  optStringRotate: document.getElementById('optStringRotate'),
  optStringShuffle: document.getElementById('optStringShuffle'),
  optSplitStrings: document.getElementById('optSplitStrings'),
  optTransformObjectKeys: document.getElementById('optTransformObjectKeys'),
  optDisableConsole: document.getElementById('optDisableConsole'),
  optControlFlow: document.getElementById('optControlFlow'),
  optDeadCode: document.getElementById('optDeadCode'),
  optSelfDefending: document.getElementById('optSelfDefending'),
  optDebugProtection: document.getElementById('optDebugProtection'),
  optSourceMap: document.getElementById('optSourceMap'),
  optDomainLock: document.getElementById('optDomainLock'),
  optReservedNames: document.getElementById('optReservedNames'),
  optReservedStrings: document.getElementById('optReservedStrings'),
  optDebugInterval: document.getElementById('optDebugInterval'),
};

const COST_S_PER_MB = { low: 8, medium: 15, high: 70 };
const MAX_INPUT_BYTES = { low: 10 << 20, medium: 5 << 20, high: 2 << 20 };
const OUTPUT_DISPLAY_LIMIT = 2 << 20; // 2 MB
let lastOutput = '';
let baseName = 'obfuscated';

let currentPreset = 'low';
let lastMap = null;
let worker = null;
let activeRequestId = 0;
let watchdogTimer = null;
let runSnapshot = null;

// 高性能统计行数（避免 multi-MB 输入触发 split('\n') 导致巨额数组开销）
function countLines(s) {
  if (!s) return 0;
  let n = 1, i = -1;
  while ((i = s.indexOf('\n', i + 1)) !== -1) n++;
  return n;
}

function costTier(preset) {
  if (preset !== 'custom') return preset;
  return (els.optControlFlow.checked || els.optDeadCode.checked) ? 'high' : 'medium';
}

function estimateRun(preset, byteLen) {
  const tier = costTier(preset);
  const seconds = 2 + COST_S_PER_MB[tier] * (byteLen / (1 << 20));
  return {
    tier,
    seconds,
    timeoutMs: Math.max(60000, Math.ceil((seconds * 2 + 20) * 1000)),
  };
}

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
  els.obfuscateBtn.textContent = '▶ 混淆代码';
  if (els.cancelBtn) els.cancelBtn.hidden = true;
}

function cancelIfRunning() {
  const wasRunning = els.obfuscateBtn.disabled;
  activeRequestId++;
  if (wasRunning && worker) {
    worker.terminate();
    worker = null;
  }
  resetRunningState();
  if (wasRunning) {
    setEngineStatus('ready', '引擎就绪');
  }
}

if (els.cancelBtn) {
  els.cancelBtn.addEventListener('click', () => {
    cancelIfRunning();
    setEngineStatus('ready', '已取消混淆任务');
  });
}

// 统一的 Worker 消息处理（校验 requestId）
function handleWorkerMessage(e) {
  if (e.data && e.data.type === 'ready') {
    if (!els.obfuscateBtn.disabled) {
      setEngineStatus('ready', '引擎就绪');
    }
    return;
  }

  if (!e.data || e.data.requestId !== activeRequestId) {
    return;
  }

  resetRunningState();
  const { ok, code: result, error, line, column, sourceMap: map } = e.data;

  if (!ok) {
    setEngineStatus('error', '混淆失败');
    els.output.value = '';
    lastOutput = '';
    els.outputMeta.textContent = '—';
    els.statsPanel.style.display = 'none';

    let errorMsg = `混淆执行失败: ${error}`;
    if (line !== null && line !== undefined) {
      errorMsg = `[语法错误 SyntaxError] 第 ${line} 行，第 ${(column ?? 0) + 1} 列：\n${error}\n\n请检查源码中是否存在尚未闭合的括号、非法变量名或非标准 JS 语法。`;
    }
    showError(errorMsg);
    return;
  }

  lastOutput = result;
  const origBytes = runSnapshot ? runSnapshot.bytes : 0;
  const origLines = runSnapshot ? runSnapshot.lines : 0;
  const obfBytes = bytes(result);
  const obfLines = countLines(result);

  els.output.value = obfBytes > OUTPUT_DISPLAY_LIMIT
    ? `/* 输出 ${formatBytes(obfBytes)}，超过浏览器文本框直接预览上限（2 MB）。\n请使用下方「复制结果」或「下载 .js」获取完整代码。 */`
    : result;

  els.outputMeta.textContent = `${obfLines} 行 · ${formatBytes(obfBytes)}`;

  els.statOrigSize.textContent = formatBytes(origBytes);
  els.statObfSize.textContent = formatBytes(obfBytes);
  els.statLinesCompare.textContent = `${origLines} 行 → ${obfLines} 行`;

  const diffBytes = obfBytes - origBytes;
  if (diffBytes === 0 || origBytes === 0) {
    els.statDeltaRate.className = 'stats-badge';
    els.statDeltaRate.textContent = '0.0% (持平)';
  } else {
    const absRate = ((Math.abs(diffBytes) / origBytes) * 100).toFixed(1);
    if (diffBytes > 0) {
      els.statDeltaRate.className = 'stats-badge grow';
      els.statDeltaRate.textContent = `+${absRate}% (体积膨胀)`;
    } else {
      els.statDeltaRate.className = 'stats-badge shrink';
      els.statDeltaRate.textContent = `-${absRate}% (体积压缩)`;
    }
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
  const lines = countLines(code);
  els.inputMeta.textContent = `${lines} 行 · ${formatBytes(bytes(code))}`;
}

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => {
      t.classList.remove('is-active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    currentPreset = tab.dataset.preset;
    els.presetDesc.textContent = PRESET_DESC[currentPreset];
    els.customPanel.hidden = currentPreset !== 'custom';
  });
});

els.btnExample.addEventListener('click', () => {
  cancelIfRunning();
  baseName = 'obfuscated';
  els.input.value = EXAMPLE_JS;
  updateInputMeta();
  hideError();
});

els.btnClear.addEventListener('click', () => {
  cancelIfRunning();
  baseName = 'obfuscated';
  els.input.value = '';
  els.output.value = '';
  lastOutput = '';
  els.outputMeta.textContent = '—';
  els.statsPanel.style.display = 'none';
  hideError();
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  lastMap = null;
  updateInputMeta();
});

let tabTrap = true;
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    tabTrap = false;
    return;
  }
  if (e.key !== 'Tab' || !tabTrap || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
    if (e.key !== 'Tab') tabTrap = true;
    return;
  }
  e.preventDefault();
  if (!document.execCommand('insertText', false, '  ')) {
    const s = els.input.selectionStart;
    els.input.setRangeText('  ', s, els.input.selectionEnd, 'end');
    els.input.dispatchEvent(new Event('input'));
  }
});
els.input.addEventListener('blur', () => { tabTrap = true; });

// 增加文件后缀校验（支持 .js/.mjs/.cjs）、异常监听与单文件 10MB 熔断保护
function readFile(file) {
  if (!file) return;
  if (!/\.(?:c|m)?js$/i.test(file.name)) {
    showError(`不支持的文件类型："${file.name}"，请上传或拖入 .js / .mjs / .cjs 格式的 JavaScript 脚本。`);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError('文件体积超过 10MB 限制，纯前端浏览器环境混淆可能导致标签页内存溢出崩溃。');
    return;
  }
  baseName = file.name.replace(/\.[cm]?js$/i, '') + '.obf';
  const reader = new FileReader();
  reader.onload = () => {
    els.input.value = reader.result;
    updateInputMeta();
    hideError();
  };
  reader.onerror = () => {
    showError(`无法读取文件 "${file.name}": 文件权限受限或已被系统锁定。`);
  };
  reader.readAsText(file);
}

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
      readFile(dt.files[0]);
    }
  });
}

els.fileInput.addEventListener('change', () => {
  const f = els.fileInput.files[0];
  els.fileInput.value = '';
  readFile(f);
});

// 全局阻止用户拖拽文件落到窗口空白区导致浏览器跳走
['dragover', 'drop'].forEach((eventName) => {
  window.addEventListener(eventName, (e) => e.preventDefault());
});

let metaTimer = null;
els.input.addEventListener('input', () => {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(updateInputMeta, 150);
});
updateInputMeta();

// 采用库原生认可的标准纯净域名/通配后缀，杜绝多层转义失效引起的 SyntaxError
function sanitizeAndValidateDomain(domainStr) {
  if (!domainStr || !domainStr.trim()) {
    return { ok: true, domains: [], rawList: [] };
  }
  const parts = domainStr.split(',').map((s) => s.trim()).filter(Boolean);
  const validatedDomains = [];
  const rawList = [];
  const invalid = [];

  const LABEL = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?';
  const domainRegex = new RegExp(`^(?:\\*\\.)?(?:${LABEL}\\.)+${LABEL}$|^localhost$`, 'i');
  const ipv4Regex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

  for (const raw of parts) {
    // 1. 去除协议头 (http://, https://, //)
    let clean = raw.replace(/^(https?:)?\/\//i, '').trim();
    // 2. 先截断路径、查询参数和哈希 (提取首个 /、? 或 # 之前的主机段)
    clean = clean.split(/[/?#]/)[0].trim();
    // 3. 再剥离端口号 (如 :8080) 并小写化
    clean = clean.replace(/:\d+$/, '').trim().toLowerCase();

    const isWildcard = clean.startsWith('*.');
    const host = isWildcard ? clean.slice(2) : clean;

    if ((domainRegex.test(clean) || ipv4Regex.test(clean)) && !(isWildcard && ipv4Regex.test(host))) {
      rawList.push(clean);
      // *.example.com -> .example.com (以点开头代表匹配主域及所有子域名；普通 example.com 仅匹配完全一致的主机)
      validatedDomains.push(isWildcard ? '.' + host : host);
    } else {
      invalid.push(raw);
    }
  }

  if (invalid.length > 0) {
    return {
      ok: false,
      error: `域名锁定格式不合法: "${invalid.join(', ')}"\n请输入标准的主机名、域名或 IP（如 example.com、*.example.com 或 127.0.0.1，无需加 http:// 或 / 路径）。`,
      domains: [...new Set(validatedDomains)],
      rawList: [...new Set(rawList)],
    };
  }

  return {
    ok: true,
    domains: [...new Set(validatedDomains)],
    rawList: [...new Set(rawList)],
  };
}

function syncOptionInterlocks() {
  const isStringDisabled = els.optStringEncoding.value === 'none';

  for (const el of [els.optStringRotate, els.optStringShuffle]) {
    if (el) {
      el.disabled = isStringDisabled;
      el.closest('.option-check')?.classList.toggle('is-disabled', isStringDisabled);
    }
  }
  // splitStrings 独立于字符串数组，不在此处强制联动或清空用户的已选项

  // target=node 时，domainLock/selfDefending/debugProtection 会被引擎直接拒绝
  // （Validation failed: domainLock only allowed for browser targets），
  // 因此在 UI 层面禁用这些控件，避免用户组合出必然失败的配置
  const isNodeTarget = els.optTarget && els.optTarget.value === 'node';
  for (const el of [els.optDomainLock, els.optSelfDefending, els.optDebugProtection, els.optDebugInterval]) {
    if (!el) continue;
    el.disabled = isNodeTarget;
    el.closest('.option, .option-check')?.classList.toggle('is-disabled', isNodeTarget);
  }
}

function checkRiskWarnings() {
  syncOptionInterlocks();
  const warnings = [];

  if (els.optTarget && els.optTarget.value === 'node') {
    warnings.push('「运行目标」：当前目标为 node。域名锁定、自我防御、调试保护均为浏览器专属特性（引擎在 node 目标下会直接拒绝这些选项），已在下方禁用并且不会被提交。');
  }
  if (els.optSelfDefending.checked) {
    warnings.push('「自我防御」：代码将强制以紧凑压缩模式运行，任何外部格式化、美化或篡改都会直接触发死循环阻断。');
  }
  if (els.optDebugProtection.checked) {
    const interval = Math.max(0, parseInt(els.optDebugInterval?.value, 10) || 0);
    if (interval > 0) {
      warnings.push(`「调试保护」：在浏览器中打开 DevTools (F12) 控制台时将触发断点，并以每 ${interval}ms 间隔持续轮询冻结页面。`);
    } else {
      warnings.push('「调试保护」：在浏览器中打开 DevTools (F12) 控制台时将触发无限断点并冻结页面。');
    }
  }
  const domainRaw = els.optDomainLock.value.trim();
  if (domainRaw) {
    const domainCheck = sanitizeAndValidateDomain(domainRaw);
    if (domainCheck.ok && domainCheck.rawList.length > 0) {
      warnings.push(`「域名锁定」：代码将仅限在 [${domainCheck.rawList.join(', ')}] 运行（*.example.com 匹配主域及所有子域，单个 example.com 仅匹配完全一致的主机）。在未绑定的域名或本地打开将直接无法执行。`);
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
[els.optSelfDefending, els.optDebugProtection, els.optDomainLock, els.optTarget, els.optDebugInterval].filter(Boolean).forEach((item) => {
  item.addEventListener('input', checkRiskWarnings);
  item.addEventListener('change', checkRiskWarnings);
});

syncOptionInterlocks();

function readCustomOptions(validatedDomains) {
  const identifierNamesGenerator = els.optIdentifier.value;
  const stringEncoding = els.optStringEncoding.value;
  const isStringArrayEnabled = stringEncoding !== 'none';
  const target = els.optTarget ? els.optTarget.value : 'browser';

  // 引擎的正则形式选项不接受外层的 /.../，此处兼容用户带或不带斜杠两种写法
  const parseList = (v) => (v
    ? v.split(',').map((s) => s.trim().replace(/^\/(.*)\/$/, '$1')).filter(Boolean)
    : []);
  const reservedNames = parseList(els.optReservedNames?.value);
  const reservedStrings = parseList(els.optReservedStrings?.value);

  const options = {
    compact: true,
    renameGlobals: false, // 显式锁定全局变量命名为 false，杜绝不同内核版本的配置飘移
    target,
    identifierNamesGenerator,
    numbersToExpressions: els.optNumbersToExpressions.checked,
    unicodeEscapeSequence: els.optUnicodeEscapeSequence.checked,
    splitStrings: els.optSplitStrings.checked,
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
    stringArrayShuffle: isStringArrayEnabled && (els.optStringShuffle ? els.optStringShuffle.checked : true),
    // domainLock/selfDefending/debugProtection 仅浏览器目标可用；即使复选框在切换到
    // node 之前已被勾选，这里也强制忽略，防止残留状态触发引擎的 Validation failed
    selfDefending: target !== 'node' && els.optSelfDefending.checked,
    debugProtection: target !== 'node' && els.optDebugProtection.checked,
  };

  if (reservedNames.length > 0) options.reservedNames = reservedNames;
  if (reservedStrings.length > 0) options.reservedStrings = reservedStrings;

  const debugInterval = els.optDebugProtection.checked && els.optDebugInterval
    ? Math.max(0, parseInt(els.optDebugInterval.value, 10) || 0)
    : 0;
  if (debugInterval > 0) {
    options.debugProtectionInterval = debugInterval;
  }

  const seedRaw = els.optSeed.value.trim();
  if (seedRaw) {
    const num = Number(seedRaw);
    if (Number.isInteger(num) && num !== 0) {
      options.seed = num;
    }
  }

  if (target !== 'node' && validatedDomains && validatedDomains.length > 0) {
    options.domainLock = validatedDomains;
  }

  return options;
}

els.obfuscateBtn.addEventListener('click', () => {
  const code = els.input.value;
  if (!code.trim()) {
    showError('提示：请先在左侧输入或上传一段 JavaScript 代码。');
    return;
  }
  const codeBytes = bytes(code);
  const est = estimateRun(currentPreset, codeBytes);

  if (codeBytes > MAX_INPUT_BYTES[est.tier]) {
    showError(`当前混淆强度（${est.tier}）下输入上限为 ${formatBytes(MAX_INPUT_BYTES[est.tier])}（本次输入 ${formatBytes(codeBytes)}）。请降低强度或拆分文件。`);
    return;
  }

  if (est.seconds > 45 && !confirm(`根据代码体积与混淆强度，预计本次计算需耗时约 ${Math.round(est.seconds)} 秒，输出体积可能成倍增长。是否确认继续执行？`)) {
    return;
  }

  // 种子校验需在设置"运行中"状态之前完成，避免校验失败时按钮/状态灯卡死
  const seedRaw = els.optSeed.value.trim();
  let seedVal = null;
  if (seedRaw) {
    const num = Number(seedRaw);
    if (!Number.isInteger(num) || num === 0) {
      showError('随机种子必须是非 0 整数（0 在引擎中表示真随机，无法复现）。');
      return;
    }
    seedVal = num;
  }

  // 记录混淆发起时的快照，避免受后续异步干扰或文本行数统计误差
  runSnapshot = { bytes: codeBytes, lines: countLines(code) };

  const target = currentPreset === 'custom' && els.optTarget ? els.optTarget.value : null;
  const isNodeTarget = target === 'node';

  let validatedDomains = [];
  if (currentPreset === 'custom' && !isNodeTarget) {
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
  const risky = currentPreset === 'custom' && !isNodeTarget &&
    (els.optSelfDefending.checked || els.optDebugProtection.checked || validatedDomains.length > 0);

  if (risky && !confirm(
    '当前开启了「自我防御」、「调试保护」或「域名锁定」——若未按规范部署或试图调试格式化，代码将无法正常执行。确认以此配置混淆吗？'
  )) {
    return;
  }

  const w = getWorker();
  if (!w) return;

  const reqId = ++activeRequestId;

  els.obfuscateBtn.disabled = true;
  els.obfuscateBtn.textContent = '混淆计算中...';
  if (els.cancelBtn) els.cancelBtn.hidden = false;
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  hideError();
  setEngineStatus('running', `正在混淆…（预计约 ${Math.max(1, Math.round(est.seconds))} 秒）`);

  if (watchdogTimer) clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(() => {
    if (els.obfuscateBtn.disabled && activeRequestId === reqId) {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      resetRunningState();
      setEngineStatus('error', '混淆执行超时');
      showError(`混淆执行超时（已超过 ${Math.round(est.timeoutMs / 1000)} 秒熔断上限）已自动终止保护。\n建议：源码较大或嵌套较深时，请尝试关闭「控制流平坦化」或「死代码注入」以减少计算开销。`);
    }
  }, est.timeoutMs);

  const payload = {
    requestId: reqId,
    code,
    preset: currentPreset,
    seed: seedVal,
    custom: currentPreset === 'custom' ? readCustomOptions(validatedDomains) : null,
    sourceMap,
    outName: `${baseName}.js`,
    target,
  };

  w.postMessage(payload);
});

els.copyBtn.addEventListener('click', async () => {
  const content = lastOutput || els.output.value;
  if (!content) return;
  try {
    await navigator.clipboard.writeText(content);
    const originalText = els.copyBtn.textContent;
    els.copyBtn.textContent = '✓ 已复制';
    setTimeout(() => { els.copyBtn.textContent = originalText; }, 1800);
  } catch {
    // 回退方案：output 文本框在超大结果时只显示占位提示，不能直接 select() 它，
    // 需借助一个不可见的临时 textarea 承载真实的 content 再执行 copy 命令
    const ta = document.createElement('textarea');
    ta.value = content;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
    const originalText = els.copyBtn.textContent;
    els.copyBtn.textContent = '✓ 已复制';
    setTimeout(() => { els.copyBtn.textContent = originalText; }, 1800);
  }
});

function download(filename, content, type = 'text/javascript;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

els.downloadBtn.addEventListener('click', () => {
  const content = lastOutput || els.output.value;
  if (content) {
    download(`${baseName}.js`, content, 'text/javascript;charset=utf-8');
  }
});

els.downloadMapBtn.addEventListener('click', () => {
  if (lastMap) {
    download(`${baseName}.js.map`, lastMap, 'application/json');
  }
});

// 页面加载空闲时预热 Worker
(window.requestIdleCallback || setTimeout)(() => getWorker());

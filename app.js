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

function getWorker() {
  if (!worker) worker = new Worker('worker.js');
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

function setEngineStatus(state, msg) {
  els.statusIndicator.className = `status-indicator ${state}`;
  els.statusIndicatorText.textContent = msg;
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
  els.errorBox.style.display = 'none';
  els.errorBox.textContent = '';
});

els.btnClear.addEventListener('click', () => {
  els.input.value = '';
  els.output.value = '';
  els.outputMeta.textContent = '—';
  els.statsPanel.style.display = 'none';
  els.errorBox.style.display = 'none';
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
    els.errorBox.style.display = 'none';
  };
  reader.readAsText(file);
}

els.fileInput.addEventListener('change', () => {
  readFile(els.fileInput.files[0]);
});

els.input.addEventListener('input', updateInputMeta);
updateInputMeta();

// 高风险选项动态提示
function checkRiskWarnings() {
  const warnings = [];
  if (els.optSelfDefending.checked) {
    warnings.push('「自我防御」：开启后，任何美化格式化或篡改混淆代码的操作都会使程序拒绝运行。');
  }
  if (els.optDebugProtection.checked) {
    warnings.push('「调试保护」：开启后，在打开开发者工具 (F12) 时将触发无限断点并冻结页面。');
  }
  const domain = els.optDomainLock.value.trim();
  if (domain) {
    warnings.push(`「域名锁定」：代码将仅限在 [${domain}] 运行，在本地文件或其他域名中打开会直接抛出异常。`);
  }

  if (warnings.length > 0) {
    els.riskWarningBox.style.display = 'block';
    els.riskWarningText.textContent = warnings.join(' ');
  } else {
    els.riskWarningBox.style.display = 'none';
    els.riskWarningText.textContent = '';
  }
}

[els.optSelfDefending, els.optDebugProtection, els.optDomainLock].forEach((item) => {
  item.addEventListener('input', checkRiskWarnings);
  item.addEventListener('change', checkRiskWarnings);
});

function readCustomOptions() {
  const identifierNamesGenerator = els.optIdentifier.value;
  const stringEncoding = els.optStringEncoding.value;
  const domainRaw = els.optDomainLock.value.trim();
  const seedRaw = els.optSeed.value.trim();

  const options = {
    compact: true,
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
    stringArray: stringEncoding !== 'none',
    stringArrayEncoding: stringEncoding === 'none' ? [] : [stringEncoding],
    stringArrayThreshold: 0.75,
    stringArrayRotate: els.optStringRotate.checked,
    stringArrayShuffle: els.optStringRotate.checked,
    selfDefending: els.optSelfDefending.checked,
    debugProtection: els.optDebugProtection.checked,
  };

  if (seedRaw) {
    options.seed = seedRaw;
  }

  if (domainRaw) {
    options.domainLock = domainRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return options;
}

// 点击混淆
els.obfuscateBtn.addEventListener('click', () => {
  const code = els.input.value.trim();
  if (!code) {
    els.errorBox.style.display = 'block';
    els.errorBox.textContent = '提示：请先在左侧输入或上传一段 JavaScript 代码。';
    return;
  }

  const sourceMap = currentPreset === 'custom' && els.optSourceMap.checked;

  const risky = currentPreset === 'custom' &&
    (els.optDebugProtection.checked || els.optDomainLock.value.trim());

  if (risky && !confirm(
    '当前开启了「调试保护」或「域名锁定」——若未部署到目标域名或试图调试，代码将无法正常执行。确认以此配置混淆吗？'
  )) {
    return;
  }

  els.obfuscateBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  els.errorBox.style.display = 'none';
  els.errorBox.textContent = '';
  setEngineStatus('running', '正在混淆…（高强度计算可能需要数秒）');

  const payload = {
    code,
    preset: currentPreset,
    custom: currentPreset === 'custom' ? readCustomOptions() : null,
    sourceMap,
  };

  const w = getWorker();
  w.onmessage = (e) => {
    els.obfuscateBtn.disabled = false;
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
      els.errorBox.textContent = errorMsg;
      els.errorBox.style.display = 'block';
      return;
    }

    els.output.value = result;
    const origBytes = bytes(code);
    const obfBytes = bytes(result);
    const origLines = code.split('\n').length;
    const obfLines = result.split('\n').length;

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

// 下载文件
function download(filename, content) {
  const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

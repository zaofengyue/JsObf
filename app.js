const PRESET_DESC = {
  low: '变量重命名 + 压缩，性能损耗最小，适合日常使用。',
  medium: '低混淆 + 字符串数组提取/加密（base64），兼顾防护与性能。',
  high: '中混淆 + 控制流平坦化 + 死代码注入 + 字符串数组轮转打乱，防护最强，体积和耗时代价最大。',
  custom: '自己勾选想要的变换，每一项都对应下方的参数说明。',
};

const els = {
  tabs: document.querySelectorAll('.preset-tab'),
  presetDesc: document.getElementById('presetDesc'),
  customPanel: document.getElementById('customPanel'),
  input: document.getElementById('inputCode'),
  output: document.getElementById('outputCode'),
  inputMeta: document.getElementById('inputMeta'),
  outputMeta: document.getElementById('outputMeta'),
  fileInput: document.getElementById('fileInput'),
  obfuscateBtn: document.getElementById('obfuscateBtn'),
  copyBtn: document.getElementById('copyBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadMapBtn: document.getElementById('downloadMapBtn'),
  status: document.getElementById('statusLine'),
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

function updateInputMeta() {
  const code = els.input.value;
  const lines = code ? code.split('\n').length : 0;
  els.inputMeta.textContent = `${lines} 行 · ${bytes(code)} B`;
}

els.input.addEventListener('input', updateInputMeta);
updateInputMeta();

els.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    els.tabs.forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    currentPreset = tab.dataset.preset;
    els.presetDesc.textContent = PRESET_DESC[currentPreset];
    els.customPanel.hidden = currentPreset !== 'custom';
  });
});

els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    els.input.value = reader.result;
    updateInputMeta();
  };
  reader.readAsText(file);
});

function readCustomOptions() {
  const identifierNamesGenerator = document.getElementById('optIdentifier').value;
  const stringEncoding = document.getElementById('optStringEncoding').value;
  const domainRaw = document.getElementById('optDomainLock').value.trim();

  const options = {
    compact: true,
    identifierNamesGenerator,
    controlFlowFlattening: document.getElementById('optControlFlow').checked,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: document.getElementById('optDeadCode').checked,
    deadCodeInjectionThreshold: 0.4,
    stringArray: stringEncoding !== 'none',
    stringArrayEncoding: stringEncoding === 'none' ? [] : [stringEncoding],
    stringArrayThreshold: 0.75,
    stringArrayRotate: document.getElementById('optStringRotate').checked,
    stringArrayShuffle: document.getElementById('optStringRotate').checked,
    selfDefending: document.getElementById('optSelfDefending').checked,
    debugProtection: document.getElementById('optDebugProtection').checked,
  };

  if (domainRaw) {
    options.domainLock = domainRaw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return options;
}

function setStatus(msg, ok) {
  els.status.textContent = msg;
  els.status.classList.toggle('is-ok', !!ok);
}

els.obfuscateBtn.addEventListener('click', () => {
  const code = els.input.value.trim();
  if (!code) {
    setStatus('先粘贴或上传一段代码吧。', false);
    return;
  }

  const sourceMap = document.getElementById('optSourceMap')
    ? document.getElementById('optSourceMap').checked
    : false;

  const risky = currentPreset === 'custom' &&
    (document.getElementById('optDebugProtection').checked ||
     document.getElementById('optDomainLock').value.trim());

  if (risky && !confirm(
    '你开启了「调试保护」或「域名锁定」——配置不当可能导致混淆后的代码在自己的页面上也无法正常运行。确认继续吗？'
  )) {
    return;
  }

  els.obfuscateBtn.disabled = true;
  els.copyBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.downloadMapBtn.disabled = true;
  els.downloadMapBtn.hidden = true;
  setStatus('混淆中…（高强度选项处理大文件可能需要几秒）', false);

  const payload = {
    code,
    preset: currentPreset,
    custom: currentPreset === 'custom' ? readCustomOptions() : null,
    sourceMap,
  };

  const w = getWorker();
  w.onmessage = (e) => {
    els.obfuscateBtn.disabled = false;
    const { ok, code: result, error, sourceMap: map } = e.data;

    if (!ok) {
      setStatus('混淆失败：' + error, false);
      els.output.value = '';
      els.outputMeta.textContent = '—';
      return;
    }

    els.output.value = result;
    const lines = result.split('\n').length;
    els.outputMeta.textContent = `${lines} 行 · ${bytes(result)} B（原始 ${bytes(code)} B）`;
    els.copyBtn.disabled = false;
    els.downloadBtn.disabled = false;

    if (map) {
      lastMap = map;
      els.downloadMapBtn.hidden = false;
      els.downloadMapBtn.disabled = false;
    } else {
      lastMap = null;
    }

    setStatus('混淆完成。', true);
  };

  w.postMessage(payload);
});

els.copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.output.value);
    setStatus('已复制到剪贴板。', true);
  } catch {
    els.output.select();
    document.execCommand('copy');
    setStatus('已复制到剪贴板。', true);
  }
});

function download(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

els.downloadBtn.addEventListener('click', () => {
  download('obfuscated.js', els.output.value);
});

els.downloadMapBtn.addEventListener('click', () => {
  if (lastMap) download('obfuscated.js.map', lastMap);
});

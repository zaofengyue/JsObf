// worker.js —— 在独立线程里跑混淆，避免大文件/高强度选项卡住页面主线程
importScripts('lib/javascript-obfuscator.browser.js');

// 三档预设：直接映射 javascript-obfuscator 的官方参数组合
const PRESETS = {
  low: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: false,
    numbersToExpressions: false,
    unicodeEscapeSequence: false,
    disableConsoleOutput: false,
    splitStrings: false,
    transformObjectKeys: false,
    renameGlobals: false,
  },
  medium: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    numbersToExpressions: true,
    unicodeEscapeSequence: false,
    disableConsoleOutput: false,
    splitStrings: false,
    transformObjectKeys: false,
    renameGlobals: false,
  },
  high: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 1,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    numbersToExpressions: true,
    unicodeEscapeSequence: true,
    disableConsoleOutput: false,
    splitStrings: true,
    splitStringsChunkLength: 5,
    transformObjectKeys: true,
    selfDefending: false, // 保持安全默认，避免未提示即锁死
    debugProtection: false,
    renameGlobals: false,
  },
};

self.onmessage = function (e) {
  const { requestId, code, preset, custom, sourceMap, seed } = e.data;

  try {
    const baseOptions = preset === 'custom' ? (custom || {}) : { ...PRESETS[preset] };
    const options = {
      ...baseOptions,
      identifierNamesGenerator: baseOptions.identifierNamesGenerator || 'hexadecimal',
      sourceMap: !!sourceMap,
      sourceMapMode: 'separate',
    };

    // 优先统一提取种子：优先级为 custom.seed -> e.data.seed -> baseOptions.seed
    const rawSeed = (custom && custom.seed !== undefined && custom.seed !== null && custom.seed !== '')
      ? custom.seed
      : ((seed !== undefined && seed !== null && seed !== '') ? seed : baseOptions.seed);

    if (rawSeed !== undefined && rawSeed !== null && rawSeed !== '') {
      const numSeed = Number(rawSeed);
      options.seed = isNaN(numSeed) ? String(rawSeed) : numSeed;
    } else {
      // 显式删除 options.seed，彻底防止解构残留的空串或非法假值覆盖库原生的真随机种子机制
      delete options.seed;
    }

    const result = JavaScriptObfuscator.obfuscate(code, options);

    self.postMessage({
      requestId,
      ok: true,
      code: result.getObfuscatedCode(),
      sourceMap: sourceMap ? result.getSourceMap() : null,
    });
  } catch (err) {
    let message = '未知错误';
    let line = null;
    let column = null;

    if (err) {
      message = err.message || String(err);
      // 尝试从 Acorn / Obfuscator 错误信息中提取行号和列号 (如 "Unexpected token (10:2)")
      const match = message.match(/\((\d+):(\d+)\)/);
      if (match) {
        line = parseInt(match[1], 10);
        column = parseInt(match[2], 10);
      }
    }

    self.postMessage({
      requestId,
      ok: false,
      error: message,
      line: line,
      column: column,
    });
  }
};

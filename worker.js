// worker.js —— 在独立线程里跑混淆，避免大文件/高强度选项卡住页面主线程
importScripts('lib/javascript-obfuscator.browser.js');

// 三档预设：直接映射 javascript-obfuscator 的官方参数组合
const PRESETS = {
  low: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: false,
    renameGlobals: false,
  },
  medium: {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
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
    renameGlobals: false,
  },
};

self.onmessage = function (e) {
  const { code, preset, custom, sourceMap } = e.data;

  try {
    const baseOptions = preset === 'custom' ? custom : { ...PRESETS[preset] };
    const options = {
      ...baseOptions,
      identifierNamesGenerator: baseOptions.identifierNamesGenerator || 'hexadecimal',
      sourceMap: !!sourceMap,
      sourceMapMode: 'separate',
    };

    const result = JavaScriptObfuscator.obfuscate(code, options);

    self.postMessage({
      ok: true,
      code: result.getObfuscatedCode(),
      sourceMap: sourceMap ? result.getSourceMap() : null,
    });
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};

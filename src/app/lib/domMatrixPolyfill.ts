// Polyfill DOMMatrix in Node.js environments
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor() {}
    multiplySelf() { return this; }
    translateSelf() { return this; }
    scaleSelf() { return this; }
    rotateSelf() { return this; }
    transformPoint(point: { x: number; y: number }) {
      return { x: point.x, y: point.y };
    }
  }
  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}
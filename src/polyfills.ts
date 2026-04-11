// Polyfills for older Safari (< 15.4 / < 17.4 / < 18)
// These MUST be loaded before pdfjs-dist is imported.

// Promise.withResolvers — Safari < 17.4 (ES2024)
if (typeof (Promise as any).withResolvers === 'undefined') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// URL.parse — Safari < 18
if (typeof (URL as any).parse === 'undefined') {
  (URL as any).parse = function (url: string, base?: string) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

// structuredClone — Safari < 15.4
if (typeof globalThis.structuredClone === 'undefined') {
  (globalThis as any).structuredClone = function <T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  };
}

// Object.hasOwn — Safari < 15.4
if (typeof (Object as any).hasOwn === 'undefined') {
  (Object as any).hasOwn = function (obj: object, prop: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  };
}

// Array.prototype.at — Safari < 15.4
if (typeof Array.prototype.at === 'undefined') {
  Array.prototype.at = function (index: number) {
    const len = this.length;
    const i = index >= 0 ? index : len + index;
    return i >= 0 && i < len ? this[i] : undefined;
  };
}

// Array.prototype.findLast — Safari < 15.4
if (typeof (Array.prototype as any).findLast === 'undefined') {
  (Array.prototype as any).findLast = function <T>(
    predicate: (value: T, index: number, array: T[]) => boolean,
    thisArg?: unknown,
  ) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  };
}

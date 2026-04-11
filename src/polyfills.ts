// Polyfills for older Safari (< 17.4 / < 18)

// Promise.withResolvers — used by pdfjs-dist v5 (ES2024)
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

// URL.parse — used by pdfjs-dist v5, Safari < 18 doesn't support it
if (typeof (URL as any).parse === 'undefined') {
  (URL as any).parse = function (url: string, base?: string) {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}

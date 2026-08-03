/**
 * Browser API shim for Electron main process
 * Provides minimal stubs for browser globals that some bundled code may reference
 */
if (typeof globalThis.document === 'undefined') {
  const noop = () => {}
  const stubElement = {
    getAttribute: () => null,
    setAttribute: noop,
    appendChild: noop,
    removeChild: noop,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    style: {},
    childNodes: [],
    firstChild: null,
    lastChild: null,
    parentNode: null,
    ownerDocument: null,
    tagName: '',
    nodeName: '',
    nodeType: 1,
    textContent: '',
    innerHTML: '',
    outerHTML: '',
    href: '',
    rel: '',
    type: '',
    nonce: '',
  }
  const stubDocument = {
    createElement: () => ({ ...stubElement, style: {}, setAttribute: noop, appendChild: noop }),
    createTextNode: () => ({ nodeType: 3, textContent: '' }),
    createElementNS: () => ({ ...stubElement, style: {}, setAttribute: noop, appendChild: noop }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    getElementsByClassName: () => [],
    getElementById: () => null,
    head: { ...stubElement, appendChild: noop, insertBefore: noop },
    body: { ...stubElement, appendChild: noop, insertBefore: noop },
    documentElement: stubElement,
    addEventListener: noop,
    removeEventListener: noop,
    readyState: 'complete',
    cookie: '',
    location: { href: '', protocol: 'file:', host: '', pathname: '' },
    defaultView: null,
  }
  // @ts-ignore
  globalThis.document = stubDocument
  // @ts-ignore
  globalThis.window = {
    document: stubDocument,
    location: stubDocument.location,
    addEventListener: noop,
    removeEventListener: noop,
    navigator: { userAgent: 'node' },
    matchMedia: () => ({ matches: false, addListener: noop, removeListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    devicePixelRatio: 1,
    innerWidth: 0,
    innerHeight: 0,
  }
}

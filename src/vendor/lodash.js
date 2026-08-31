/** * Lightweight lodash replacement * Only implements functions actually used in the project. */
export function noop() { }
export function last(arr) { return arr == null ? undefined : arr[arr.length - 1]; }
export function capitalize(str) { if (typeof str !== 'string')
    return ''; return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase(); }
export function isObject(val) { return val !== null && (typeof val === 'object' || typeof val === 'function'); }
export function isPlainObject(val) { if (val === null || typeof val !== 'object')
    return false; var proto = Object.getPrototypeOf(val); return proto === null || proto === Object.prototype; }
export function sumBy(arr, iteratee) { if (arr == null)
    return 0; var sum = 0; for (var i = 0; i < arr.length; i++) {
    sum += typeof iteratee === 'function' ? iteratee(arr[i]) : arr[i][iteratee];
} return sum; }
export function zipObject(props, vals) { var result = {}; for (var i = 0; i < (props || []).length; i++) {
    result[props[i]] = vals ? vals[i] : undefined;
} return result; }
export function reject(arr, predicate) { if (arr == null)
    return []; var result = []; for (var i = 0; i < arr.length; i++) {
    if (!predicate(arr[i], i, arr))
        result.push(arr[i]);
} return result; }
export function partition(arr, predicate) { if (arr == null)
    return [[], []]; var pass = [], fail = []; for (var i = 0; i < arr.length; i++) {
    if (predicate(arr[i], i, arr)) {
        pass.push(arr[i]);
    }
    else {
        fail.push(arr[i]);
    }
} return [pass, fail]; }
export function pickBy(obj, predicate) { var result = {}; if (obj == null)
    return result; predicate = predicate || function (v) { return v; }; for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && predicate(obj[key], key)) {
        result[key] = obj[key];
    }
} return result; }
export function omit(obj, paths) { if (obj == null)
    return {}; var result = {}; var props = Array.isArray(paths) ? paths : [paths]; for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (props.indexOf(key) === -1) {
            result[key] = obj[key];
        }
    }
} return result; }
export function mapValues(obj, iteratee) { var result = {}; if (obj == null)
    return result; for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = iteratee(obj[key], key, obj);
    }
} return result; }
export function uniqBy(arr, iteratee) { if (arr == null)
    return []; var seen = new Set(); var result = []; for (var i = 0; i < arr.length; i++) {
    var key = typeof iteratee === 'function' ? iteratee(arr[i]) : arr[i][iteratee];
    if (!seen.has(key)) {
        seen.add(key);
        result.push(arr[i]);
    }
} return result; }
export function sample(arr) { if (arr == null || arr.length === 0)
    return undefined; return arr[Math.floor(Math.random() * arr.length)]; }
export function isEqual(a, b) { if (a === b)
    return true; if (a == null || b == null)
    return a === b; if (typeof a !== typeof b)
    return false; if (typeof a !== 'object')
    return a === b; if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length)
        return false;
    for (var i = 0; i < a.length; i++) {
        if (!isEqual(a[i], b[i]))
            return false;
    }
    return true;
} var keysA = Object.keys(a); var keysB = Object.keys(b); if (keysA.length !== keysB.length)
    return false; for (var j = 0; j < keysA.length; j++) {
    if (!Object.prototype.hasOwnProperty.call(b, keysA[j]))
        return false;
    if (!isEqual(a[keysA[j]], b[keysA[j]]))
        return false;
} return true; }
export function cloneDeep(val) { if (val === null || typeof val !== 'object')
    return val; if (Array.isArray(val))
    return val.map(cloneDeep); var result = {}; for (var key in val) {
    if (Object.prototype.hasOwnProperty.call(val, key)) {
        result[key] = cloneDeep(val[key]);
    }
} return result; }
export function clone(val) { if (val === null || typeof val !== 'object')
    return val; if (Array.isArray(val))
    return val.slice(); var result = {}; for (var key in val) {
    if (Object.prototype.hasOwnProperty.call(val, key)) {
        result[key] = val[key];
    }
} return result; }
export function setWith(obj, path, value, customizer) { if (obj == null)
    return obj; var pathArr = typeof path === 'string' ? path.split('.') : path; var current = obj; for (var i = 0; i < pathArr.length - 1; i++) {
    var key = pathArr[i];
    if (current[key] == null || typeof current[key] !== 'object') {
        var next = pathArr[i + 1];
        current[key] = customizer ? customizer(current[key], key, obj) : {};
    }
    current = current[key];
} current[pathArr[pathArr.length - 1]] = value; return obj; }
export function mergeWith(obj, src, customizer) { function merge(a, b) { if (customizer) {
    var c = customizer(a, b);
    if (c !== undefined)
        return c;
} if (b === null || typeof b !== 'object')
    return b; if (Array.isArray(b)) {
    var arr = Array.isArray(a) ? a.slice() : [];
    for (var i = 0; i < b.length; i++) {
        arr[i] = merge(arr[i], b[i]);
    }
    return arr;
} var result = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {}; for (var key in b) {
    if (Object.prototype.hasOwnProperty.call(b, key)) {
        result[key] = merge(result[key], b[key]);
    }
} return result; } return merge(obj, src); }
export function memoize(func, resolver) {
    var memoized = function (...args) {
        var key = resolver ? resolver.apply(this, args) : args[0];
        var cache = memoized.cache;
        if (cache.has(key))
            return cache.get(key);
        var result = func.apply(this, args);
        cache.set(key, result);
        return result;
    };
    memoized.cache = new Map();
    return memoized;
}
export function diffLines(oldStr, newStr) { if (oldStr === newStr)
    return ''; var oldLines = oldStr.split('\n'); var newLines = newStr.split('\n'); var result = ''; for (var i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (i < oldLines.length && i < newLines.length) {
        if (oldLines[i] !== newLines[i]) {
            result += '- ' + oldLines[i] + '\n+ ' + newLines[i] + '\n';
        }
        else {
            result += '  ' + oldLines[i] + '\n';
        }
    }
    else if (i >= oldLines.length) {
        result += '+ ' + newLines[i] + '\n';
    }
    else {
        result += '- ' + oldLines[i] + '\n';
    }
} return result; }
export function throttle(func, wait) { var lastCall = 0; var timeoutId; var lastArgs; var lastThis; function invoke() { lastCall = Date.now(); func.apply(lastThis, lastArgs); timeoutId = null; } function throttled() { lastArgs = arguments; lastThis = this; var now = Date.now(); var remaining = wait - (now - lastCall); if (remaining <= 0) {
    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
    invoke();
}
else if (!timeoutId) {
    timeoutId = setTimeout(invoke, remaining);
} } throttled.cancel = function () { if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
} }; return throttled; }

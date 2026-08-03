import type { GrowthBook } from "../GrowthBook";
import type {
  UserScopedGrowthBook,
  GrowthBookClient,
} from "../GrowthBookClient";

export type AutoAttributeSettings = {
  uuidCookieName?: string;
  uuidKey?: string;
  uuid?: string;
  uuidAutoPersist?: boolean;
};

function getBrowserDevice(ua: string): { browser: string; deviceType: string } {
  const browser = ua.match(/Edg/)
    ? "edge"
    : ua.match(/Chrome/)
      ? "chrome"
      : ua.match(/Firefox/)
        ? "firefox"
        : ua.match(/Safari/)
          ? "safari"
          : "unknown";

  const deviceType = ua.match(/Mobi/) ? "mobile" : "desktop";

  return { browser, deviceType };
}

function getURLAttributes(url: URL | Location | undefined) {
  if (!url) return {};
  return {
    url: url.href,
    path: url.pathname,
    host: url.host,
    query: url.search,
  };
}

export function autoAttributesPlugin(settings: AutoAttributeSettings = {}) {
  // 仅浏览器环境
  if (typeof window === "undefined") {
    throw new Error("autoAttributesPlugin 仅限浏览器环境使用");
  }

  const COOKIE_NAME = settings.uuidCookieName || "gbuuid";
  const uuidKey = settings.uuidKey || "id";
  let uuid = settings.uuid || "";
  function persistUUID() {
    setCookie(COOKIE_NAME, uuid);
  }
  function getUUID() {
    // 已存储在内存中，直接返回
    if (uuid) return uuid;

    // 如果 cookie 已设置，直接返回
    uuid = getCookie(COOKIE_NAME);
    if (uuid) return uuid;

    // 生成新的 UUID
    uuid = genUUID(window.crypto);
    return uuid;
  }

  // 监听自定义事件以持久化 UUID cookie
  document.addEventListener("growthbookpersist", () => {
    persistUUID();
  });

  function getAutoAttributes(settings: AutoAttributeSettings) {
    const ua = navigator.userAgent;

    const _uuid = getUUID();

    // 如果提供了 uuid，默认不持久化，否则默认持久化
    if (settings.uuidAutoPersist ?? !settings.uuid) {
      persistUUID();
    }

    const url = location;

    return {
      ...getDataLayerVariables(),
      [uuidKey]: _uuid,
      ...getURLAttributes(url),
      pageTitle: document.title,
      ...getBrowserDevice(ua),
      ...getUtmAttributes(url),
    };
  }

  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    // 仅适用于具有用户属性的实例
    if ("createScopedInstance" in gb) {
      return;
    }

    // 设置初始属性
    const attributes = getAutoAttributes(settings);
    attributes.url && gb.setURL(attributes.url);
    gb.updateAttributes(attributes);

    // 轮询 URL 变化并更新 GrowthBook
    let currentUrl = attributes.url;
    const intervalTimer = setInterval(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        gb.setURL(currentUrl);
        gb.updateAttributes(getAutoAttributes(settings));
      }
    }, 500);

    // 监听自定义事件以更新 URL 和属性
    const refreshListener = () => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        gb.setURL(currentUrl);
      }
      gb.updateAttributes(getAutoAttributes(settings));
    };
    document.addEventListener("growthbookrefresh", refreshListener);

    if ("onDestroy" in gb) {
      gb.onDestroy(() => {
        clearInterval(intervalTimer);
        document.removeEventListener("growthbookrefresh", refreshListener);
      });
    }
  };
}

function setCookie(name: string, value: string) {
  const d = new Date();
  const COOKIE_DAYS = 400; // 400 天是 Chrome 的最大 cookie 有效期
  d.setTime(d.getTime() + 24 * 60 * 60 * 1000 * COOKIE_DAYS);
  document.cookie = name + "=" + value + ";path=/;expires=" + d.toUTCString();
}

function getCookie(name: string): string {
  const value = "; " + document.cookie;
  const parts = value.split(`; ${name}=`);
  return parts.length === 2 ? parts[1].split(";")[0] : "";
}

// 使用浏览器的 crypto.randomUUID（如果可用）生成 UUID
function genUUID(crypto?: Crypto) {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return ("" + 1e7 + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => {
    const n =
      crypto && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint8Array(1))[0]
        : Math.floor(Math.random() * 256);
    return (
      (c as unknown as number) ^
      (n & (15 >> ((c as unknown as number) / 4)))
    ).toString(16);
  });
}

function getUtmAttributes(url: URL | Location | undefined) {
  // 将 utm 参数存储在 sessionStorage 中以供后续页面加载使用
  let utms: Record<string, string> = {};
  try {
    const existing = sessionStorage.getItem("utm_params");
    if (existing) {
      utms = JSON.parse(existing);
    }
  } catch (e) {
    // 如果 sessionStorage 被禁用（如无痕窗口），不执行任何操作
  }

  // 从查询字符串中添加 utm 参数
  if (url && url.search) {
    const params = new URLSearchParams(url.search);
    let hasChanges = false;
    ["source", "medium", "campaign", "term", "content"].forEach((k) => {
      // 查询字符串使用蛇形命名法（snake_case）
      const param = `utm_${k}`;
      // 属性键使用驼峰命名法（camelCase）
      const attr = `utm` + k[0].toUpperCase() + k.slice(1);

      if (params.has(param)) {
        utms[attr] = params.get(param) || "";
        hasChanges = true;
      }
    });

    // 写回 sessionStorage
    if (hasChanges) {
      try {
        sessionStorage.setItem("utm_params", JSON.stringify(utms));
      } catch (e) {
        // 如果 sessionStorage 被禁用（如无痕窗口），不执行任何操作
      }
    }
  }

  return utms;
}

function getDataLayerVariables() {
  if (
    typeof window === "undefined" ||
    !window.dataLayer ||
    !window.dataLayer.forEach
  ) {
    return {};
  }

  const obj: Record<string, unknown> = {};
  window.dataLayer.forEach((item: unknown) => {
    // 跳过空条目和非对象条目
    if (!item || typeof item !== "object" || "length" in item) return;

    // 跳过事件条目
    if ("event" in item) return;

    Object.keys(item).forEach((k) => {
      // 过滤掉无用的已知属性
      if (typeof k !== "string" || k.match(/^(gtm)/)) return;

      const val = (item as Record<string, unknown>)[k];

      // 仅添加原始类型的变量值
      const valueType = typeof val;
      if (["string", "number", "boolean"].includes(valueType)) {
        obj[k] = val;
      }
    });
  });
  return obj;
}

import { loadSDKVersion } from "../util";
import type { Attributes, EventProperties } from "../types/growthbook";
import type { GrowthBook } from "../GrowthBook";
import type {
  GrowthBookClient,
  UserScopedGrowthBook,
} from "../GrowthBookClient";
import { EVENT_EXPERIMENT_VIEWED, EVENT_FEATURE_EVALUATED } from "../core";

const SDK_VERSION = loadSDKVersion();

type GlobalTrackedEvent = {
  eventName: string;
  properties: Record<string, unknown>;
};
declare global {
  interface Window {
    gbEvents?:
      | (GlobalTrackedEvent | string)[]
      | {
          push: (event: GlobalTrackedEvent | string) => void;
        };
  }
}

type EventPayload = {
  event_name: string;
  properties_json: Record<string, unknown>;
  sdk_language: string;
  sdk_version: string;
  url: string;
  context_json: Record<string, unknown>;
  user_id: string | null;
  device_id: string | null;
  page_id: string | null;
  session_id: string | null;
  page_title?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
};

function parseString(value: unknown): null | string {
  return typeof value === "string" ? value : null;
}

function parseAttributes(attributes: Attributes): {
  nested: Attributes;
  topLevel: {
    user_id: string | null;
    device_id: string | null;
    page_id: string | null;
    session_id: string | null;
    page_title?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
} {
  const {
    user_id,
    device_id,
    anonymous_id,
    id,
    page_id,
    session_id,
    utmCampaign,
    utmContent,
    utmMedium,
    utmSource,
    utmTerm,
    pageTitle,
    ...nested
  } = attributes;

  return {
    nested,
    topLevel: {
      user_id: parseString(user_id),
      device_id: parseString(device_id || anonymous_id || id),
      page_id: parseString(page_id),
      session_id: parseString(session_id),
      utm_campaign: parseString(utmCampaign) || undefined,
      utm_content: parseString(utmContent) || undefined,
      utm_medium: parseString(utmMedium) || undefined,
      utm_source: parseString(utmSource) || undefined,
      utm_term: parseString(utmTerm) || undefined,
      page_title: parseString(pageTitle) || undefined,
    },
  };
}

type EventData = {
  eventName: string;
  properties: EventProperties;
  attributes: Attributes;
  url: string;
};

function getEventPayload({
  eventName,
  properties,
  attributes,
  url,
}: EventData): EventPayload {
  const { nested, topLevel } = parseAttributes(attributes || {});

  return {
    event_name: eventName,
    properties_json: properties || {},
    ...topLevel,
    sdk_language: "js",
    sdk_version: SDK_VERSION,
    url: url,
    context_json: nested,
  };
}

async function track({
  clientKey,
  ingestorHost,
  events,
}: {
  events: EventPayload[];
  clientKey: string;
  ingestorHost?: string;
}) {
  if (!events.length) return;

  const endpoint = `${
    ingestorHost || "https://us1.gb-ingest.com"
  }/track?client_key=${clientKey}`;
  const body = JSON.stringify(events);

  try {
    await fetch(endpoint, {
      method: "POST",
      body,
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain",
      },
      credentials: "omit",
    });
  } catch (e) {
    console.error("跟踪事件失败", e);
  }
}

export function growthbookTrackingPlugin({
  queueFlushInterval = 100,
  ingestorHost,
  enable = true,
  debug,
  dedupeCacheSize = 1000,
  dedupeKeyAttributes = [],
  eventFilter,
}: {
  // TODO: 添加选项以允许过滤掉包含个人身份信息（PII）的某些属性
  queueFlushInterval?: number;
  ingestorHost?: string;
  enable?: boolean;
  debug?: boolean;
  dedupeCacheSize?: number;
  dedupeKeyAttributes?: string[];
  eventFilter?: (event: EventData) => boolean;
} = {}) {
  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    const clientKey = gb.getClientKey();
    if (!clientKey) {
      throw new Error("使用事件日志功能必须指定 clientKey");
    }

    // 用于避免重复事件的 LRU 缓存
    const eventCache = new Set<string>();

    if ("setEventLogger" in gb) {
      let _q: EventPayload[] = [];
      let timer: NodeJS.Timeout | null = null;
      const flush = async () => {
        const events = _q;
        _q = [];
        timer && clearTimeout(timer);
        timer = null;
        events.length && (await track({ clientKey, events, ingestorHost }));
      };

      let promise: Promise<void> | null = null;
      gb.setEventLogger(async (eventName, properties, userContext) => {
        const data: EventData = {
          eventName,
          properties,
          attributes: userContext.attributes || {},
          url: userContext.url || "",
        };

        // 如果事件被过滤，跳过记录
        if (eventFilter && !eventFilter(data)) {
          return;
        }

        // 对 Feature Evaluated 和 Experiment Viewed 事件进行去重
        if (
          eventName === EVENT_FEATURE_EVALUATED ||
          eventName === EVENT_EXPERIMENT_VIEWED
        ) {
          // 构建去重用的键
          const dedupeKeyData: Record<string, unknown> = {
            eventName,
            properties,
          };
          for (const key of dedupeKeyAttributes) {
            dedupeKeyData["attr:" + key] = data.attributes[key];
          }

          const k = JSON.stringify(dedupeKeyData);
          // 最近已触发过重复事件，移动到 LRU 缓存末尾并跳过
          if (eventCache.has(k)) {
            eventCache.delete(k);
            eventCache.add(k);
            return;
          }
          eventCache.add(k);

          // 如果缓存太大，移除最旧的条目
          if (eventCache.size > dedupeCacheSize) {
            const oldest = eventCache.values().next().value;
            oldest && eventCache.delete(oldest);
          }
        }

        const payload = getEventPayload(data);

        debug &&
          console.log(
              "正在将事件记录到 GrowthBook",
              JSON.parse(JSON.stringify(payload)),
            );
        if (!enable) return;

        _q.push(payload);

        // 一次只能有一个进行中的 promise
        if (!promise) {
          promise = new Promise((resolve, reject) => {
            // 延迟后刷新队列
            timer = setTimeout(() => {
              flush().then(resolve).catch(reject);
              promise = null;
            }, queueFlushInterval);
          });
        }
        await promise;
      });

      // 在页面卸载时刷新队列
      if (typeof document !== "undefined" && document.visibilityState) {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") {
            flush().catch(console.error);
          }
        });
      }

      // 当 growthbook 实例被销毁时刷新队列
      "onDestroy" in gb &&
        gb.onDestroy(() => {
          flush().catch(console.error);
        });
    }

    // 如果在浏览器中，监听 window.gbEvents.push
    // 这使得与 Segment、GTM 等集成的更简单
    if (typeof window !== "undefined" && !("createScopedInstance" in gb)) {
      const prevEvents = Array.isArray(window.gbEvents) ? window.gbEvents : [];
      window.gbEvents = {
        push: (event: GlobalTrackedEvent | string) => {
          if ("isDestroyed" in gb && gb.isDestroyed()) {
            // 如果尝试记录日志时实例已被销毁，切换回普通数组
            // 这将让下一个 GrowthBook 实例能够拾取这些事件
            window.gbEvents = [event];
            return;
          }

          if (typeof event === "string") {
            gb.logEvent(event);
          } else if (event) {
            gb.logEvent(event.eventName, event.properties);
          }
        },
      };
      for (const event of prevEvents) {
        window.gbEvents.push(event);
      }
    }
  };
}

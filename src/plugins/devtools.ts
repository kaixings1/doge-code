/* eslint-disable @typescript-eslint/no-explicit-any */
import { GrowthBook } from "../GrowthBook";
import {
  Attributes,
  FeatureApiResponse,
  LogUnion,
  Plugin,
} from "../types/growthbook";
import { GrowthBookClient, UserScopedGrowthBook } from "../GrowthBookClient";

export type DevtoolsState = {
  attributes?: Record<string, any>;
  features?: Record<string, any>;
  experiments?: Record<string, number>;
};

export interface NextjsReadonlyRequestCookiesCompat {
  get: (name: string) => { name: string; value: string } | undefined;
}
export interface NextjsRequestCompat {
  nextUrl: {
    searchParams: URLSearchParams;
  };
  cookies: {
    get: (name: string) => { name: string; value: string } | undefined;
  };
}
export interface ExpressRequestCompat {
  cookies: Record<string, string | string[]>;
  query: Record<string, string>;
  [key: string]: unknown;
}

function applyDevtoolsState(
  devtoolsState: DevtoolsState,
  gb: GrowthBook | UserScopedGrowthBook,
) {
  // 仅在开发模式下启用
  if (!gb.inDevMode()) {
    return;
  }

  if (
    devtoolsState.attributes &&
    typeof devtoolsState.attributes === "object"
  ) {
    gb.setAttributeOverrides(devtoolsState.attributes);
  }
  if (devtoolsState.features && typeof devtoolsState.features === "object") {
    const map = new Map(Object.entries(devtoolsState.features));
    gb.setForcedFeatures(map);
  }
  if (
    devtoolsState.experiments &&
    typeof devtoolsState.experiments === "object"
  ) {
    gb.setForcedVariations(devtoolsState.experiments);
  }
}

export function devtoolsPlugin(devtoolsState?: DevtoolsState): Plugin {
  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    // 仅适用于用户范围的 GrowthBook 实例
    if ("createScopedInstance" in gb) {
      throw new Error(
            "devtoolsPlugin 只能设置在用户范围的实例上",
          );
    }
    if (devtoolsState) {
      applyDevtoolsState(devtoolsState, gb);
    }
  };
}

/**
 * 适用于 NextJS 环境。
 * 使用服务器组件时，使用 `searchParams` 和 `requestCookies` 字段。
 *  - 注意：在 NextJS 15+ 中，你应先 await 这些值再传递给插件
 * 使用中间件/API 路由时，请提供 `request` 字段。
 */
export function devtoolsNextjsPlugin({
  searchParams,
  requestCookies,
  request,
}: {
  searchParams?: { _gbdebug?: string };
  requestCookies?: NextjsReadonlyRequestCookiesCompat;
  request?: NextjsRequestCompat;
}): Plugin {
  function extractGbDebugPayload({
    searchParams,
    requestCookies,
  }: {
    searchParams?: { _gbdebug?: string } | URLSearchParams;
    requestCookies?: NextjsReadonlyRequestCookiesCompat;
  }): string | undefined {
    if (searchParams) {
      if ("_gbdebug" in searchParams) {
        return searchParams._gbdebug;
      }
      if (searchParams instanceof URLSearchParams) {
        return searchParams.get("_gbdebug") ?? undefined;
      }
    }
    return requestCookies?.get("_gbdebug")?.value;
  }

  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    let payload = extractGbDebugPayload({ searchParams, requestCookies });

    if (!payload && request) {
      payload = extractGbDebugPayload({
        searchParams: request.nextUrl.searchParams,
        requestCookies: request.cookies,
      });
    }

    let state: DevtoolsState = {};
    if (payload) {
      try {
        state = JSON.parse(payload);
      } catch (e) {
        console.error("无法解析 devtools 载荷", e);
      }
    }

    devtoolsPlugin(state)(gb);
  };
}

/**
 * 旨在与 npm 的 'cookie-parser' 包中的 cookieParser() 中间件配合使用。
 */
export function devtoolsExpressPlugin({
  request,
}: {
  request?: ExpressRequestCompat;
}): Plugin {
  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    let payload =
      typeof request?.query?.["_gbdebug"] === "string"
        ? request.query["_gbdebug"]
        : undefined;
    if (!payload) {
      payload =
        typeof request?.cookies?.["_gbdebug"] === "string"
          ? request.cookies["_gbdebug"]
          : undefined;
    }

    let state: DevtoolsState = {};
    if (payload) {
      try {
        state = JSON.parse(payload);
      } catch (e) {
        console.error("无法解析 devtools 载荷", e);
      }
    }

    devtoolsPlugin(state)(gb);
  };
}

export type SdkInfo = {
  apiHost: string;
  clientKey: string;
  source?: string;
  version?: string;
  payload?: FeatureApiResponse;
  attributes?: Attributes;
};
export type LogEvent = {
  logs: LogUnion[];
  sdkInfo?: SdkInfo;
};
/**
 * 获取 DevTools 调试脚本内容的辅助方法
 * @param gb - GrowthBook 实例。必须启用 DevMode 才能查看日志事件。
 * @param {string} [source] - 为这些事件添加标签以便在 DevTools 中阅读
 * @example
 * 一个 React 日志记录器组件（自行实现）：
 ```
  return (
    <script dangerouslySetInnerHTML={{
      __html: getDebugScriptContents(gb, "nextjs")
    }} />
  );
 ```
 */
export function getDebugScriptContents(
  gb: GrowthBook,
  source?: string,
): string {
  const event = getDebugEvent(gb, source);
  if (!event) return "";
  return `(window._gbdebugEvents = (window._gbdebugEvents || [])).push(${JSON.stringify(
    event,
  )});`;
}

export function getDebugEvent(
  gb: GrowthBook | UserScopedGrowthBook,
  source?: string,
): LogEvent | null {
  if (!("logs" in gb)) return null;
  // 仅在开发模式下启用
  if (!gb.inDevMode()) {
    return null;
  }
  if (gb instanceof GrowthBook) {
    // GrowthBook SDK 信息（软件开发工具包）
    const [apiHost, clientKey] = gb.getApiInfo();
    return {
      logs: gb.logs,
      sdkInfo: {
        apiHost,
        clientKey,
        source,
        version: gb.version,
        payload: gb.getDecryptedPayload(),
        attributes: gb.getAttributes(),
      },
    };
  } else if (gb instanceof UserScopedGrowthBook) {
    // UserScopedGrowthBook 的 SDK 信息
    const userContext = gb.getUserContext();
    const [apiHost, clientKey] = gb.getApiInfo();
    return {
      logs: gb.logs,
      sdkInfo: {
        apiHost,
        clientKey,
        source,
        version: gb.getVersion(),
        payload: gb.getDecryptedPayload(),
        attributes: {
          ...userContext.attributes,
          ...userContext.attributeOverrides,
        },
      },
    };
  }
  return null;
}

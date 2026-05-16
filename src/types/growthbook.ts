/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  GrowthBook,
  GrowthBookClient,
  StickyBucketService,
  UserScopedGrowthBook,
} from "..";
import { ConditionInterface, ParentConditionInterface } from "./mongrule";

declare global {
  interface Window {
    _growthbook?: GrowthBook;
  }
}

/** 变体元数据 */
export type VariationMeta = {
  passthrough?: boolean;
  key?: string;
  name?: string;
};

/** 功能规则 */
export type FeatureRule<T = any> = {
  id?: string;
  condition?: ConditionInterface;
  parentConditions?: ParentConditionInterface[];
  force?: T;
  variations?: T[];
  weights?: number[];
  key?: string;
  hashAttribute?: string;
  fallbackAttribute?: string;
  hashVersion?: number;
  disableStickyBucketing?: boolean;
  bucketVersion?: number;
  minBucketVersion?: number;
  range?: VariationRange;
  coverage?: number;
  /** @deprecated */
  namespace?: [string, number, number];
  ranges?: VariationRange[];
  meta?: VariationMeta[];
  filters?: Filter[];
  seed?: string;
  name?: string;
  phase?: string;
  tracks?: Array<{
    experiment: Experiment<T>;
    result: Result<T>;
  }>;
};

/** 功能定义 */
export interface FeatureDefinition<T = any> {
  defaultValue?: T;
  rules?: FeatureRule<T>[];
}

/** 功能结果来源 */
export type FeatureResultSource =
  | "unknownFeature"
  | "defaultValue"
  | "force"
  | "override"
  | "experiment"
  | "prerequisite"
  | "cyclicPrerequisite";

/** 功能评估结果 */
export interface FeatureResult<T = any> {
  value: T | null;
  source: FeatureResultSource;
  on: boolean;
  off: boolean;
  ruleId: string;
  experiment?: Experiment<T>;
  experimentResult?: Result<T>;
}

/** @deprecated 实验状态 */
export type ExperimentStatus = "draft" | "running" | "stopped";

/** URL 匹配类型 */
export type UrlTargetType = "regex" | "simple";

/** URL 匹配规则 */
export type UrlTarget = {
  include: boolean;
  type: UrlTargetType;
  pattern: string;
};

/** 实验定义 */
export type Experiment<T> = {
  key: string;
  variations: [T, T, ...T[]];
  ranges?: VariationRange[];
  meta?: VariationMeta[];
  filters?: Filter[];
  seed?: string;
  name?: string;
  phase?: string;
  urlPatterns?: UrlTarget[];
  weights?: number[];
  condition?: ConditionInterface;
  parentConditions?: ParentConditionInterface[];
  coverage?: number;
  include?: () => boolean;
  /** @deprecated */
  namespace?: [string, number, number];
  force?: number;
  hashAttribute?: string;
  fallbackAttribute?: string;
  hashVersion?: number;
  disableStickyBucketing?: boolean;
  bucketVersion?: number;
  minBucketVersion?: number;
  active?: boolean;
  persistQueryString?: boolean;
  /** @deprecated */
  status?: ExperimentStatus;
  /** @deprecated */
  url?: RegExp;
  /** @deprecated */
  groups?: string[];
};

/** 自动实验变更类型 */
export type AutoExperimentChangeType = "redirect" | "visual" | "unknown";

/** 自动实验 */
export type AutoExperiment<T = AutoExperimentVariation> = Experiment<T> & {
  changeId?: string;
  // If true, require the experiment to be manually triggered
  manual?: boolean;
};

/** 实验覆盖配置 */
export type ExperimentOverride = {
  condition?: ConditionInterface;
  weights?: number[];
  active?: boolean;
  status?: ExperimentStatus;
  force?: number;
  coverage?: number;
  groups?: string[];
  namespace?: [string, number, number];
  url?: RegExp | string;
};

/** 实验结果 */
export interface Result<T> {
  value: T;
  variationId: number;
  key: string;
  name?: string;
  bucket?: number;
  passthrough?: boolean;
  inExperiment: boolean;
  hashUsed?: boolean;
  hashAttribute: string;
  hashValue: string;
  featureId: string | null;
  stickyBucketUsed?: boolean;
}

/** 属性集合 */
export type Attributes = Record<string, any>;

/** 跟踪数据 */
export interface TrackingData {
  experiment: Experiment<any>;
  result: Result<any>;
}

/** 包含用户信息的跟踪数据 */
export interface TrackingDataWithUser {
  experiment: Experiment<any>;
  result: Result<any>;
  user: UserContext;
}

/** 跟踪回调函数 */
export type TrackingCallback = (
  experiment: Experiment<any>,
  result: Result<any>,
) => Promise<void> | void;

/** 包含用户信息的跟踪回调函数 */
export type TrackingCallbackWithUser = (
  experiment: Experiment<any>,
  result: Result<any>,
  user: UserContext,
) => Promise<void> | void;

/** 功能使用回调 */
export type FeatureUsageCallback = (
  key: string,
  result: FeatureResult<any>,
) => void;

/** 包含用户信息的功能使用回调 */
export type FeatureUsageCallbackWithUser = (
  key: string,
  result: FeatureResult<any>,
  user: UserContext,
) => void;

/** 插件函数 */
export type Plugin = (
  gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient,
) => void;

/** 事件属性 */
export type EventProperties = Record<string, unknown>;
/** 事件记录器 */
export type EventLogger = (
  eventName: string,
  properties: EventProperties,
  userContext: UserContext,
) => void | Promise<void>;

/** 导航回调函数 */
export type NavigateCallback = (url: string) => void | Promise<void>;

/** DOM 变更应用回调 */
export type ApplyDomChangesCallback = (
  changes: AutoExperimentVariation,
) => () => void;

/** 渲染函数 */
export type RenderFunction = () => void;

// ============ 构造器选项 ============
/** GrowthBook 初始化选项 */
export type Options = {
  enabled?: boolean;
  attributes?: Attributes;
  url?: string;
  features?: Record<string, FeatureDefinition>;
  experiments?: AutoExperiment[];
  forcedVariations?: Record<string, number>;
  forcedFeatureValues?: Map<string, any>;
  attributeOverrides?: Attributes;
  blockedChangeIds?: string[];
  disableVisualExperiments?: boolean;
  disableJsInjection?: boolean;
  jsInjectionNonce?: string;
  disableUrlRedirectExperiments?: boolean;
  disableCrossOriginUrlRedirectExperiments?: boolean;
  disableExperimentsOnLoad?: boolean;
  stickyBucketAssignmentDocs?: Record<
    StickyAttributeKey,
    StickyAssignmentsDocument
  >;
  stickyBucketService?: StickyBucketService;
  debug?: boolean;
  log?: (msg: string, ctx: any) => void;
  qaMode?: boolean;
  /** @deprecated */
  backgroundSync?: boolean;
  /** @deprecated */
  subscribeToChanges?: boolean;
  enableDevMode?: boolean;
  disableCache?: boolean;
  /** @deprecated */
  disableDevTools?: boolean;
  trackingCallback?: TrackingCallback;
  onFeatureUsage?: FeatureUsageCallback;
  eventLogger?: EventLogger;
  cacheKeyAttributes?: (keyof Attributes)[];
  /** @deprecated */
  user?: {
    id?: string;
    anonId?: string;
    [key: string]: string | undefined;
  };
  /** @deprecated */
  overrides?: Record<string, ExperimentOverride>;
  /** @deprecated */
  groups?: Record<string, boolean>;
  apiHost?: string;
  streamingHost?: string;
  apiHostRequestHeaders?: Record<string, string>;
  streamingHostRequestHeaders?: Record<string, string>;
  clientKey?: string;
  renderer?: null | RenderFunction;
  decryptionKey?: string;
  remoteEval?: boolean;
  navigate?: NavigateCallback;
  navigateDelay?: number;
  maxNavigateDelay?: number;
  /** @deprecated */
  antiFlicker?: boolean;
  /** @deprecated */
  antiFlickerTimeout?: number;
  applyDomChangesCallback?: ApplyDomChangesCallback;
  savedGroups?: SavedGroupsValues;
  plugins?: Plugin[];
};

/** GrowthBook 客户端选项 */
export type ClientOptions = {
  enabled?: boolean;
  debug?: boolean;
  globalAttributes?: Attributes;
  forcedVariations?: Record<string, number>;
  forcedFeatureValues?: Map<string, any>;
  log?: (msg: string, ctx: any) => void;
  qaMode?: boolean;
  disableCache?: boolean;
  trackingCallback?: TrackingCallbackWithUser;
  onFeatureUsage?: (
    key: string,
    result: FeatureResult<any>,
    user: UserContext,
  ) => void;
  eventLogger?: EventLogger;
  apiHost?: string;
  streamingHost?: string;
  apiHostRequestHeaders?: Record<string, string>;
  streamingHostRequestHeaders?: Record<string, string>;
  clientKey?: string;
  decryptionKey?: string;
  savedGroups?: SavedGroupsValues;
  plugins?: Plugin[];
};

// Contexts
/** 全局评估上下文 */
export type GlobalContext = {
  log: (msg: string, ctx: any) => void;
  features?: FeatureDefinitions;
  experiments?: AutoExperiment[];
  enabled?: boolean;
  qaMode?: boolean;
  savedGroups?: SavedGroupsValues;
  forcedVariations?: Record<string, number>;
  forcedFeatureValues?: Map<string, any>;
  trackingCallback?: TrackingCallbackWithUser;
  onFeatureUsage?: FeatureUsageCallbackWithUser;
  onExperimentEval?: (experiment: Experiment<any>, result: Result<any>) => void;
  saveDeferredTrack?: (data: TrackingData) => void;
  recordChangeId?: (changeId: string) => void;
  eventLogger?: EventLogger;

  /** @deprecated */
  overrides?: Record<string, ExperimentOverride>;
  /** @deprecated */
  groups?: Record<string, boolean>;
  /** @deprecated */
  user?: {
    id?: string;
    anonId?: string;
    [key: string]: string | undefined;
  };
};

// Some global fields can be overridden by the user, others are always user-level
/** 用户上下文 */
export type UserContext = {
  enabled?: boolean;
  qaMode?: boolean;
  enableDevMode?: boolean;
  attributes?: Attributes;
  url?: string;
  blockedChangeIds?: string[];
  stickyBucketAssignmentDocs?: Record<
    StickyAttributeKey,
    StickyAssignmentsDocument
  >;
  saveStickyBucketAssignmentDoc?: (
    doc: StickyAssignmentsDocument,
  ) => Promise<unknown>;
  forcedVariations?: Record<string, number>;
  forcedFeatureValues?: Map<string, any>;
  attributeOverrides?: Attributes;
  trackingCallback?: TrackingCallback;
  onFeatureUsage?: FeatureUsageCallback;
  trackedExperiments?: Set<string>;
  trackedFeatureUsage?: Record<string, string>;
  devLogs?: LogUnion[];
};

/** 栈上下文 */
export type StackContext = {
  id?: string;
  evaluatedFeatures: Set<string>;
};

/** 评估上下文 */
export type EvalContext = {
  global: GlobalContext;
  user: UserContext;
  stack: StackContext;
};

/** 预取选项 */
export type PrefetchOptions = Pick<
  Options,
  | "decryptionKey"
  | "apiHost"
  | "apiHostRequestHeaders"
  | "streamingHost"
  | "streamingHostRequestHeaders"
> & {
  clientKey: string;
  streaming?: boolean;
  skipCache?: boolean;
};

/** 订阅函数 */
export type SubscriptionFunction = (
  experiment: Experiment<any>,
  result: Result<any>,
) => void;

/** 变体范围 [开始, 结束] */
export type VariationRange = [number, number];

/** 初始化响应 */
export interface InitResponse {
  // 是否设置了有效负载
  success: boolean;
  // 有效负载的来源
  source: "init" | "cache" | "network" | "error" | "timeout";
  // 若有效负载未设置（success = false），此处包含错误信息
  error?: Error;
}

/** 获取功能数据响应 */
export interface FetchResponse {
  /** 功能 API 响应数据 */
  data: FeatureApiResponse | null;
  /** 是否成功 */
  success: boolean;
  /** 数据来源 */
  source: "cache" | "network" | "error" | "timeout";
  error?: Error;
}

/** JSON 兼容的值类型 */
export type JSONValue =
  | null
  | number
  | string
  | boolean
  | Array<JSONValue>
  | Record<string, unknown>
  | { [key: string]: JSONValue };

/** 将原始类型展开为其宽泛类型 */
export type WidenPrimitives<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

/** DOM 变更操作 */
export type DOMMutation = {
  selector: string;
  action: string;
  attribute: string;
  value?: string;
  parentSelector?: string;
  insertBeforeSelector?: string;
};

/** 自动实验变体（视觉/重定向变更） */
export type AutoExperimentVariation = {
  domMutations?: DOMMutation[];
  css?: string;
  js?: string;
  urlRedirect?: string;
};

/** 功能定义集合 */
export type FeatureDefinitions = Record<string, FeatureDefinition>;

/** 功能 API 响应数据格式 */
export type FeatureApiResponse = {
  /** 功能定义集合 */
  features?: FeatureDefinitions;
  /** 最后更新日期 */
  dateUpdated?: string;
  /** 加密的功能数据 */
  encryptedFeatures?: string;
  /** 自动实验列表 */
  experiments?: AutoExperiment[];
  /** 加密的实验数据 */
  encryptedExperiments?: string;
  /** 已保存的分组 */
  savedGroups?: SavedGroupsValues;
  /** 加密的已保存分组 */
  encryptedSavedGroups?: string;
};

// 功能 API 响应的别名
export type GrowthBookPayload = FeatureApiResponse;

/** 非标准浏览器环境所需的 Polyfill（ReactNative、Node 等）
 * 由于 node-fetch 等与原生类型不完全兼容，类型化为 `any` */
export type Polyfills = {
  fetch: any;

  SubtleCrypto: any;

  EventSource: any;
  localStorage?: LocalStorageCompat;
};

/** 内部辅助函数类型 */
export type Helpers = {
  fetchFeaturesCall: ({
    host,
    clientKey,
    headers,
  }: {
    host: string;
    clientKey: string;
    headers?: Record<string, string>;
  }) => Promise<Response>;
  fetchRemoteEvalCall: ({
    host,
    clientKey,
    payload,
    headers,
  }: {
    host: string;
    clientKey: string;

    payload: any;
    headers?: Record<string, string>;
  }) => Promise<Response>;
  eventSourceCall: ({
    host,
    clientKey,
    headers,
  }: {
    host: string;
    clientKey: string;
    headers?: Record<string, string>;
  }) => EventSource;
  startIdleListener: () => (() => void) | void;
  stopIdleListener: () => void;
};

/** LocalStorage 的兼容接口 */
export interface LocalStorageCompat {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/** 缓存设置 */
export type CacheSettings = {
  /** 是否启用后台同步 */
  backgroundSync: boolean;
  /** 缓存键 */
  cacheKey: string;
  /** 过期 TTL */
  staleTTL: number;
  /** 最大缓存时间 */
  maxAge: number;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 是否禁用空闲流 */
  disableIdleStreams: boolean;
  /** 空闲流间隔 */
  idleStreamInterval: number;
  /** 是否禁用缓存 */
  disableCache: boolean;
};

/** API 主机地址 */
export type ApiHost = string;
/** 客户端密钥 */
export type ClientKey = string;

/** 初始化选项 */
export type InitOptions = {
  timeout?: number;
  skipCache?: boolean;
  payload?: FeatureApiResponse;
  streaming?: boolean;
  cacheSettings?: CacheSettings;
};

/** 同步初始化选项 */
export type InitSyncOptions = {
  payload: FeatureApiResponse;
  streaming?: boolean;
};

/** 加载功能选项 */
export type LoadFeaturesOptions = {
  /** @deprecated */
  autoRefresh?: boolean;
  timeout?: number;
  skipCache?: boolean;
};

/** 刷新功能选项 */
export type RefreshFeaturesOptions = {
  timeout?: number;
  skipCache?: boolean;
};

/** 销毁选项 */
export type DestroyOptions = {
  destroyAllStreams?: boolean;
};

/** 过滤器配置 */
export interface Filter {
  /** 覆盖用于此过滤器的 hashAttribute */
  attribute?: string;
  /** 哈希种子 */
  seed: string;
  /** 使用的哈希版本 */
  hashVersion: number;
  /** 仅包含这些结果范围 */
  ranges: VariationRange[];
}

/** 粘性属性键 */
export type StickyAttributeKey = string; // `${attributeName}||${attributeValue}`
/** 粘性实验键 */
export type StickyExperimentKey = string; // `${experimentId}__{version}`
/** 粘性分配记录 */
export type StickyAssignments = Record<StickyExperimentKey, string>;
/** 粘性分配文档 */
export interface StickyAssignmentsDocument {
  attributeName: string;
  attributeValue: string;
  assignments: StickyAssignments;
}

/** 已保存的分组值 */
export type SavedGroupsValues = Record<string, (string | number)[]>;

/** 日志基类 */
export type BaseLog = {
  timestamp: string;
};

/** 事件日志 */
export type EventLog = BaseLog & {
  logType: "event";
  eventName: string;
  properties?: Record<string, unknown>;
};
/** 实验日志 */
export type ExperimentLog<T> = BaseLog & {
  logType: "experiment";
  experiment: Experiment<T>;
  result: Result<T>;
};
/** 功能日志 */
export type FeatureLog = BaseLog & {
  logType: "feature";
  featureKey: string;
  result: FeatureResult;
};

/** 日志联合类型 */
export type LogUnion = EventLog | ExperimentLog<any> | FeatureLog;

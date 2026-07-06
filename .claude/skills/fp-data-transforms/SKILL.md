---
name: fp-data-transforms
description: "实用的 TypeScript 数据转换模式：数组操作、对象重塑、API 响应归一化、分组聚合和空安全嵌套值访问。"
risk: unknown
source: community
version: 1.0.0
author: Claude
tags:
  - functional-programming
  - typescript
  - data-transformation
  - fp-ts
  - arrays
  - objects
  - grouping
  - aggregation
  - null-safety
---

# 实用数据转换

本技能涵盖您每天使用的数据转换：处理数组、重塑对象、归一化 API 响应、分组数据和安全访问嵌套值。每个章节先展示命令式方法，然后是函数式等价方法，并诚实评估每种方法何时更优。

## 何时使用
- 需要在 TypeScript 中转换数组、对象、分组数据或嵌套值。
- 任务涉及重塑 API 响应、空安全访问、聚合或归一化。
- 您希望为日常数据处理工作提供实用的函数式模式，而非底层循环。

---

## 目录

1. [数组操作](#1-数组操作)
2. [对象转换](#2-对象转换)
3. [数据归一化](#3-数据归一化)
4. [分组与聚合](#4-分组与聚合)
5. [空安全访问](#5-空安全访问)
6. [真实示例](#6-真实示例)
7. [何时使用什么](#7-何时使用什么)

---

## 1. 数组操作

数组操作是数据转换的核心。让我们用表达力强、可链式调用的操作替换冗长的循环。

### Map：转换每个元素

**The Task**: Convert an array of prices from cents to dollars.

#### Imperative 方法

```typescript
const pricesInCents = [999, 1499, 2999, 4999];

function convertToDollars(prices: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    result.push(prices[i] / 100);
  }
  return result;
}

const dollars = convertToDollars(pricesInCents);
// [9.99, 14.99, 29.99, 49.99]
```

#### Functional 方法

```typescript
const pricesInCents = [999, 1499, 2999, 4999];

const toDollars = (cents: number): number => cents / 100;

const dollars = pricesInCents.map(toDollars);
// [9.99, 14.99, 29.99, 49.99]
```

**Why functional is better here**: The intent is immediately clear. `map` says "transform each element." The transformation logic (`toDollars`) is named and reusable. No index management, no manual array building.

### 过滤器：保留匹配项

**The Task**: Get all active users from a list.

#### Imperative 方法

```typescript
interface User {
  id: string;
  name: string;
  isActive: boolean;
}

function getActiveUsers(users: User[]): User[] {
  const result: User[] = [];
  for (const user of users) {
    if (user.isActive) {
      result.push(user);
    }
  }
  return result;
}
```

#### Functional 方法

```typescript
const isActive = (user: User): boolean => user.isActive;

const activeUsers = users.过滤器(isActive);

// Or inline for simple predicates
const activeUsers = users.过滤器(user => user.isActive);
```

**Why functional is better here**: The predicate (`isActive`) is separated from the iteration logic. You can reuse, test, and compose predicates independently.

### Reduce：聚合成新内容

**The Task**: Calculate the total price of items in a cart.

#### Imperative 方法

```typescript
interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

function calculateTotal(items: CartItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}
```

#### Functional 方法

```typescript
const calculateTotal = (items: CartItem[]): number =>
  items.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

// Or break out the line total calculation
const lineTotal = (item: CartItem): number => item.price * item.quantity;

const calculateTotal = (items: CartItem[]): number =>
  items.map(lineTotal).reduce((a, b) => a + b, 0);
```

**Honest assessment**: For simple sums, the imperative loop is actually quite readable. The functional version shines when you need to compose the accumulation with other transformations, or when the reduction logic is complex enough to benefit from being named.

### 链式调用：组合操作

**The Task**: Get the names of all active premium users, sorted alphabetically.

#### Imperative 方法

```typescript
interface User {
  id: string;
  name: string;
  isActive: boolean;
  tier: 'free' | 'premium';
}

function getActivePremiumNames(users: User[]): string[] {
  const result: string[] = [];
  for (const user of users) {
    if (user.isActive && user.tier === 'premium') {
      result.push(user.name);
    }
  }
  result.sort((a, b) => a.localeCompare(b));
  return result;
}
```

#### Functional 方法

```typescript
const getActivePremiumNames = (users: User[]): string[] =>
  users
    .过滤器(user => user.isActive)
    .过滤器(user => user.tier === 'premium')
    .map(user => user.name)
    .sort((a, b) => a.localeCompare(b));

// Or with named predicates for reuse
const isActive = (user: User): boolean => user.isActive;
const isPremium = (user: User): boolean => user.tier === 'premium';
const getName = (user: User): string => user.name;
const alphabetically = (a: string, b: string): number => a.localeCompare(b);

const getActivePremiumNames = (users: User[]): string[] =>
  users
    .过滤器(isActive)
    .过滤器(isPremium)
    .map(getName)
    .sort(alphabetically);
```

**Why functional is better here**: Each step in the chain has a single responsibility. You can read the transformation as a series of steps: "过滤器 active, 过滤器 premium, get names, sort." Adding or removing a step is trivial.

### 使用 fp-ts 数组模块

fp-ts provides additional array utilities with better composition support:

```typescript
import * as A from 'fp-ts/Array';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

// Safe head (first element)
const first = pipe(
  [1, 2, 3],
  A.head
); // Some(1)

const firstOfEmpty = pipe(
  [] as number[],
  A.head
); // None

// Safe lookup by index
const third = pipe(
  ['a', 'b', 'c', 'd'],
  A.lookup(2)
); // Some('c')

// Find with predicate
const found = pipe(
  users,
  A.findFirst(user => user.id === 'abc123')
); // Option<User>

// Partition into two groups
const [inactive, active] = pipe(
  users,
  A.partition(user => user.isActive)
);

// Take first N elements
const topThree = pipe(
  sortedScores,
  A.takeLeft(3)
);

// Unique values
const uniqueTags = pipe(
  allTags,
  A.uniq({ equals: (a, b) => a === b })
);
```

---

## 2. 对象转换

Objects need reshaping constantly: picking fields, omitting sensitive data, merging settings, and updating nested values.

### Pick：选择特定字段

**The Task**: Extract only the public fields from a user object.

#### Imperative 方法

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  internalNotes: string;
}

function getPublicUser(user: User): { id: string; name: string; email: string } {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}
```

#### Functional 方法

```typescript
// Generic pick utility
const pick = <T extends object, K extends keyof T>(
  keys: K[]
) => (obj: T): Pick<T, K> =>
  keys.reduce(
    (result, key) => {
      result[key] = obj[key];
      return result;
    },
    {} as Pick<T, K>
  );

const getPublicUser = pick<User, 'id' | 'name' | 'email'>(['id', 'name', 'email']);

const publicUser = getPublicUser(user);
```

**Why functional is better here**: The `pick` utility is reusable across your codebase. Type safety ensures you can only pick keys that exist.

### Omit：移除特定字段

**The Task**: Remove sensitive fields before logging.

#### Imperative 方法

```typescript
function sanitizeForLogging(user: User): Omit<User, 'passwordHash' | 'internalNotes'> {
  const { passwordHash, internalNotes, ...safe } = user;
  return safe;
}
```

#### Functional 方法

```typescript
// Generic omit utility
const omit = <T extends object, K extends keyof T>(
  keys: K[]
) => (obj: T): Omit<T, K> => {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
};

const sanitizeForLogging = omit<User, 'passwordHash' | 'internalNotes'>([
  'passwordHash',
  'internalNotes',
]);
```

**Honest assessment**: For one-off omits, destructuring (the imperative 方法) is perfectly fine and very readable. The functional `omit` utility pays off when you have many such transformations or need to compose them.

### Merge：合并对象

**The Task**: Merge user settings with defaults.

#### Imperative 方法

```typescript
interface Settings {
  theme: 'light' | 'dark';
  fontSize: number;
  notifications: boolean;
  language: string;
}

function mergeSettings(
  defaults: Settings,
  userSettings: Partial<Settings>
): Settings {
  return {
    theme: userSettings.theme !== undefined ? userSettings.theme : defaults.theme,
    fontSize: userSettings.fontSize !== undefined ? userSettings.fontSize : defaults.fontSize,
    notifications: userSettings.notifications !== undefined
      ? userSettings.notifications
      : defaults.notifications,
    language: userSettings.language !== undefined ? userSettings.language : defaults.language,
  };
}
```

#### Functional 方法

```typescript
const mergeSettings = (
  defaults: Settings,
  userSettings: Partial<Settings>
): Settings => ({
  ...defaults,
  ...userSettings,
});

// Usage
const defaults: Settings = {
  theme: 'light',
  fontSize: 14,
  notifications: true,
  language: 'en',
};

const userPrefs: Partial<Settings> = {
  theme: 'dark',
  fontSize: 16,
};

const finalSettings = mergeSettings(defaults, userPrefs);
// { theme: 'dark', fontSize: 16, notifications: true, language: 'en' }
```

**Why functional is better here**: Spread syntax is concise and handles any number of keys. Later spreads override earlier ones, giving you natural "defaults with overrides" behavior.

### 深合并：嵌套对象组合

**The Task**: Merge nested 配置 objects.

#### Imperative 方法

```typescript
interface Config {
  api: {
    baseUrl: string;
    timeout: number;
    retries: number;
  };
  ui: {
    theme: string;
    animations: boolean;
  };
}

function deepMerge(
  target: Config,
  source: Partial<Config>
): Config {
  const result = { ...target };

  if (source.api) {
    result.api = { ...target.api, ...source.api };
  }
  if (source.ui) {
    result.ui = { ...target.ui, ...source.ui };
  }

  return result;
}
```

#### Functional 方法

```typescript
// Generic deep merge for one level of nesting
const deepMerge = <T extends Record<string, object>>(
  target: T,
  source: { [K in keyof T]?: Partial<T[K]> }
): T => {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    if (source[key] !== undefined) {
      result[key] = { ...target[key], ...source[key] };
    }
  }

  return result;
};

// Usage
const defaultConfig: Config = {
  api: { baseUrl: 'https://api.example.com', timeout: 5000, retries: 3 },
  ui: { theme: 'light', animations: true },
};

const customConfig = deepMerge(defaultConfig, {
  api: { timeout: 10000 },
  ui: { theme: 'dark' },
});
// api.baseUrl preserved, api.timeout overridden
// ui.theme overridden, ui.animations preserved
```

### 不可变更新：更改嵌套值

**The Task**: Update a deeply nested value without mutation.

#### Imperative (Mutating) 方法

```typescript
interface State {
  user: {
    profile: {
      settings: {
        theme: string;
      };
    };
  };
}

function updateTheme(state: State, newTheme: string): void {
  state.user.profile.settings.theme = newTheme; // Mutation!
}
```

#### Functional (Immutable) 方法

```typescript
// Manual spread nesting
const updateTheme = (state: State, newTheme: string): State => ({
  ...state,
  user: {
    ...state.user,
    profile: {
      ...state.user.profile,
      settings: {
        ...state.user.profile.settings,
        theme: newTheme,
      },
    },
  },
});

// With a lens-like helper
const updatePath = <T, V>(
  obj: T,
  path: string[],
  value: V
): T => {
  if (path.length === 0) return value as unknown as T;

  const [head, ...rest] = path;
  return {
    ...obj,
    [head]: updatePath((obj as Record<string, unknown>)[head], rest, value),
  } as T;
};

const newState = updatePath(state, ['user', 'profile', 'settings', 'theme'], 'dark');
```

**Honest assessment**: The spread nesting is verbose but explicit. For deeply nested updates, consider using a library like `immer` or fp-ts lenses. The verbosity of the functional 方法 is the price of immutability.

---

## 3. 数据归一化

API 响应很少与应用需要的形状匹配。归一化将嵌套的非规范化数据转换为扁平的索引结构。

### API 响应到应用状态

**The Task**: Transform a nested API 响应 into a normalized state.

#### API 响应 (What You Get)

```typescript
interface ApiResponse {
  orders: Array<{
    id: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    status: string;
  }>;
}
```

#### App State (What You Need)

```typescript
interface NormalizedState {
  orders: {
    byId: Record<string, Order>;
    allIds: string[];
  };
  customers: {
    byId: Record<string, Customer>;
    allIds: string[];
  };
  products: {
    byId: Record<string, Product>;
    allIds: string[];
  };
}

interface Order {
  id: string;
  customerId: string;
  itemIds: string[];
  total: number;
  status: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
}
```

#### Imperative 方法

```typescript
function normalizeApiResponse(响应: ApiResponse): NormalizedState {
  const state: NormalizedState = {
    orders: { byId: {}, allIds: [] },
    customers: { byId: {}, allIds: [] },
    products: { byId: {}, allIds: [] },
  };

  for (const order of 响应.orders) {
    // Extract customer
    if (!state.customers.byId[order.customerId]) {
      state.customers.byId[order.customerId] = {
        id: order.customerId,
        name: order.customerName,
        email: order.customerEmail,
      };
      state.customers.allIds.push(order.customerId);
    }

    // Extract products and build item IDs
    const itemIds: string[] = [];
    for (const item of order.items) {
      if (!state.products.byId[item.productId]) {
        state.products.byId[item.productId] = {
          id: item.productId,
          name: item.productName,
          price: item.price,
        };
        state.products.allIds.push(item.productId);
      }
      itemIds.push(item.productId);
    }

    // Add normalized order
    state.orders.byId[order.id] = {
      id: order.id,
      customerId: order.customerId,
      itemIds,
      total: order.total,
      status: order.status,
    };
    state.orders.allIds.push(order.id);
  }

  return state;
}
```

#### Functional 方法

```typescript
import { pipe } from 'fp-ts/function';
import * as A from 'fp-ts/Array';
import * as R from 'fp-ts/Record';

// Helper to create normalized collection
interface NormalizedCollection<T extends { id: string }> {
  byId: Record<string, T>;
  allIds: string[];
}

const createNormalizedCollection = <T extends { id: string }>(
  items: T[]
): NormalizedCollection<T> => ({
  byId: pipe(
    items,
    A.reduce({} as Record<string, T>, (acc, item) => ({
      ...acc,
      [item.id]: item,
    }))
  ),
  allIds: items.map(item => item.id),
});

// Extract entities
const extractCustomers = (orders: ApiResponse['orders']): Customer[] =>
  pipe(
    orders,
    A.map(order => ({
      id: order.customerId,
      name: order.customerName,
      email: order.customerEmail,
    })),
    A.uniq({ equals: (a, b) => a.id === b.id })
  );

const extractProducts = (orders: ApiResponse['orders']): Product[] =>
  pipe(
    orders,
    A.flatMap(order => order.items),
    A.map(item => ({
      id: item.productId,
      name: item.productName,
      price: item.price,
    })),
    A.uniq({ equals: (a, b) => a.id === b.id })
  );

const extractOrders = (orders: ApiResponse['orders']): Order[] =>
  orders.map(order => ({
    id: order.id,
    customerId: order.customerId,
    itemIds: order.items.map(item => item.productId),
    total: order.total,
    status: order.status,
  }));

// Compose into final normalization
const normalizeApiResponse = (响应: ApiResponse): NormalizedState => ({
  orders: createNormalizedCollection(extractOrders(响应.orders)),
  customers: createNormalizedCollection(extractCustomers(响应.orders)),
  products: createNormalizedCollection(extractProducts(响应.orders)),
});
```

**Why functional is better here**: Each extraction is independent and testable. The `createNormalizedCollection` helper is reusable. Adding a new entity type means adding one new extraction function.

### 转换 API 响应为 UI 就绪数据

**The Task**: Convert API data to what your components need.

```typescript
// API gives you this
interface ApiUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email_address: string;
  created_at: string; // ISO string
  avatar_url: string | null;
}

// Components need this
interface DisplayUser {
  id: string;
  fullName: string;
  email: string;
  memberSince: string; // "Jan 2024"
  avatarUrl: string; // With fallback
}
```

#### Functional 方法

```typescript
const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const DEFAULT_AVATAR = 'https://example.com/default-avatar.png';

const toDisplayUser = (apiUser: ApiUser): DisplayUser => ({
  id: apiUser.user_id,
  fullName: `${apiUser.first_name} ${apiUser.last_name}`,
  email: apiUser.email_address,
  memberSince: formatDate(apiUser.created_at),
  avatarUrl: apiUser.avatar_url ?? DEFAULT_AVATAR,
});

// Transform array of users
const toDisplayUsers = (apiUsers: ApiUser[]): DisplayUser[] =>
  apiUsers.map(toDisplayUser);
```

---

## 4. 分组与聚合

分组和聚合数据对于报告、仪表板和分析至关重要。

### GroupBy：按键组织

**The Task**: Group orders by customer.

#### Imperative 方法

```typescript
interface Order {
  id: string;
  customerId: string;
  total: number;
  date: string;
}

function groupByCustomer(orders: Order[]): Record<string, Order[]> {
  const result: Record<string, Order[]> = {};

  for (const order of orders) {
    if (!result[order.customerId]) {
      result[order.customerId] = [];
    }
    result[order.customerId].push(order);
  }

  return result;
}
```

#### Functional 方法

```typescript
// Generic groupBy utility
const groupBy = <T, K extends string | number>(
  getKey: (item: T) => K
) => (items: T[]): Record<K, T[]> =>
  items.reduce(
    (groups, item) => {
      const key = getKey(item);
      return {
        ...groups,
        [key]: [...(groups[key] || []), item],
      };
    },
    {} as Record<K, T[]>
  );

// Usage
const groupByCustomer = groupBy<Order, string>(order => order.customerId);
const ordersByCustomer = groupByCustomer(orders);

// Or inline
const ordersByStatus = groupBy((order: Order) => order.status)(orders);
```

**Using fp-ts NonEmptyArray.groupBy**:

```typescript
import * as NEA from 'fp-ts/NonEmptyArray';
import { pipe } from 'fp-ts/function';

// NEA.groupBy guarantees non-empty arrays in result
const ordersByCustomer = pipe(
  orders as NEA.NonEmptyArray<Order>, // Must be non-empty
  NEA.groupBy(order => order.customerId)
); // Record<string, NonEmptyArray<Order>>
```

### CountBy：计数出现次数

**The Task**: Count orders by status.

#### Imperative 方法

```typescript
function countByStatus(orders: Order[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const order of orders) {
    counts[order.status] = (counts[order.status] || 0) + 1;
  }

  return counts;
}
```

#### Functional 方法

```typescript
// Generic countBy utility
const countBy = <T, K extends string>(
  getKey: (item: T) => K
) => (items: T[]): Record<K, number> =>
  items.reduce(
    (counts, item) => {
      const key = getKey(item);
      return {
        ...counts,
        [key]: (counts[key] || 0) + 1,
      };
    },
    {} as Record<K, number>
  );

// Usage
const orderCountByStatus = countBy((order: Order) => order.status)(orders);
// { pending: 5, shipped: 12, delivered: 8 }
```

### SumBy：聚合数值

**The Task**: Calculate total revenue per product category.

#### Imperative 方法

```typescript
interface Sale {
  productId: string;
  category: string;
  amount: number;
}

function sumByCategory(sales: Sale[]): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const sale of sales) {
    totals[sale.category] = (totals[sale.category] || 0) + sale.amount;
  }

  return totals;
}
```

#### Functional 方法

```typescript
// Generic sumBy utility
const sumBy = <T, K extends string>(
  getKey: (item: T) => K,
  getValue: (item: T) => number
) => (items: T[]): Record<K, number> =>
  items.reduce(
    (totals, item) => {
      const key = getKey(item);
      return {
        ...totals,
        [key]: (totals[key] || 0) + getValue(item),
      };
    },
    {} as Record<K, number>
  );

// Usage
const revenueByCategory = sumBy(
  (sale: Sale) => sale.category,
  (sale: Sale) => sale.amount
)(sales);
// { electronics: 15000, clothing: 8500, books: 3200 }
```

### 复杂聚合示例

**The Task**: Calculate totals from line items with quantity and unit price.

```typescript
interface LineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface Invoice {
  id: string;
  lineItems: LineItem[];
  taxRate: number;
}
```

#### Functional 方法

```typescript
const lineTotal = (item: LineItem): number =>
  item.quantity * item.unitPrice;

const subtotal = (items: LineItem[]): number =>
  items.reduce((sum, item) => sum + lineTotal(item), 0);

const calculateTax = (amount: number, rate: number): number =>
  amount * rate;

const calculateInvoiceTotal = (invoice: Invoice): {
  subtotal: number;
  tax: number;
  total: number;
} => {
  const sub = subtotal(invoice.lineItems);
  const tax = calculateTax(sub, invoice.taxRate);

  return {
    subtotal: sub,
    tax,
    total: sub + tax,
  };
};

// With fp-ts pipe for clarity
import { pipe } from 'fp-ts/function';

const calculateInvoiceTotal = (invoice: Invoice) => {
  const sub = pipe(
    invoice.lineItems,
    A.map(lineTotal),
    A.reduce(0, (a, b) => a + b)
  );

  return {
    subtotal: sub,
    tax: sub * invoice.taxRate,
    total: sub * (1 + invoice.taxRate),
  };
};
```

---

## 5. 空安全访问

停止编写 `if (x && x.y && x.y.z)`。安全地导航嵌套结构，无运行时错误。

### 问题

```typescript
interface Config {
  database?: {
    connection?: {
      host?: string;
      port?: number;
    };
    pool?: {
      max?: number;
    };
  };
  features?: {
    experimental?: {
      enabled?: boolean;
    };
  };
}
```

#### Imperative (Verbose) 方法

```typescript
function getDatabaseHost(config: Config): string {
  if (
    config.database &&
    config.database.connection &&
    config.database.connection.host
  ) {
    return config.database.connection.host;
  }
  return 'localhost';
}
```

#### 可选 Chaining (Modern TypeScript)

```typescript
const getDatabaseHost = (config: Config): string =>
  config.database?.connection?.host ?? 'localhost';
```

**Honest assessment**: For simple access patterns, optional chaining (`?.`) is perfect. It's built into the language and very readable. Use fp-ts Option when you need to compose operations on potentially missing values.

### 何时改用 Option

Use fp-ts Option when:
- You need to chain multiple operations on potentially missing values
- You want to distinguish "missing" from other falsy values
- You're building a pipeline of transformations

```typescript
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

// Safe property access that returns Option
const prop = <T, K extends keyof T>(key: K) =>
  (obj: T | null | undefined): O.Option<T[K]> =>
    obj != null && key in obj
      ? O.some(obj[key] as T[K])
      : O.none;

// Chain accesses with flatMap
const getDatabaseHost = (config: Config): O.Option<string> =>
  pipe(
    O.some(config),
    O.flatMap(prop('database')),
    O.flatMap(prop('connection')),
    O.flatMap(prop('host'))
  );

// Extract with default
const host = pipe(
  getDatabaseHost(config),
  O.getOrElse(() => 'localhost')
);
```

### 安全的数组访问

```typescript
import * as A from 'fp-ts/Array';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

// Imperative: throws if array is empty
const first = items[0]; // Could be undefined!

// Safe: returns Option
const first = A.head(items); // Option<Item>

// Get first item's name, or default
const firstName = pipe(
  items,
  A.head,
  O.map(item => item.name),
  O.getOrElse(() => 'No items')
);

// Safe lookup by index
const third = pipe(
  items,
  A.lookup(2),
  O.map(item => item.name),
  O.getOrElse(() => 'Not found')
);
```

### 安全的记录/字典访问

```typescript
import * as R from 'fp-ts/Record';
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

const users: Record<string, User> = {
  'user-1': { name: 'Alice', email: 'alice@example.com' },
  'user-2': { name: 'Bob', email: 'bob@example.com' },
};

// Imperative: could be undefined
const user = users['user-3']; // User | undefined

// Safe: returns Option
const user = R.lookup('user-3')(users); // Option<User>

// Get user email or default
const email = pipe(
  users,
  R.lookup('user-3'),
  O.map(u => u.email),
  O.getOrElse(() => 'unknown@example.com')
);
```

### 组合多个可选值

**The Task**: Get a user's display name, which requires both first and last name.

```typescript
interface Profile {
  firstName?: string;
  lastName?: string;
  nickname?: string;
}

// Imperative
function getDisplayName(profile: Profile): string {
  if (profile.firstName && profile.lastName) {
    return `${profile.firstName} ${profile.lastName}`;
  }
  if (profile.nickname) {
    return profile.nickname;
  }
  return 'Anonymous';
}

// Functional with Option
import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

const getDisplayName = (profile: Profile): string =>
  pipe(
    // Try full name first
    O.Do,
    O.bind('first', () => O.fromNullable(profile.firstName)),
    O.bind('last', () => O.fromNullable(profile.lastName)),
    O.map(({ first, last }) => `${first} ${last}`),
    // Fall back to nickname
    O.alt(() => O.fromNullable(profile.nickname)),
    // Finally, default to Anonymous
    O.getOrElse(() => 'Anonymous')
  );
```

---

## 6. 真实示例

### 示例 1：转换 API 响应为 UI 就绪数据

```typescript
// API 响应
interface ApiOrder {
  order_id: string;
  customer: {
    id: string;
    full_name: string;
  };
  line_items: Array<{
    product_id: string;
    product_name: string;
    qty: number;
    unit_price: number;
  }>;
  order_date: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
}

// What the UI needs
interface OrderSummary {
  id: string;
  customerName: string;
  itemCount: number;
  total: number;
  formattedTotal: string;
  date: string;
  statusLabel: string;
  statusColor: string;
}

// Transformation
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'yellow' },
  processing: { label: 'Processing', color: 'blue' },
  shipped: { label: 'Shipped', color: 'purple' },
  delivered: { label: 'Delivered', color: 'green' },
};

const formatCurrency = (cents: number): string =>
  `$${(cents / 100).toFixed(2)}`;

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const toOrderSummary = (order: ApiOrder): OrderSummary => {
  const total = order.line_items.reduce(
    (sum, item) => sum + item.qty * item.unit_price,
    0
  );

  const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;

  return {
    id: order.order_id,
    customerName: order.customer.full_name,
    itemCount: order.line_items.reduce((sum, item) => sum + item.qty, 0),
    total,
    formattedTotal: formatCurrency(total),
    date: formatDate(order.order_date),
    statusLabel: status.label,
    statusColor: status.color,
  };
};

// Transform all orders
const toOrderSummaries = (orders: ApiOrder[]): OrderSummary[] =>
  orders.map(toOrderSummary);
```

### 示例 2：合并用户设置与默认值

```typescript
interface AppSettings {
  theme: {
    mode: 'light' | 'dark' | 'system';
    primaryColor: string;
    fontSize: 'small' | 'medium' | 'large';
  };
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
  };
  privacy: {
    showProfile: boolean;
    showActivity: boolean;
    allowAnalytics: boolean;
  };
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: {
    mode: 'system',
    primaryColor: '#007bff',
    fontSize: 'medium',
  },
  notifications: {
    email: true,
    push: true,
    sms: false,
    frequency: 'immediate',
  },
  privacy: {
    showProfile: true,
    showActivity: true,
    allowAnalytics: true,
  },
};

const deepMergeSettings = (
  defaults: AppSettings,
  user: DeepPartial<AppSettings>
): AppSettings => ({
  theme: { ...defaults.theme, ...user.theme },
  notifications: { ...defaults.notifications, ...user.notifications },
  privacy: { ...defaults.privacy, ...user.privacy },
});

// Usage
const userPreferences: DeepPartial<AppSettings> = {
  theme: { mode: 'dark' },
  notifications: { sms: true, frequency: 'daily' },
};

const finalSettings = deepMergeSettings(DEFAULT_SETTINGS, userPreferences);
```

### 示例 3：按客户分组订单并计算总额

```typescript
interface Order {
  id: string;
  customerId: string;
  customerName: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  date: string;
}

interface CustomerOrderSummary {
  customerId: string;
  customerName: string;
  orderCount: number;
  totalSpent: number;
  orders: Order[];
}

const calculateOrderTotal = (order: Order): number =>
  order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

const groupOrdersByCustomer = (orders: Order[]): CustomerOrderSummary[] => {
  const grouped = groupBy((order: Order) => order.customerId)(orders);

  return Object.entries(grouped).map(([customerId, customerOrders]) => ({
    customerId,
    customerName: customerOrders[0].customerName,
    orderCount: customerOrders.length,
    totalSpent: customerOrders.reduce(
      (sum, order) => sum + calculateOrderTotal(order),
      0
    ),
    orders: customerOrders,
  }));
};
```

### 示例 4：安全访问深层嵌套配置

```typescript
interface AppConfig {
  services?: {
    api?: {
      endpoints?: {
        users?: string;
        orders?: string;
        products?: string;
      };
      auth?: {
        type?: 'bearer' | 'basic' | 'oauth';
        令牌?: string;
      };
    };
    database?: {
      primary?: {
        host?: string;
        port?: number;
        name?: string;
      };
    };
  };
}

import * as O from 'fp-ts/Option';
import { pipe } from 'fp-ts/function';

// Create a type-safe config accessor
const getConfigValue = <T>(
  config: AppConfig,
  path: (config: AppConfig) => T | undefined,
  defaultValue: T
): T => path(config) ?? defaultValue;

// Usage with optional chaining (simplest)
const apiUsersEndpoint = getConfigValue(
  config,
  c => c.services?.api?.endpoints?.users,
  '/api/users'
);

// For more complex scenarios, use Option
const getEndpoint = (config: AppConfig, name: 'users' | 'orders' | 'products'): string =>
  pipe(
    O.fromNullable(config.services),
    O.flatMap(s => O.fromNullable(s.api)),
    O.flatMap(a => O.fromNullable(a.endpoints)),
    O.flatMap(e => O.fromNullable(e[name])),
    O.getOrElse(() => `/api/${name}`)
  );

// Reusable pattern for multiple values
const getDbConfig = (config: AppConfig) => ({
  host: config.services?.database?.primary?.host ?? 'localhost',
  port: config.services?.database?.primary?.port ?? 5432,
  name: config.services?.database?.primary?.name ?? 'app',
});
```

---

## 7. 何时使用什么

### 使用原生方法的情况：

- **Simple transformations**: `.map()`, `.过滤器()`, `.reduce()` are perfectly good
- **No composition needed**: You're doing a one-off transformation
- **Team familiarity**: Everyone knows native methods
- **可选 chaining suffices**: `obj?.prop?.value ?? default` handles your null-safety needs

```typescript
// Native is fine here
const activeUserNames = users
  .过滤器(u => u.isActive)
  .map(u => u.name);
```

### 使用 fp-ts 的情况：

- **Chaining operations that might fail**: Multiple steps where each can return nothing
- **Composing transformations**: Building reusable transformation pipelines
- **Type-safe error handling**: You want the compiler to track potential failures
- **Complex data pipelines**: Many steps that benefit from explicit composition

```typescript
// fp-ts shines here
const result = pipe(
  users,
  A.findFirst(u => u.id === userId),
  O.flatMap(u => O.fromNullable(u.profile)),
  O.flatMap(p => O.fromNullable(p.settings)),
  O.map(s => s.theme),
  O.getOrElse(() => 'default')
);
```

### 使用自定义工具的情况：

- **Domain-specific operations**: `groupBy`, `countBy`, `sumBy` for your data
- **Repeated patterns**: You find yourself writing the same transformation many times
- **Team conventions**: Establishing consistent patterns across the codebase

```typescript
// Custom utility pays off when used repeatedly
const revenueByRegion = sumBy(
  (sale: Sale) => sale.region,
  (sale: Sale) => sale.amount
)(sales);
```

### 性能考虑

- **Chaining creates intermediate arrays**: `arr.过滤器().map()` creates one array, then another
- **For hot paths, consider `reduce`**: One pass through the data
- **Measure before optimizing**: The readability cost of optimization is often not worth it

```typescript
// If performance matters (and you've measured!)
const result = items.reduce((acc, item) => {
  if (item.isActive) {
    acc.push(item.name.toUpperCase());
  }
  return acc;
}, [] as string[]);

// vs the more readable (but 2-pass) version
const result = items
  .过滤器(item => item.isActive)
  .map(item => item.name.toUpperCase());
```

---

## 总结

| Task | Imperative | Functional | Recommendation |
|------|-----------|------------|----------------|
| Transform array elements | for loop with push | `.map()` | Use map |
| 过滤器 array | for loop with condition | `.过滤器()` | Use 过滤器 |
| Accumulate values | for loop with accumulator | `.reduce()` | Use reduce for complex, loop for simple |
| Group by key | for loop with object | `groupBy` utility | Create reusable utility |
| Pick object fields | manual property copy | `pick` utility | Use spread for one-off, utility for repeated |
| Merge objects | property-by-property | spread syntax | Use spread |
| Deep merge | nested conditionals | recursive utility | Use utility or library |
| Null-safe access | `if (x && x.y)` | `?.` or Option | Use `?.` for simple, Option for composition |
| Normalize API data | nested loops | extraction functions | Break into composable functions |

**The functional 方法 is better when:**
- You need to compose operations
- You want reusable transformations
- You value explicit data flow over implicit state
- Type safety for missing values matters

**The imperative 方法 is acceptable when:**
- The transformation is a one-off
- The logic is simple and linear
- 性能 is critical and you've measured
- The team is more comfortable with it

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

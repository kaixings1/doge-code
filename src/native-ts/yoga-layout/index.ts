/**
 * yoga-layout（Meta 的 flexbox 引擎）的纯 TypeScript 移植版。
 *
 * 此实现匹配 src/ink/layout/yoga.ts 使用的 `yoga-layout/load` API 接口。
 * 上游 C++ 源码仅 CalculateLayout.cpp 就约 2500 行；此移植版是一个简化的
 * 单遍 flexbox 实现，覆盖 Ink 实际使用的功能子集：
 *   - flex-direction（row/column + reverse）
 *   - flex-grow / flex-shrink / flex-basis
 *   - align-items / align-self（stretch, flex-start, center, flex-end）
 *   - justify-content（全部六个值）
 *   - margin / padding / border / gap
 *   - width / height / min / max（point, percent, auto）
 *   - position: relative / absolute
 *   - display: flex / none
 *   - measure 函数（用于文本节点）
 *
 * 为规范兼容性而实现（Ink 未使用）：
 *   - margin: auto（主轴 + 交叉轴，覆盖 justify/align）
 *   - 当子节点触及 min/max 约束时的多遍 flex 钳位
 *   - 容器尺寸不确定时，flex-grow/shrink 相对于容器 min/max
 *
 * 为规范兼容性而实现（Ink 未使用）：
 *   - flex-wrap: wrap / wrap-reverse（多行 flex）
 *   - align-content（在交叉轴上定位折行）
 *
 * 为规范兼容性而实现（Ink 未使用）：
 *   - display: contents（子节点提升到祖父级，移除自身盒子）
 *
 * 为规范兼容性而实现（Ink 未使用）：
 *   - baseline 对齐（align-items/align-self: baseline）
 *
 * 未实现（Ink 未使用）：
 *   - aspect-ratio
 *   - box-sizing: content-box
 *   - RTL 方向（Ink 始终传递 Direction.LTR）
 *
 * 上游地址：https://github.com/facebook/yoga
 */

import {
  Align,
  BoxSizing,
  Dimension,
  Direction,
  Display,
  Edge,
  Errata,
  ExperimentalFeature,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Unit,
  Wrap,
} from './enums.js'

export {
  Align,
  BoxSizing,
  Dimension,
  Direction,
  Display,
  Edge,
  Errata,
  ExperimentalFeature,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Unit,
  Wrap,
}

// --
// 值类型

export type Value = {
  unit: Unit
  value: number
}

const UNDEFINED_VALUE: Value = { unit: Unit.Undefined, value: NaN }
const AUTO_VALUE: Value = { unit: Unit.Auto, value: NaN }

function pointValue(v: number): Value {
  return { unit: Unit.Point, value: v }
}
function percentValue(v: number): Value {
  return { unit: Unit.Percent, value: v }
}

function resolveValue(v: Value, ownerSize: number): number {
  switch (v.unit) {
    case Unit.Point:
      return v.value
    case Unit.Percent:
      return isNaN(ownerSize) ? NaN : (v.value * ownerSize) / 100
    default:
      return NaN
  }
}

function isDefined(n: number): boolean {
  return !isNaN(n)
}

// 用于布局缓存输入比较的 NaN 安全相等判断
function sameFloat(a: number, b: number): boolean {
  return a === b || (a !== a && b !== b)
}

// --
// 布局结果（计算值）

type Layout = {
  left: number
  top: number
  width: number
  height: number
  // 每边计算值（已解析为物理边）
  border: [number, number, number, number] // left, top, right, bottom
  padding: [number, number, number, number]
  margin: [number, number, number, number]
}

// --
// 样式（输入值）

type Style = {
  direction: Direction
  flexDirection: FlexDirection
  justifyContent: Justify
  alignItems: Align
  alignSelf: Align
  alignContent: Align
  flexWrap: Wrap
  overflow: Overflow
  display: Display
  positionType: PositionType

  flexGrow: number
  flexShrink: number
  flexBasis: Value

  // 按 Edge 枚举索引的 9 边数组
  margin: Value[]
  padding: Value[]
  border: Value[]
  position: Value[]

  // 按 Gutter 枚举索引的 3 槽数组
  gap: Value[]

  width: Value
  height: Value
  minWidth: Value
  minHeight: Value
  maxWidth: Value
  maxHeight: Value
}

function defaultStyle(): Style {
  return {
    direction: Direction.Inherit,
    flexDirection: FlexDirection.Column,
    justifyContent: Justify.FlexStart,
    alignItems: Align.Stretch,
    alignSelf: Align.Auto,
    alignContent: Align.FlexStart,
    flexWrap: Wrap.NoWrap,
    overflow: Overflow.Visible,
    display: Display.Flex,
    positionType: PositionType.Relative,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: AUTO_VALUE,
    margin: new Array(9).fill(UNDEFINED_VALUE),
    padding: new Array(9).fill(UNDEFINED_VALUE),
    border: new Array(9).fill(UNDEFINED_VALUE),
    position: new Array(9).fill(UNDEFINED_VALUE),
    gap: new Array(3).fill(UNDEFINED_VALUE),
    width: AUTO_VALUE,
    height: AUTO_VALUE,
    minWidth: UNDEFINED_VALUE,
    minHeight: UNDEFINED_VALUE,
    maxWidth: UNDEFINED_VALUE,
    maxHeight: UNDEFINED_VALUE,
  }
}

// --
// 边缘解析 — yoga 的 9 边模型折叠为 4 条物理边

const EDGE_LEFT = 0
const EDGE_TOP = 1
const EDGE_RIGHT = 2
const EDGE_BOTTOM = 3

function resolveEdge(
  edges: Value[],
  physicalEdge: number,
  ownerSize: number,
  // margin/position 允许 auto；padding/border 的 auto 解析为 0
  allowAuto = false,
): number {
  // 优先级：具体边 > 水平/垂直 > 全部
  let v = edges[physicalEdge]!
  if (v.unit === Unit.Undefined) {
    if (physicalEdge === EDGE_LEFT || physicalEdge === EDGE_RIGHT) {
      v = edges[Edge.Horizontal]!
    } else {
      v = edges[Edge.Vertical]!
    }
  }
  if (v.unit === Unit.Undefined) {
    v = edges[Edge.All]!
  }
  // Start/End 映射到 Left/Right（LTR 方向，Ink 始终为 LTR）
  if (v.unit === Unit.Undefined) {
    if (physicalEdge === EDGE_LEFT) v = edges[Edge.Start]!
    if (physicalEdge === EDGE_RIGHT) v = edges[Edge.End]!
  }
  if (v.unit === Unit.Undefined) return 0
  if (v.unit === Unit.Auto) return allowAuto ? NaN : 0
  return resolveValue(v, ownerSize)
}

function resolveEdgeRaw(edges: Value[], physicalEdge: number): Value {
  let v = edges[physicalEdge]!
  if (v.unit === Unit.Undefined) {
    if (physicalEdge === EDGE_LEFT || physicalEdge === EDGE_RIGHT) {
      v = edges[Edge.Horizontal]!
    } else {
      v = edges[Edge.Vertical]!
    }
  }
  if (v.unit === Unit.Undefined) v = edges[Edge.All]!
  if (v.unit === Unit.Undefined) {
    if (physicalEdge === EDGE_LEFT) v = edges[Edge.Start]!
    if (physicalEdge === EDGE_RIGHT) v = edges[Edge.End]!
  }
  return v
}

function isMarginAuto(edges: Value[], physicalEdge: number): boolean {
  return resolveEdgeRaw(edges, physicalEdge).unit === Unit.Auto
}

// _hasAutoMargin / _hasPosition 快速路径标志的设置辅助函数。
// Unit.Undefined = 0, Unit.Auto = 3。
function hasAnyAutoEdge(edges: Value[]): boolean {
  for (let i = 0; i < 9; i++) if (edges[i]!.unit === 3) return true
  return false
}
function hasAnyDefinedEdge(edges: Value[]): boolean {
  for (let i = 0; i < 9; i++) if (edges[i]!.unit !== 0) return true
  return false
}

// 热路径：一次解析所有 4 条物理边，写入 `out`。
// 相当于调用 resolveEdge() 4 次且 allowAuto=false，但将共享的回退查找
//（Horizontal/Vertical/All/Start/End）提升到循环外，并避免每次
// layoutNode() 调用都分配新的 4 元素数组。
function resolveEdges4Into(
  edges: Value[],
  ownerSize: number,
  out: [number, number, number, number],
): void {
  // 将回退值提升一次——4 条每条边的链共享这些读取。
  const eH = edges[6]! // Edge.Horizontal
  const eV = edges[7]! // Edge.Vertical
  const eA = edges[8]! // Edge.All
  const eS = edges[4]! // Edge.Start
  const eE = edges[5]! // Edge.End
  const pctDenom = isNaN(ownerSize) ? NaN : ownerSize / 100

  // 左：edges[0] → Horizontal → All → Start
  let v = edges[0]!
  if (v.unit === 0) v = eH
  if (v.unit === 0) v = eA
  if (v.unit === 0) v = eS
  out[0] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0

  // 上：edges[1] → Vertical → All
  v = edges[1]!
  if (v.unit === 0) v = eV
  if (v.unit === 0) v = eA
  out[1] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0

  // 右：edges[2] → Horizontal → All → End
  v = edges[2]!
  if (v.unit === 0) v = eH
  if (v.unit === 0) v = eA
  if (v.unit === 0) v = eE
  out[2] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0

  // 底：edges[3] → Vertical → All
  v = edges[3]!
  if (v.unit === 0) v = eV
  if (v.unit === 0) v = eA
  out[3] = v.unit === 1 ? v.value : v.unit === 2 ? v.value * pctDenom : 0
}

// --
// 轴辅助函数

function isRow(dir: FlexDirection): boolean {
  return dir === FlexDirection.Row || dir === FlexDirection.RowReverse
}
function isReverse(dir: FlexDirection): boolean {
  return dir === FlexDirection.RowReverse || dir === FlexDirection.ColumnReverse
}
function crossAxis(dir: FlexDirection): FlexDirection {
  return isRow(dir) ? FlexDirection.Column : FlexDirection.Row
}
function leadingEdge(dir: FlexDirection): number {
  switch (dir) {
    case FlexDirection.Row:
      return EDGE_LEFT
    case FlexDirection.RowReverse:
      return EDGE_RIGHT
    case FlexDirection.Column:
      return EDGE_TOP
    case FlexDirection.ColumnReverse:
      return EDGE_BOTTOM
  }
}
function trailingEdge(dir: FlexDirection): number {
  switch (dir) {
    case FlexDirection.Row:
      return EDGE_RIGHT
    case FlexDirection.RowReverse:
      return EDGE_LEFT
    case FlexDirection.Column:
      return EDGE_BOTTOM
    case FlexDirection.ColumnReverse:
      return EDGE_TOP
  }
}

// --
// 公开类型

export type MeasureFunction = (
  width: number,
  widthMode: MeasureMode,
  height: number,
  heightMode: MeasureMode,
) => { width: number; height: number }

export type Size = { width: number; height: number }

// --
// 配置

export type Config = {
  pointScaleFactor: number
  errata: Errata
  useWebDefaults: boolean
  free(): void
  isExperimentalFeatureEnabled(_: ExperimentalFeature): boolean
  setExperimentalFeatureEnabled(_: ExperimentalFeature, __: boolean): void
  setPointScaleFactor(factor: number): void
  getErrata(): Errata
  setErrata(errata: Errata): void
  setUseWebDefaults(v: boolean): void
}

function createConfig(): Config {
  const config: Config = {
    pointScaleFactor: 1,
    errata: Errata.None,
    useWebDefaults: false,
    free() {},
    isExperimentalFeatureEnabled() {
      return false
    },
    setExperimentalFeatureEnabled() {},
    setPointScaleFactor(f) {
      config.pointScaleFactor = f
    },
    getErrata() {
      return config.errata
    },
    setErrata(e) {
      config.errata = e
    },
    setUseWebDefaults(v) {
      config.useWebDefaults = v
    },
  }
  return config
}

// --
// Node 实现

export class Node {
  style: Style
  layout: Layout
  parent: Node | null
  children: Node[]
  measureFunc: MeasureFunction | null
  config: Config
  isDirty_: boolean
  isReferenceBaseline_: boolean

  // 每次布局的暂存数据（非公开 API）
  _flexBasis = 0
  _mainSize = 0
  _crossSize = 0
  _lineIndex = 0
  // 由样式设置器维护的快速路径标志。根据 CPU 性能分析，
  // 定位循环在每次布局中对每个子节点调用 isMarginAuto 6 次和 resolveEdgeRaw(position) 4 次
  // — 1000 节点基准约 11k 次调用，几乎
  // 全部返回 false/未定义，因为大多数节点没有 auto
  // 外边距和定位偏移。这些标志让我们可以直接跳到
  // 常见情况，仅需一条分支。
  _hasAutoMargin = false
  _hasPosition = false
  // 同样的模式也适用于每次 layoutNode() 开头处的 3 次 resolveEdges4Into 调用。
  // 在 1000 节点基准测试中，约 67% 的调用操作在
  // 全部未定义的边缘数组上（大多数节点没有边框；只有列有
  // 内边距；只有叶子单元格有外边距）——单分支跳过优于
  // ~20 次属性读取 + ~15 次比较 + 4 次写入零。
  _hasPadding = false
  _hasBorder = false
  _hasMargin = false
  // -- 脏标志布局缓存。镜像上游 CalculateLayout.cpp 的
  // layoutNodeInternal：当子树干净且询问的是已缓存答案的问题时，
  // 完全跳过该子树。使用两个槽位是因为
  // 每个节点通常会先收到一个测量调用（performLayout=false，来自
  // computeFlexBasis），然后是布局调用（performLayout=true），每次父级
  // 传入的输入都不同——单个槽位会导致频繁颠簸。重新布局
  // 基准测试（脏化一个叶子，重新计算根节点）因此从 2.7x 降到 1.1x：
  // 干净的兄弟节点直接跳过，只有脏链重新计算。
  _lW = NaN
  _lH = NaN
  _lWM: MeasureMode = 0
  _lHM: MeasureMode = 0
  _lOW = NaN
  _lOH = NaN
  _lFW = false
  _lFH = false
  // _hasL 提前存储 INPUTS（计算前），但 layout.width/height 会被
  // 多条目缓存和后续不同输入的 compute 调用修改。
  // 如果不存储 OUTPUTS，_hasL 命中将返回上次调用遗留的
  // layout.width/height——即滚动框 vpH=33→2624 的 bug。
  // 像多条目缓存那样存储+恢复 outputs。
  _lOutW = NaN
  _lOutH = NaN
  _hasL = false
  _mW = NaN
  _mH = NaN
  _mWM: MeasureMode = 0
  _mHM: MeasureMode = 0
  _mOW = NaN
  _mOH = NaN
  _mOutW = NaN
  _mOutH = NaN
  _hasM = false
  // 缓存 computeFlexBasis 的结果。对于干净的子节点，basis 仅取决于
  // 容器的内部尺寸——如果这些没有变化，完全跳过
  // layoutNode(performLayout=false) 递归。这是滚动的热路径：
  // 500 条消息的内容容器是脏的，其 499 个干净子节点
  // 随着脏链的测量/布局阶段级联，每个被测量约 20 次。
  // Basis 缓存在子节点边界处短路。
  _fbBasis = NaN
  _fbOwnerW = NaN
  _fbOwnerH = NaN
  _fbAvailMain = NaN
  _fbAvailCross = NaN
  _fbCrossMode: MeasureMode = 0
  // _fbBasis 写入时的代次。来自上一代次的脏节点具有过期的缓存
  //（子树已更改），但在同一代次内缓存是新鲜的——脏链的
  // measure→layout 级联对每个新挂载项在每次 calculateLayout 中
  // 调用 computeFlexBasis ≥2^depth 次，且子树在调用之间不变。
  // 基于代次而非 isDirty_ 进行门控，让新挂载（虚拟滚动）
  // 在首次计算后即可命中缓存：105k 次访问 → ~10k。
  _fbGen = -1
  // 多条目布局缓存——存储（inputs → 计算后的 w,h），因此与 _hasL
  // 输入不同的命中可以恢复正确的尺寸。上游 yoga 使用 16 个；
  // 4 个即可覆盖 Ink 的脏链深度。打包为扁平数组以避免
  // 每个条目的对象分配。槽位 i 在 _cIn 中使用索引 [i*8, i*8+8)
  //（aW,aH,wM,hM,oW,oH,fW,fH），在 _cOut 中使用 [i*2, i*2+2)（w,h）。
  _cIn: Float64Array | null = null
  _cOut: Float64Array | null = null
  _cGen = -1
  _cN = 0
  _cWr = 0

  constructor(config?: Config) {
    this.style = defaultStyle()
    this.layout = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      border: [0, 0, 0, 0],
      padding: [0, 0, 0, 0],
      margin: [0, 0, 0, 0],
    }
    this.parent = null
    this.children = []
    this.measureFunc = null
    this.config = config ?? DEFAULT_CONFIG
    this.isDirty_ = true
    this.isReferenceBaseline_ = false
    _yogaLiveNodes++
  }

  // -- 树操作

  insertChild(child: Node, index: number): void {
    child.parent = this
    this.children.splice(index, 0, child)
    this.markDirty()
  }
  removeChild(child: Node): void {
    const idx = this.children.indexOf(child)
    if (idx >= 0) {
      this.children.splice(idx, 1)
      child.parent = null
      this.markDirty()
    }
  }
  getChild(index: number): Node {
    return this.children[index]!
  }
  getChildCount(): number {
    return this.children.length
  }
  getParent(): Node | null {
    return this.parent
  }

  // -- 生命周期

  free(): void {
    this.parent = null
    this.children = []
    this.measureFunc = null
    this._cIn = null
    this._cOut = null
    _yogaLiveNodes--
  }
  freeRecursive(): void {
    for (const c of this.children) c.freeRecursive()
    this.free()
  }
  reset(): void {
    this.style = defaultStyle()
    this.children = []
    this.parent = null
    this.measureFunc = null
    this.isDirty_ = true
    this._hasAutoMargin = false
    this._hasPosition = false
    this._hasPadding = false
    this._hasBorder = false
    this._hasMargin = false
    this._hasL = false
    this._hasM = false
    this._cN = 0
    this._cWr = 0
    this._fbBasis = NaN
  }

  // -- 脏状态跟踪

  markDirty(): void {
    this.isDirty_ = true
    if (this.parent && !this.parent.isDirty_) this.parent.markDirty()
  }
  isDirty(): boolean {
    return this.isDirty_
  }
  hasNewLayout(): boolean {
    return true
  }
  markLayoutSeen(): void {}

  // -- 测量函数

  setMeasureFunc(fn: MeasureFunction | null): void {
    this.measureFunc = fn
    this.markDirty()
  }
  unsetMeasureFunc(): void {
    this.measureFunc = null
    this.markDirty()
  }

  // -- 计算后的布局 getter

  getComputedLeft(): number {
    return this.layout.left
  }
  getComputedTop(): number {
    return this.layout.top
  }
  getComputedWidth(): number {
    return this.layout.width
  }
  getComputedHeight(): number {
    return this.layout.height
  }
  getComputedRight(): number {
    const p = this.parent
    return p ? p.layout.width - this.layout.left - this.layout.width : 0
  }
  getComputedBottom(): number {
    const p = this.parent
    return p ? p.layout.height - this.layout.top - this.layout.height : 0
  }
  getComputedLayout(): {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  } {
    return {
      left: this.layout.left,
      top: this.layout.top,
      right: this.getComputedRight(),
      bottom: this.getComputedBottom(),
      width: this.layout.width,
      height: this.layout.height,
    }
  }
  getComputedBorder(edge: Edge): number {
    return this.layout.border[physicalEdge(edge)]!
  }
  getComputedPadding(edge: Edge): number {
    return this.layout.padding[physicalEdge(edge)]!
  }
  getComputedMargin(edge: Edge): number {
    return this.layout.margin[physicalEdge(edge)]!
  }

  // -- 样式 setter：尺寸

  setWidth(v: number | 'auto' | string | undefined): void {
    this.style.width = parseDimension(v)
    this.markDirty()
  }
  setWidthPercent(v: number): void {
    this.style.width = percentValue(v)
    this.markDirty()
  }
  setWidthAuto(): void {
    this.style.width = AUTO_VALUE
    this.markDirty()
  }
  setHeight(v: number | 'auto' | string | undefined): void {
    this.style.height = parseDimension(v)
    this.markDirty()
  }
  setHeightPercent(v: number): void {
    this.style.height = percentValue(v)
    this.markDirty()
  }
  setHeightAuto(): void {
    this.style.height = AUTO_VALUE
    this.markDirty()
  }
  setMinWidth(v: number | string | undefined): void {
    this.style.minWidth = parseDimension(v)
    this.markDirty()
  }
  setMinWidthPercent(v: number): void {
    this.style.minWidth = percentValue(v)
    this.markDirty()
  }
  setMinHeight(v: number | string | undefined): void {
    this.style.minHeight = parseDimension(v)
    this.markDirty()
  }
  setMinHeightPercent(v: number): void {
    this.style.minHeight = percentValue(v)
    this.markDirty()
  }
  setMaxWidth(v: number | string | undefined): void {
    this.style.maxWidth = parseDimension(v)
    this.markDirty()
  }
  setMaxWidthPercent(v: number): void {
    this.style.maxWidth = percentValue(v)
    this.markDirty()
  }
  setMaxHeight(v: number | string | undefined): void {
    this.style.maxHeight = parseDimension(v)
    this.markDirty()
  }
  setMaxHeightPercent(v: number): void {
    this.style.maxHeight = percentValue(v)
    this.markDirty()
  }

  // -- 样式 setter：flex

  setFlexDirection(dir: FlexDirection): void {
    this.style.flexDirection = dir
    this.markDirty()
  }
  setFlexGrow(v: number | undefined): void {
    this.style.flexGrow = v ?? 0
    this.markDirty()
  }
  setFlexShrink(v: number | undefined): void {
    this.style.flexShrink = v ?? 0
    this.markDirty()
  }
  setFlex(v: number | undefined): void {
    if (v === undefined || isNaN(v)) {
      this.style.flexGrow = 0
      this.style.flexShrink = 0
    } else if (v > 0) {
      this.style.flexGrow = v
      this.style.flexShrink = 1
      this.style.flexBasis = pointValue(0)
    } else if (v < 0) {
      this.style.flexGrow = 0
      this.style.flexShrink = -v
    } else {
      this.style.flexGrow = 0
      this.style.flexShrink = 0
    }
    this.markDirty()
  }
  setFlexBasis(v: number | 'auto' | string | undefined): void {
    this.style.flexBasis = parseDimension(v)
    this.markDirty()
  }
  setFlexBasisPercent(v: number): void {
    this.style.flexBasis = percentValue(v)
    this.markDirty()
  }
  setFlexBasisAuto(): void {
    this.style.flexBasis = AUTO_VALUE
    this.markDirty()
  }
  setFlexWrap(wrap: Wrap): void {
    this.style.flexWrap = wrap
    this.markDirty()
  }

  // -- 样式 setter：对齐

  setAlignItems(a: Align): void {
    this.style.alignItems = a
    this.markDirty()
  }
  setAlignSelf(a: Align): void {
    this.style.alignSelf = a
    this.markDirty()
  }
  setAlignContent(a: Align): void {
    this.style.alignContent = a
    this.markDirty()
  }
  setJustifyContent(j: Justify): void {
    this.style.justifyContent = j
    this.markDirty()
  }

  // -- 样式 setter：display / position / overflow

  setDisplay(d: Display): void {
    this.style.display = d
    this.markDirty()
  }
  getDisplay(): Display {
    return this.style.display
  }
  setPositionType(t: PositionType): void {
    this.style.positionType = t
    this.markDirty()
  }
  setPosition(edge: Edge, v: number | string | undefined): void {
    this.style.position[edge] = parseDimension(v)
    this._hasPosition = hasAnyDefinedEdge(this.style.position)
    this.markDirty()
  }
  setPositionPercent(edge: Edge, v: number): void {
    this.style.position[edge] = percentValue(v)
    this._hasPosition = true
    this.markDirty()
  }
  setPositionAuto(edge: Edge): void {
    this.style.position[edge] = AUTO_VALUE
    this._hasPosition = true
    this.markDirty()
  }
  setOverflow(o: Overflow): void {
    this.style.overflow = o
    this.markDirty()
  }
  setDirection(d: Direction): void {
    this.style.direction = d
    this.markDirty()
  }
  setBoxSizing(_: BoxSizing): void {
    // 未实现——Ink 不使用 content-box
  }

  // -- 样式 setter：间距

  setMargin(edge: Edge, v: number | 'auto' | string | undefined): void {
    const val = parseDimension(v)
    this.style.margin[edge] = val
    if (val.unit === Unit.Auto) this._hasAutoMargin = true
    else this._hasAutoMargin = hasAnyAutoEdge(this.style.margin)
    this._hasMargin =
      this._hasAutoMargin || hasAnyDefinedEdge(this.style.margin)
    this.markDirty()
  }
  setMarginPercent(edge: Edge, v: number): void {
    this.style.margin[edge] = percentValue(v)
    this._hasAutoMargin = hasAnyAutoEdge(this.style.margin)
    this._hasMargin = true
    this.markDirty()
  }
  setMarginAuto(edge: Edge): void {
    this.style.margin[edge] = AUTO_VALUE
    this._hasAutoMargin = true
    this._hasMargin = true
    this.markDirty()
  }
  setPadding(edge: Edge, v: number | string | undefined): void {
    this.style.padding[edge] = parseDimension(v)
    this._hasPadding = hasAnyDefinedEdge(this.style.padding)
    this.markDirty()
  }
  setPaddingPercent(edge: Edge, v: number): void {
    this.style.padding[edge] = percentValue(v)
    this._hasPadding = true
    this.markDirty()
  }
  setBorder(edge: Edge, v: number | undefined): void {
    this.style.border[edge] = v === undefined ? UNDEFINED_VALUE : pointValue(v)
    this._hasBorder = hasAnyDefinedEdge(this.style.border)
    this.markDirty()
  }
  setGap(gutter: Gutter, v: number | string | undefined): void {
    this.style.gap[gutter] = parseDimension(v)
    this.markDirty()
  }
  setGapPercent(gutter: Gutter, v: number): void {
    this.style.gap[gutter] = percentValue(v)
    this.markDirty()
  }

  // -- 样式 getter（部分——仅测试所需）

  getFlexDirection(): FlexDirection {
    return this.style.flexDirection
  }
  getJustifyContent(): Justify {
    return this.style.justifyContent
  }
  getAlignItems(): Align {
    return this.style.alignItems
  }
  getAlignSelf(): Align {
    return this.style.alignSelf
  }
  getAlignContent(): Align {
    return this.style.alignContent
  }
  getFlexGrow(): number {
    return this.style.flexGrow
  }
  getFlexShrink(): number {
    return this.style.flexShrink
  }
  getFlexBasis(): Value {
    return this.style.flexBasis
  }
  getFlexWrap(): Wrap {
    return this.style.flexWrap
  }
  getWidth(): Value {
    return this.style.width
  }
  getHeight(): Value {
    return this.style.height
  }
  getOverflow(): Overflow {
    return this.style.overflow
  }
  getPositionType(): PositionType {
    return this.style.positionType
  }
  getDirection(): Direction {
    return this.style.direction
  }

  // -- 未使用的 API 桩（为保持 API 一致性）

  copyStyle(_: Node): void {}
  setDirtiedFunc(_: unknown): void {}
  unsetDirtiedFunc(): void {}
  setIsReferenceBaseline(v: boolean): void {
    this.isReferenceBaseline_ = v
    this.markDirty()
  }
  isReferenceBaseline(): boolean {
    return this.isReferenceBaseline_
  }
  setAspectRatio(_: number | undefined): void {}
  getAspectRatio(): number {
    return NaN
  }
  setAlwaysFormsContainingBlock(_: boolean): void {}

  // -- 布局入口点

  calculateLayout(
    ownerWidth: number | undefined,
    ownerHeight: number | undefined,
    _direction?: Direction,
  ): void {
    _yogaNodesVisited = 0
    _yogaMeasureCalls = 0
    _yogaCacheHits = 0
    _generation++
    const w = ownerWidth === undefined ? NaN : ownerWidth
    const h = ownerHeight === undefined ? NaN : ownerHeight
    layoutNode(
      this,
      w,
      h,
      isDefined(w) ? MeasureMode.Exactly : MeasureMode.Undefined,
      isDefined(h) ? MeasureMode.Exactly : MeasureMode.Undefined,
      w,
      h,
      true,
    )
    // 根节点自身的位置 = 外边距 + 定位偏移（即使没有父容器，yoga 也会
    // 对根节点应用定位；这对舍入很重要，因为根节点的绝对 top/left
    // 是像素网格遍历的起点）。
    const mar = this.layout.margin
    const posL = resolveValue(
      resolveEdgeRaw(this.style.position, EDGE_LEFT),
      isDefined(w) ? w : 0,
    )
    const posT = resolveValue(
      resolveEdgeRaw(this.style.position, EDGE_TOP),
      isDefined(w) ? w : 0,
    )
    this.layout.left = mar[EDGE_LEFT] + (isDefined(posL) ? posL : 0)
    this.layout.top = mar[EDGE_TOP] + (isDefined(posT) ? posT : 0)
    roundLayout(this, this.config.pointScaleFactor, 0, 0)
  }
}

const DEFAULT_CONFIG = createConfig()

const CACHE_SLOTS = 4
function cacheWrite(
  node: Node,
  aW: number,
  aH: number,
  wM: MeasureMode,
  hM: MeasureMode,
  oW: number,
  oH: number,
  fW: boolean,
  fH: boolean,
  wasDirty: boolean,
): void {
  if (!node._cIn) {
    node._cIn = new Float64Array(CACHE_SLOTS * 8)
    node._cOut = new Float64Array(CACHE_SLOTS * 2)
  }
  // 脏化后的首次写入会清除脏化前的陈旧条目。
  // _cGen < _generation 表示条目来自之前的 calculateLayout；
  // 如果 wasDirty，则子树此后已更改 → 旧尺寸无效。
  // 干净节点的旧条目保留——相同子树 → 相同输入产生相同结果，
  // 因此跨代次缓存有效（滚动热路径中 499 个干净消息命中缓存，
  // 而一个脏叶子重新计算）。
  if (wasDirty && node._cGen !== _generation) {
    node._cN = 0
    node._cWr = 0
  }
  // LRU 写入索引循环；_cN 保持为 CACHE_SLOTS 以便读取扫描始终
  // 检查所有已填充的槽位（不仅仅是自上次循环以来的）。
  const i = node._cWr++ % CACHE_SLOTS
  if (node._cN < CACHE_SLOTS) node._cN = node._cWr
  const o = i * 8
  const cIn = node._cIn
  cIn[o] = aW
  cIn[o + 1] = aH
  cIn[o + 2] = wM
  cIn[o + 3] = hM
  cIn[o + 4] = oW
  cIn[o + 5] = oH
  cIn[o + 6] = fW ? 1 : 0
  cIn[o + 7] = fH ? 1 : 0
  node._cOut![i * 2] = node.layout.width
  node._cOut![i * 2 + 1] = node.layout.height
  node._cGen = _generation
}

// 将计算后的 layout.width/height 存储到单槽缓存输出字段中。
// _hasL/_hasM 的输入在 layoutNode 顶部（计算前）提交；
// 输出必须在 HERE（计算后）提交，以便缓存命中可以恢复正确的尺寸。
// 如果没有这个，_hasL 命中将返回上次调用遗留的 layout.width/height——
// 可能是 heightMode=Undefined 测量阶段的内在内容高度，
// 而不是布局阶段的受限视口高度。这就是滚动框 vpH=33→2624 bug：
// scrollTop 被钳制为 0，视口变为空白。
function commitCacheOutputs(node: Node, performLayout: boolean): void {
  if (performLayout) {
    node._lOutW = node.layout.width
    node._lOutH = node.layout.height
  } else {
    node._mOutW = node.layout.width
    node._mOutH = node.layout.height
  }
}

// --
// 核心 flexbox 算法

// 性能分析计数器——每次 calculateLayout 重置，通过 getYogaCounters 读取。
// 每次 calculateLayout() 递增。节点在写入缓存时标记 _fbGen/_cGen；
// gen === _generation 的缓存条目是在本次阶段计算的，
// 无论 isDirty_ 状态如何都是新鲜的。
let _generation = 0
let _yogaNodesVisited = 0
let _yogaMeasureCalls = 0
let _yogaCacheHits = 0
let _yogaLiveNodes = 0
export function getYogaCounters(): {
  visited: number
  measured: number
  cacheHits: number
  live: number
} {
  return {
    visited: _yogaNodesVisited,
    measured: _yogaMeasureCalls,
    cacheHits: _yogaCacheHits,
    live: _yogaLiveNodes,
  }
}

function layoutNode(
  node: Node,
  availableWidth: number,
  availableHeight: number,
  widthMode: MeasureMode,
  heightMode: MeasureMode,
  ownerWidth: number,
  ownerHeight: number,
  performLayout: boolean,
  // 为 true 时，忽略该轴上的样式尺寸——flex 容器
  // 已经确定了主轴尺寸（flex-basis + grow/shrink 结果）。
  forceWidth = false,
  forceHeight = false,
): void {
  _yogaNodesVisited++
  const style = node.style
  const layout = node.layout

  // 脏标志跳过：干净子树 + 匹配输入 → 布局对象已经包含答案。
  // 缓存的布局结果也满足测量请求（位置是尺寸的超集）；反之则不成立。
  // 同代次条目无论 isDirty_ 如何都是新鲜的——它们是在本次
  // calculateLayout 中计算的，子树此后未更改。
  // 前代次条目需要 !isDirty_（脏节点在脏化之前的缓存已过期）。
  // sameGen 绕过仅用于 MEASURE 调用——布局阶段的缓存命中会
  // 跳过子定位递归（步骤 5），使子节点处于陈旧位置。
  // 测量调用只需要缓存存储的 w/h。
  const sameGen = node._cGen === _generation && !performLayout
  if (!node.isDirty_ || sameGen) {
    if (
      !node.isDirty_ &&
      node._hasL &&
      node._lWM === widthMode &&
      node._lHM === heightMode &&
      node._lFW === forceWidth &&
      node._lFH === forceHeight &&
      sameFloat(node._lW, availableWidth) &&
      sameFloat(node._lH, availableHeight) &&
      sameFloat(node._lOW, ownerWidth) &&
      sameFloat(node._lOH, ownerHeight)
    ) {
      _yogaCacheHits++
      layout.width = node._lOutW
      layout.height = node._lOutH
      return
    }
    // 多条目缓存：扫描匹配的输入，命中时恢复缓存的 w/h。
    // 覆盖滚动场景中脏祖先的 measure→layout 级联为每个干净子节点
    // 产生 N>1 种不同输入组合的情况——单个 _hasL 槽位颠簸，
    // 强制完全子树递归。对于 500 条消息的滚动框和一个脏叶子，
    // 这将脏叶子的重新布局从 76k 次 layoutNode 调用（21.7×节点数）
    // 减少到 4k（1.2×节点数），6.86ms → 550µs。
    // 同代次检查覆盖虚拟滚动期间新挂载（脏）的节点——
    // 脏链调用它们 ≥2^depth 次，首次调用写入缓存，
    // 其余命中：对于 1593 节点树，105k 次访问 → ~10k。
    if (node._cN > 0 && (sameGen || !node.isDirty_)) {
      const cIn = node._cIn!
      for (let i = 0; i < node._cN; i++) {
        const o = i * 8
        if (
          cIn[o + 2] === widthMode &&
          cIn[o + 3] === heightMode &&
          cIn[o + 6] === (forceWidth ? 1 : 0) &&
          cIn[o + 7] === (forceHeight ? 1 : 0) &&
          sameFloat(cIn[o]!, availableWidth) &&
          sameFloat(cIn[o + 1]!, availableHeight) &&
          sameFloat(cIn[o + 4]!, ownerWidth) &&
          sameFloat(cIn[o + 5]!, ownerHeight)
        ) {
          layout.width = node._cOut![i * 2]!
          layout.height = node._cOut![i * 2 + 1]!
          _yogaCacheHits++
          return
        }
      }
    }
    if (
      !node.isDirty_ &&
      !performLayout &&
      node._hasM &&
      node._mWM === widthMode &&
      node._mHM === heightMode &&
      sameFloat(node._mW, availableWidth) &&
      sameFloat(node._mH, availableHeight) &&
      sameFloat(node._mOW, ownerWidth) &&
      sameFloat(node._mOH, ownerHeight)
    ) {
      layout.width = node._mOutW
      layout.height = node._mOutH
      _yogaCacheHits++
      return
    }
  }
  // 提前提交缓存输入，以便每个返回路径都留下有效条目。
  // 仅在 LAYOUT 阶段清除 isDirty_——测量阶段（computeFlexBasis
  // → layoutNode(performLayout=false)）在同一 calculateLayout 调用中
  // 在布局阶段之前运行。在测量期间清除脏状态会让后续的
  // 布局阶段命中来自上次 calculateLayout 的陈旧 _hasL 缓存
  //（在插入子节点之前），因此 ScrollBox 内容高度永远不会增长，
  // 粘性滚动永远不会跟随新内容。脏节点的 _hasL 条目根据定义
  // 已过期——使其失效以便布局阶段重新计算。
  const wasDirty = node.isDirty_
  if (performLayout) {
    node._lW = availableWidth
    node._lH = availableHeight
    node._lWM = widthMode
    node._lHM = heightMode
    node._lOW = ownerWidth
    node._lOH = ownerHeight
    node._lFW = forceWidth
    node._lFH = forceHeight
    node._hasL = true
    node.isDirty_ = false
    // 之前的方法在此处清除 _cN 以防止脏化前的陈旧条目命中
    //（长时间连续空白屏幕 bug）。现在被代次标记取代：
    // 缓存检查要求 sameGen || !isDirty_，因此脏节点的前代次条目
    // 无法命中。在此处清除会抹掉早期测量调用中的同代次新鲜条目，
    // 强制在布局调用时重新计算。
    if (wasDirty) node._hasM = false
  } else {
    node._mW = availableWidth
    node._mH = availableHeight
    node._mWM = widthMode
    node._mHM = heightMode
    node._mOW = ownerWidth
    node._mOH = ownerHeight
    node._hasM = true
    // 不清除 isDirty_。对于 DIRTY 节点，使 _hasL 失效，以便即将到来的
    // performLayout=true 调用使用新的子节点集合重新计算（否则
    // 粘性滚动永远不会跟随新内容——来自 4557bc9f9c 的 bug）。
    // 干净节点保留 _hasL：它们来自前一代次的布局仍然有效，
    // 它们出现在这里只是因为祖先脏了并且使用了与缓存不同的输入来调用。
    if (wasDirty) node._hasL = false
  }

  // 根据 ownerWidth 解析 padding/border/margin（yoga 对 % 使用 ownerWidth）
  // 直接写入预分配的布局数组——避免每次 layoutNode 调用 3 次分配和
  // 12 次 resolveEdge 调用（根据 CPU 性能分析，曾是 #1 热点）。
  // 当没有设置任何边时完全跳过——4 次写入零比 resolveEdges4Into
  // 为了产生零而进行的 ~20 次读取 + ~15 次比较更廉价。
  const pad = layout.padding
  const bor = layout.border
  const mar = layout.margin
  if (node._hasPadding) resolveEdges4Into(style.padding, ownerWidth, pad)
  else pad[0] = pad[1] = pad[2] = pad[3] = 0
  if (node._hasBorder) resolveEdges4Into(style.border, ownerWidth, bor)
  else bor[0] = bor[1] = bor[2] = bor[3] = 0
  if (node._hasMargin) resolveEdges4Into(style.margin, ownerWidth, mar)
  else mar[0] = mar[1] = mar[2] = mar[3] = 0

  const paddingBorderWidth = pad[0] + pad[2] + bor[0] + bor[2]
  const paddingBorderHeight = pad[1] + pad[3] + bor[1] + bor[3]

  // Resolve style dimensions
  const styleWidth = forceWidth ? NaN : resolveValue(style.width, ownerWidth)
  const styleHeight = forceHeight
    ? NaN
    : resolveValue(style.height, ownerHeight)

  // If style dimension is defined, it overrides the available size
  let width = availableWidth
  let height = availableHeight
  let wMode = widthMode
  let hMode = heightMode
  if (isDefined(styleWidth)) {
    width = styleWidth
    wMode = MeasureMode.Exactly
  }
  if (isDefined(styleHeight)) {
    height = styleHeight
    hMode = MeasureMode.Exactly
  }

  // Apply min/max constraints to the node's own dimensions
  width = boundAxis(style, true, width, ownerWidth, ownerHeight)
  height = boundAxis(style, false, height, ownerWidth, ownerHeight)

  // Measure-func leaf node
  if (node.measureFunc && node.children.length === 0) {
    const innerW =
      wMode === MeasureMode.Undefined
        ? NaN
        : Math.max(0, width - paddingBorderWidth)
    const innerH =
      hMode === MeasureMode.Undefined
        ? NaN
        : Math.max(0, height - paddingBorderHeight)
    _yogaMeasureCalls++
    const measured = node.measureFunc(innerW, wMode, innerH, hMode)
    node.layout.width =
      wMode === MeasureMode.Exactly
        ? width
        : boundAxis(
            style,
            true,
            (measured.width ?? 0) + paddingBorderWidth,
            ownerWidth,
            ownerHeight,
          )
    node.layout.height =
      hMode === MeasureMode.Exactly
        ? height
        : boundAxis(
            style,
            false,
            (measured.height ?? 0) + paddingBorderHeight,
            ownerWidth,
            ownerHeight,
          )
    commitCacheOutputs(node, performLayout)
    // 即使脏节点也写入缓存——虚拟滚动期间新挂载的项在首次布局时
    // 是脏的，但脏链的 measure→layout 级联每次 calculateLayout 调用它们
    // ≥2^depth 次。在此处写入让第 2+ 次调用命中缓存（isDirty_ 在上面
    // 的布局阶段已清除）。实测：1593 节点新挂载树，105k 次访问 → 10k。
    cacheWrite(
      node,
      availableWidth,
      availableHeight,
      widthMode,
      heightMode,
      ownerWidth,
      ownerHeight,
      forceWidth,
      forceHeight,
      wasDirty,
    )
    return
  }

  // 叶子节点，无子节点且无测量函数
  if (node.children.length === 0) {
    node.layout.width =
      wMode === MeasureMode.Exactly
        ? width
        : boundAxis(style, true, paddingBorderWidth, ownerWidth, ownerHeight)
    node.layout.height =
      hMode === MeasureMode.Exactly
        ? height
        : boundAxis(style, false, paddingBorderHeight, ownerWidth, ownerHeight)
    commitCacheOutputs(node, performLayout)
    // 即使脏节点也写入缓存——虚拟滚动期间新挂载的项在首次布局时
    // 是脏的，但脏链的 measure→layout 级联每次 calculateLayout 调用它们
    // ≥2^depth 次。在此处写入让第 2+ 次调用命中缓存（isDirty_ 在上面
    // 的布局阶段已清除）。实测：1593 节点新挂载树，105k 次访问 → 10k。
    cacheWrite(
      node,
      availableWidth,
      availableHeight,
      widthMode,
      heightMode,
      ownerWidth,
      ownerHeight,
      forceWidth,
      forceHeight,
      wasDirty,
    )
    return
  }

  // 有子节点的容器——运行 flexbox 算法
  const mainAxis = style.flexDirection
  const crossAx = crossAxis(mainAxis)
  const isMainRow = isRow(mainAxis)

  const mainSize = isMainRow ? width : height
  const crossSize = isMainRow ? height : width
  const mainMode = isMainRow ? wMode : hMode
  const crossMode = isMainRow ? hMode : wMode
  const mainPadBorder = isMainRow ? paddingBorderWidth : paddingBorderHeight
  const crossPadBorder = isMainRow ? paddingBorderHeight : paddingBorderWidth

  const innerMainSize = isDefined(mainSize)
    ? Math.max(0, mainSize - mainPadBorder)
    : NaN
  const innerCrossSize = isDefined(crossSize)
    ? Math.max(0, crossSize - crossPadBorder)
    : NaN

  // Resolve gap
  const gapMain = resolveGap(
    style,
    isMainRow ? Gutter.Column : Gutter.Row,
    innerMainSize,
  )

  // 将子节点分为流式与绝对定位。display:contents 节点是
  // 透明的——它们的子节点被提升到祖父级的子节点列表中
  //（递归地），而 contents 节点本身获得零布局。
  const flowChildren: Node[] = []
  const absChildren: Node[] = []
  collectLayoutChildren(node, flowChildren, absChildren)

  // ownerW/H 是用于解析子节点百分比值的参考尺寸。
  // 根据 CSS，% 宽度相对于父级的内容盒宽度解析。
  // 如果此节点的宽度未定义，子节点的 % 宽度也是未定义的
  // ——不要回退到祖父级的尺寸。
  const ownerW = isDefined(width) ? width : NaN
  const ownerH = isDefined(height) ? height : NaN
  const isWrap = style.flexWrap !== Wrap.NoWrap
  const gapCross = resolveGap(
    style,
    isMainRow ? Gutter.Row : Gutter.Column,
    innerCrossSize,
  )

  // 步骤 1：计算每个流式子节点的 flex-basis 并分行。
  // 单行（NoWrap）容器始终只有一行；多行容器
  // 在累计 basis+margin+gap 超过 innerMainSize 时换行。
  for (const c of flowChildren) {
    c._flexBasis = computeFlexBasis(
      c,
      mainAxis,
      innerMainSize,
      innerCrossSize,
      crossMode,
      ownerW,
      ownerH,
    )
  }
  const lines: Node[][] = []
  if (!isWrap || !isDefined(innerMainSize) || flowChildren.length === 0) {
    for (const c of flowChildren) c._lineIndex = 0
    lines.push(flowChildren)
  } else {
    // 换行决策使用 min/max 钳制后的 basis（flexbox 规范 §9.3.5：
    // "hypothetical main size"），而非原始 flex-basis。
    let lineStart = 0
    let lineLen = 0
    for (let i = 0; i < flowChildren.length; i++) {
      const c = flowChildren[i]!
      const hypo = boundAxis(c.style, isMainRow, c._flexBasis, ownerW, ownerH)
      const outer = Math.max(0, hypo) + childMarginForAxis(c, mainAxis, ownerW)
      const withGap = i > lineStart ? gapMain : 0
      if (i > lineStart && lineLen + withGap + outer > innerMainSize) {
        lines.push(flowChildren.slice(lineStart, i))
        lineStart = i
        lineLen = outer
      } else {
        lineLen += withGap + outer
      }
      c._lineIndex = lines.length
    }
    lines.push(flowChildren.slice(lineStart))
  }
  const lineCount = lines.length
  const isBaseline = isBaselineLayout(node, flowChildren)

  // 步骤 2+3：对每行，解析弹性长度并布局子节点以
  // 测量交叉尺寸。跟踪每行消耗的主轴和最大交叉尺寸。
  const lineConsumedMain: number[] = new Array(lineCount)
  const lineCrossSizes: number[] = new Array(lineCount)
  // 基线布局跟踪每行的最大 ascent（基线 + 前导外边距），以便
  // 基线对齐的项目可以定位在 maxAscent - childBaseline 处。
  const lineMaxAscent: number[] = isBaseline ? new Array(lineCount).fill(0) : []
  let maxLineMain = 0
  let totalLinesCross = 0
  for (let li = 0; li < lineCount; li++) {
    const line = lines[li]!
    const lineGap = line.length > 1 ? gapMain * (line.length - 1) : 0
    let lineBasis = lineGap
    for (const c of line) {
      lineBasis += c._flexBasis + childMarginForAxis(c, mainAxis, ownerW)
    }
    // 根据可用的内部主轴尺寸解析弹性长度。对于有 min/max
    // 的未定义容器，根据钳制后的尺寸弹性伸缩。
    let availMain = innerMainSize
    if (!isDefined(availMain)) {
      const mainOwner = isMainRow ? ownerWidth : ownerHeight
      const minM = resolveValue(
        isMainRow ? style.minWidth : style.minHeight,
        mainOwner,
      )
      const maxM = resolveValue(
        isMainRow ? style.maxWidth : style.maxHeight,
        mainOwner,
      )
      if (isDefined(maxM) && lineBasis > maxM - mainPadBorder) {
        availMain = Math.max(0, maxM - mainPadBorder)
      } else if (isDefined(minM) && lineBasis < minM - mainPadBorder) {
        availMain = Math.max(0, minM - mainPadBorder)
      }
    }
    resolveFlexibleLengths(
      line,
      availMain,
      lineBasis,
      isMainRow,
      ownerW,
      ownerH,
    )

    // Lay out each child in this line to measure cross
    let lineCross = 0
    for (const c of line) {
      const cStyle = c.style
      const childAlign =
        cStyle.alignSelf === Align.Auto ? style.alignItems : cStyle.alignSelf
      const cMarginCross = childMarginForAxis(c, crossAx, ownerW)
      let childCrossSize = NaN
      let childCrossMode: MeasureMode = MeasureMode.Undefined
      const resolvedCrossStyle = resolveValue(
        isMainRow ? cStyle.height : cStyle.width,
        isMainRow ? ownerH : ownerW,
      )
      const crossLeadE = isMainRow ? EDGE_TOP : EDGE_LEFT
      const crossTrailE = isMainRow ? EDGE_BOTTOM : EDGE_RIGHT
      const hasCrossAutoMargin =
        c._hasAutoMargin &&
        (isMarginAuto(cStyle.margin, crossLeadE) ||
          isMarginAuto(cStyle.margin, crossTrailE))
      // 单行拉伸直接使用容器交叉尺寸。
      // 多行换行测量内在交叉尺寸（Undefined 模式），以便
      // flex-grow 的孙节点不会扩展到容器——先确定行
      // 交叉尺寸，然后重新拉伸项目。
      if (isDefined(resolvedCrossStyle)) {
        childCrossSize = resolvedCrossStyle
        childCrossMode = MeasureMode.Exactly
      } else if (
        childAlign === Align.Stretch &&
        !hasCrossAutoMargin &&
        !isWrap &&
        isDefined(innerCrossSize) &&
        crossMode === MeasureMode.Exactly
      ) {
        childCrossSize = Math.max(0, innerCrossSize - cMarginCross)
        childCrossMode = MeasureMode.Exactly
      } else if (!isWrap && isDefined(innerCrossSize)) {
        childCrossSize = Math.max(0, innerCrossSize - cMarginCross)
        childCrossMode = MeasureMode.AtMost
      }
      const cw = isMainRow ? c._mainSize : childCrossSize
      const ch = isMainRow ? childCrossSize : c._mainSize
      layoutNode(
        c,
        cw,
        ch,
        isMainRow ? MeasureMode.Exactly : childCrossMode,
        isMainRow ? childCrossMode : MeasureMode.Exactly,
        ownerW,
        ownerH,
        performLayout,
        isMainRow,
        !isMainRow,
      )
      c._crossSize = isMainRow ? c.layout.height : c.layout.width
      lineCross = Math.max(lineCross, c._crossSize + cMarginCross)
    }
    // 基线布局：行交叉尺寸必须容纳基线对齐子节点的
    // maxAscent + maxDescent（yoga 步骤 8）。仅适用于行方向。
    if (isBaseline) {
      let maxAscent = 0
      let maxDescent = 0
      for (const c of line) {
        if (resolveChildAlign(node, c) !== Align.Baseline) continue
        const mTop = resolveEdge(c.style.margin, EDGE_TOP, ownerW)
        const mBot = resolveEdge(c.style.margin, EDGE_BOTTOM, ownerW)
        const ascent = calculateBaseline(c) + mTop
        const descent = c.layout.height + mTop + mBot - ascent
        if (ascent > maxAscent) maxAscent = ascent
        if (descent > maxDescent) maxDescent = descent
      }
      lineMaxAscent[li] = maxAscent
      if (maxAscent + maxDescent > lineCross) {
        lineCross = maxAscent + maxDescent
      }
    }
    // 上面的 layoutNode(c) 已经通过 resolveEdges4Into 使用相同的 ownerW
    // 解析了 c.layout.margin[]——直接读取，无需通过
    // childMarginForAxis → 2× resolveEdge 重新解析。
    const mainLead = leadingEdge(mainAxis)
    const mainTrail = trailingEdge(mainAxis)
    let consumed = lineGap
    for (const c of line) {
      const cm = c.layout.margin
      consumed += c._mainSize + cm[mainLead]! + cm[mainTrail]!
    }
    lineConsumedMain[li] = consumed
    lineCrossSizes[li] = lineCross
    maxLineMain = Math.max(maxLineMain, consumed)
    totalLinesCross += lineCross
  }
  const totalCrossGap = lineCount > 1 ? gapCross * (lineCount - 1) : 0
  totalLinesCross += totalCrossGap

  // 步骤 4：确定容器尺寸。根据 yoga 的步骤 9，对于 AtMost（FitContent）
  // 和 Undefined（MaxContent），节点根据其内容调整大小——AtMost 不是
  // 硬性钳制，项目可能溢出可用空间（CSS "fit-content" 行为）。
  // 只有 Scroll overflow 会钳制到可用尺寸。在 AtMost 下换行为多行的
  // 换行容器填充可用主轴尺寸，因为它们在该边界处换行。
  const isScroll = style.overflow === Overflow.Scroll
  const contentMain = maxLineMain + mainPadBorder
  const finalMainSize =
    mainMode === MeasureMode.Exactly
      ? mainSize
      : mainMode === MeasureMode.AtMost && isScroll
        ? Math.max(Math.min(mainSize, contentMain), mainPadBorder)
        : isWrap && lineCount > 1 && mainMode === MeasureMode.AtMost
          ? mainSize
          : contentMain
  const contentCross = totalLinesCross + crossPadBorder
  const finalCrossSize =
    crossMode === MeasureMode.Exactly
      ? crossSize
      : crossMode === MeasureMode.AtMost && isScroll
        ? Math.max(Math.min(crossSize, contentCross), crossPadBorder)
        : contentCross
  node.layout.width = boundAxis(
    style,
    true,
    isMainRow ? finalMainSize : finalCrossSize,
    ownerWidth,
    ownerHeight,
  )
  node.layout.height = boundAxis(
    style,
    false,
    isMainRow ? finalCrossSize : finalMainSize,
    ownerWidth,
    ownerHeight,
  )
  commitCacheOutputs(node, performLayout)
  // 即使脏节点也写入缓存——虚拟滚动期间新挂载的项
  cacheWrite(
    node,
    availableWidth,
    availableHeight,
    widthMode,
    heightMode,
    ownerWidth,
    ownerHeight,
    forceWidth,
    forceHeight,
    wasDirty,
  )

  if (!performLayout) return

  // 步骤 5：定位行（align-content）和子节点（justify-content +
  // align-items + 自动外边距）。
  const actualInnerMain =
    (isMainRow ? node.layout.width : node.layout.height) - mainPadBorder
  const actualInnerCross =
    (isMainRow ? node.layout.height : node.layout.width) - crossPadBorder
  const mainLeadEdgePhys = leadingEdge(mainAxis)
  const mainTrailEdgePhys = trailingEdge(mainAxis)
  const crossLeadEdgePhys = isMainRow ? EDGE_TOP : EDGE_LEFT
  const crossTrailEdgePhys = isMainRow ? EDGE_BOTTOM : EDGE_RIGHT
  const reversed = isReverse(mainAxis)
  const mainContainerSize = isMainRow ? node.layout.width : node.layout.height
  const crossLead = pad[crossLeadEdgePhys]! + bor[crossLeadEdgePhys]!

  // Align-content：在行之间分配空闲交叉轴空间。单行容器为唯一行使用
  // 整个交叉轴尺寸（align-items 处理行内的定位）。
  let lineCrossOffset = crossLead
  let betweenLines = gapCross
  const freeCross = actualInnerCross - totalLinesCross
  if (lineCount === 1 && !isWrap && !isBaseline) {
    lineCrossSizes[0] = actualInnerCross
  } else {
    const remCross = Math.max(0, freeCross)
    switch (style.alignContent) {
      case Align.FlexStart:
        break
      case Align.Center:
        lineCrossOffset += freeCross / 2
        break
      case Align.FlexEnd:
        lineCrossOffset += freeCross
        break
      case Align.Stretch:
        if (lineCount > 0 && remCross > 0) {
          const add = remCross / lineCount
          for (let i = 0; i < lineCount; i++) lineCrossSizes[i]! += add
        }
        break
      case Align.SpaceBetween:
        if (lineCount > 1) betweenLines += remCross / (lineCount - 1)
        break
      case Align.SpaceAround:
        if (lineCount > 0) {
          betweenLines += remCross / lineCount
          lineCrossOffset += remCross / lineCount / 2
        }
        break
      case Align.SpaceEvenly:
        if (lineCount > 0) {
          betweenLines += remCross / (lineCount + 1)
          lineCrossOffset += remCross / (lineCount + 1)
        }
        break
      default:
        break
    }
  }

  // 对于 wrap-reverse，行从交叉轴尾边缘开始堆叠。按顺序遍历行，
  // 但在容器内翻转交叉轴位置。
  const wrapReverse = style.flexWrap === Wrap.WrapReverse
  const crossContainerSize = isMainRow ? node.layout.height : node.layout.width
  let lineCrossPos = lineCrossOffset
  for (let li = 0; li < lineCount; li++) {
    const line = lines[li]!
    const lineCross = lineCrossSizes[li]!
    const consumedMain = lineConsumedMain[li]!
    const n = line.length

    // 重新拉伸交叉轴为 auto 且对齐为 stretch 的子节点，现在行的交叉轴
    // 尺寸已知。多行换行需要此操作（初始测量时行交叉轴尺寸未知），
    // 以及容器交叉轴不是 Exactly 模式的单行也需要（~第 1250 行的初始
    // 拉伸被跳过，因为 innerCrossSize 未定义——容器尺寸按最大子节点交叉轴确定）。
    if (isWrap || crossMode !== MeasureMode.Exactly) {
      for (const c of line) {
        const cStyle = c.style
        const childAlign =
          cStyle.alignSelf === Align.Auto ? style.alignItems : cStyle.alignSelf
        const crossStyleDef = isDefined(
          resolveValue(
            isMainRow ? cStyle.height : cStyle.width,
            isMainRow ? ownerH : ownerW,
          ),
        )
        const hasCrossAutoMargin =
          c._hasAutoMargin &&
          (isMarginAuto(cStyle.margin, crossLeadEdgePhys) ||
            isMarginAuto(cStyle.margin, crossTrailEdgePhys))
        if (
          childAlign === Align.Stretch &&
          !crossStyleDef &&
          !hasCrossAutoMargin
        ) {
          const cMarginCross = childMarginForAxis(c, crossAx, ownerW)
          const target = Math.max(0, lineCross - cMarginCross)
          if (c._crossSize !== target) {
            const cw = isMainRow ? c._mainSize : target
            const ch = isMainRow ? target : c._mainSize
            layoutNode(
              c,
              cw,
              ch,
              MeasureMode.Exactly,
              MeasureMode.Exactly,
              ownerW,
              ownerH,
              performLayout,
              isMainRow,
              !isMainRow,
            )
            c._crossSize = target
          }
        }
      }
    }

    // 当前行的 justify-content + 自动外边距
    let mainOffset = pad[mainLeadEdgePhys]! + bor[mainLeadEdgePhys]!
    let betweenMain = gapMain
    let numAutoMarginsMain = 0
    for (const c of line) {
      if (!c._hasAutoMargin) continue
      if (isMarginAuto(c.style.margin, mainLeadEdgePhys)) numAutoMarginsMain++
      if (isMarginAuto(c.style.margin, mainTrailEdgePhys)) numAutoMarginsMain++
    }
    const freeMain = actualInnerMain - consumedMain
    const remainingMain = Math.max(0, freeMain)
    const autoMarginMainSize =
      numAutoMarginsMain > 0 && remainingMain > 0
        ? remainingMain / numAutoMarginsMain
        : 0
    if (numAutoMarginsMain === 0) {
      switch (style.justifyContent) {
        case Justify.FlexStart:
          break
        case Justify.Center:
          mainOffset += freeMain / 2
          break
        case Justify.FlexEnd:
          mainOffset += freeMain
          break
        case Justify.SpaceBetween:
          if (n > 1) betweenMain += remainingMain / (n - 1)
          break
        case Justify.SpaceAround:
          if (n > 0) {
            betweenMain += remainingMain / n
            mainOffset += remainingMain / n / 2
          }
          break
        case Justify.SpaceEvenly:
          if (n > 0) {
            betweenMain += remainingMain / (n + 1)
            mainOffset += remainingMain / (n + 1)
          }
          break
      }
    }

    const effectiveLineCrossPos = wrapReverse
      ? crossContainerSize - lineCrossPos - lineCross
      : lineCrossPos

    let pos = mainOffset
    for (const c of line) {
      const cMargin = c.style.margin
      // c.layout.margin[] 已由上方 layoutNode(c) 调用内的 resolveEdges4Into
      // 填充（相同 ownerW）。直接读取已解析的值，而不是通过 resolveEdge
      // 重新运行 4 次边缘回退链。自动外边距在 layout.margin 中解析为 0，
      // 因此 autoMarginMainSize 替换仍使用 isMarginAuto 对 style 进行检查。
      const cLayoutMargin = c.layout.margin
      let autoMainLead = false
      let autoMainTrail = false
      let autoCrossLead = false
      let autoCrossTrail = false
      let mMainLead: number
      let mMainTrail: number
      let mCrossLead: number
      let mCrossTrail: number
      if (c._hasAutoMargin) {
        autoMainLead = isMarginAuto(cMargin, mainLeadEdgePhys)
        autoMainTrail = isMarginAuto(cMargin, mainTrailEdgePhys)
        autoCrossLead = isMarginAuto(cMargin, crossLeadEdgePhys)
        autoCrossTrail = isMarginAuto(cMargin, crossTrailEdgePhys)
        mMainLead = autoMainLead
          ? autoMarginMainSize
          : cLayoutMargin[mainLeadEdgePhys]!
        mMainTrail = autoMainTrail
          ? autoMarginMainSize
          : cLayoutMargin[mainTrailEdgePhys]!
        mCrossLead = autoCrossLead ? 0 : cLayoutMargin[crossLeadEdgePhys]!
        mCrossTrail = autoCrossTrail ? 0 : cLayoutMargin[crossTrailEdgePhys]!
      } else {
        // 快速路径：无自动外边距——直接读取已解析的值。
        mMainLead = cLayoutMargin[mainLeadEdgePhys]!
        mMainTrail = cLayoutMargin[mainTrailEdgePhys]!
        mCrossLead = cLayoutMargin[crossLeadEdgePhys]!
        mCrossTrail = cLayoutMargin[crossTrailEdgePhys]!
      }

      const mainPos = reversed
        ? mainContainerSize - (pos + mMainLead) - c._mainSize
        : pos + mMainLead

      const childAlign =
        c.style.alignSelf === Align.Auto ? style.alignItems : c.style.alignSelf
      let crossPos = effectiveLineCrossPos + mCrossLead
      const crossFree = lineCross - c._crossSize - mCrossLead - mCrossTrail
      if (autoCrossLead && autoCrossTrail) {
        crossPos += Math.max(0, crossFree) / 2
      } else if (autoCrossLead) {
        crossPos += Math.max(0, crossFree)
      } else if (autoCrossTrail) {
        // stays at leading
      } else {
        switch (childAlign) {
          case Align.FlexStart:
          case Align.Stretch:
            if (wrapReverse) crossPos += crossFree
            break
          case Align.Center:
            crossPos += crossFree / 2
            break
          case Align.FlexEnd:
            if (!wrapReverse) crossPos += crossFree
            break
          case Align.Baseline:
            // 仅行方向（isBaselineLayout 已验证）。定位使得子节点的
            // 基线与该行的最大上升对齐。根据 yoga：
            // top = currentLead + maxAscent - childBaseline + leadingPosition。
            if (isBaseline) {
              crossPos =
                effectiveLineCrossPos +
                lineMaxAscent[li]! -
                calculateBaseline(c)
            }
            break
          default:
            break
        }
      }

      // 相对定位偏移。快速路径：未设置 position 偏移 →
      // 跳过 4× resolveEdgeRaw + 4× resolveValue + 4× isDefined。
      let relX = 0
      let relY = 0
      if (c._hasPosition) {
        const relLeft = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_LEFT),
          ownerW,
        )
        const relRight = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_RIGHT),
          ownerW,
        )
        const relTop = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_TOP),
          ownerW,
        )
        const relBottom = resolveValue(
          resolveEdgeRaw(c.style.position, EDGE_BOTTOM),
          ownerW,
        )
        relX = isDefined(relLeft)
          ? relLeft
          : isDefined(relRight)
            ? -relRight
            : 0
        relY = isDefined(relTop)
          ? relTop
          : isDefined(relBottom)
            ? -relBottom
            : 0
      }

      if (isMainRow) {
        c.layout.left = mainPos + relX
        c.layout.top = crossPos + relY
      } else {
        c.layout.left = crossPos + relX
        c.layout.top = mainPos + relY
      }
      pos += c._mainSize + mMainLead + mMainTrail + betweenMain
    }
    lineCrossPos += lineCross + betweenLines
  }

  // 步骤 6：绝对定位的子节点
  for (const c of absChildren) {
    layoutAbsoluteChild(
      node,
      c,
      node.layout.width,
      node.layout.height,
      pad,
      bor,
    )
  }
}

function layoutAbsoluteChild(
  parent: Node,
  child: Node,
  parentWidth: number,
  parentHeight: number,
  pad: [number, number, number, number],
  bor: [number, number, number, number],
): void {
  const cs = child.style
  const posLeft = resolveEdgeRaw(cs.position, EDGE_LEFT)
  const posRight = resolveEdgeRaw(cs.position, EDGE_RIGHT)
  const posTop = resolveEdgeRaw(cs.position, EDGE_TOP)
  const posBottom = resolveEdgeRaw(cs.position, EDGE_BOTTOM)

  const rLeft = resolveValue(posLeft, parentWidth)
  const rRight = resolveValue(posRight, parentWidth)
  const rTop = resolveValue(posTop, parentHeight)
  const rBottom = resolveValue(posBottom, parentHeight)

  // 绝对定位子节点的百分比尺寸相对于包含块的 padding-box 解析
  //（父尺寸减去边框），参见 CSS §10.1。
  const paddingBoxW = parentWidth - bor[0] - bor[2]
  const paddingBoxH = parentHeight - bor[1] - bor[3]
  let cw = resolveValue(cs.width, paddingBoxW)
  let ch = resolveValue(cs.height, paddingBoxH)

  // 如果同时定义了 left+right 但未定义 width，推算 width
  if (!isDefined(cw) && isDefined(rLeft) && isDefined(rRight)) {
    cw = paddingBoxW - rLeft - rRight
  }
  if (!isDefined(ch) && isDefined(rTop) && isDefined(rBottom)) {
    ch = paddingBoxH - rTop - rBottom
  }

  layoutNode(
    child,
    cw,
    ch,
    isDefined(cw) ? MeasureMode.Exactly : MeasureMode.Undefined,
    isDefined(ch) ? MeasureMode.Exactly : MeasureMode.Undefined,
    paddingBoxW,
    paddingBoxH,
    true,
  )

  // 绝对定位子节点的外边距（在 inset 之上额外应用）
  const mL = resolveEdge(cs.margin, EDGE_LEFT, parentWidth)
  const mT = resolveEdge(cs.margin, EDGE_TOP, parentWidth)
  const mR = resolveEdge(cs.margin, EDGE_RIGHT, parentWidth)
  const mB = resolveEdge(cs.margin, EDGE_BOTTOM, parentWidth)

  const mainAxis = parent.style.flexDirection
  const reversed = isReverse(mainAxis)
  const mainRow = isRow(mainAxis)
  const wrapReverse = parent.style.flexWrap === Wrap.WrapReverse
  // alignSelf 覆盖绝对定位子节点的 alignItems（与流式子节点相同）
  const alignment =
    cs.alignSelf === Align.Auto ? parent.style.alignItems : cs.alignSelf

  // 定位
  let left: number
  if (isDefined(rLeft)) {
    left = bor[0] + rLeft + mL
  } else if (isDefined(rRight)) {
    left = parentWidth - bor[2] - rRight - child.layout.width - mR
  } else if (mainRow) {
    // 主轴——justify-content，反转模式下翻转
    const lead = pad[0] + bor[0]
    const trail = parentWidth - pad[2] - bor[2]
    left = reversed
      ? trail - child.layout.width - mR
      : justifyAbsolute(
          parent.style.justifyContent,
          lead,
          trail,
          child.layout.width,
        ) + mL
  } else {
    left =
      alignAbsolute(
        alignment,
        pad[0] + bor[0],
        parentWidth - pad[2] - bor[2],
        child.layout.width,
        wrapReverse,
      ) + mL
  }

  let top: number
  if (isDefined(rTop)) {
    top = bor[1] + rTop + mT
  } else if (isDefined(rBottom)) {
    top = parentHeight - bor[3] - rBottom - child.layout.height - mB
  } else if (mainRow) {
    top =
      alignAbsolute(
        alignment,
        pad[1] + bor[1],
        parentHeight - pad[3] - bor[3],
        child.layout.height,
        wrapReverse,
      ) + mT
  } else {
    const lead = pad[1] + bor[1]
    const trail = parentHeight - pad[3] - bor[3]
    top = reversed
      ? trail - child.layout.height - mB
      : justifyAbsolute(
          parent.style.justifyContent,
          lead,
          trail,
          child.layout.height,
        ) + mT
  }

  child.layout.left = left
  child.layout.top = top
}

function justifyAbsolute(
  justify: Justify,
  leadEdge: number,
  trailEdge: number,
  childSize: number,
): number {
  switch (justify) {
    case Justify.Center:
      return leadEdge + (trailEdge - leadEdge - childSize) / 2
    case Justify.FlexEnd:
      return trailEdge - childSize
    default:
      return leadEdge
  }
}

function alignAbsolute(
  align: Align,
  leadEdge: number,
  trailEdge: number,
  childSize: number,
  wrapReverse: boolean,
): number {
  // Wrap-reverse 翻转交叉轴：flex-start/stretch 对应尾边缘，
  // flex-end 对应首边缘（yoga 的 absoluteLayoutChild 在包含块
  // 具有 wrap-reverse 时翻转 align 值）。
  switch (align) {
    case Align.Center:
      return leadEdge + (trailEdge - leadEdge - childSize) / 2
    case Align.FlexEnd:
      return wrapReverse ? leadEdge : trailEdge - childSize
    default:
      return wrapReverse ? trailEdge - childSize : leadEdge
  }
}

function computeFlexBasis(
  child: Node,
  mainAxis: FlexDirection,
  availableMain: number,
  availableCross: number,
  crossMode: MeasureMode,
  ownerWidth: number,
  ownerHeight: number,
): number {
  // 同代缓存命中：flex-basis 在本次 calculateLayout 中已计算，
  // 因此无论 isDirty_ 如何都是新鲜的。涵盖干净的子节点（滚动经过未
  // 更改的消息）和新挂载的脏子节点（虚拟滚动挂载新条目——脏链的
  // measure→layout 级联在本次 calculateLayout 内调用此函数 ≥2^深度 次，
  // 但子节点的子树在调用之间不会变化）。对于具有前一代缓存的干净
  // 子节点，如果输入匹配也可命中——isDirty_ 进行门控，
  // 因为脏子节点前一代的缓存已过期。
  const sameGen = child._fbGen === _generation
  if (
    (sameGen || !child.isDirty_) &&
    child._fbCrossMode === crossMode &&
    sameFloat(child._fbOwnerW, ownerWidth) &&
    sameFloat(child._fbOwnerH, ownerHeight) &&
    sameFloat(child._fbAvailMain, availableMain) &&
    sameFloat(child._fbAvailCross, availableCross)
  ) {
    return child._fbBasis
  }
  const cs = child.style
  const isMainRow = isRow(mainAxis)

  // 显式 flex-basis
  const basis = resolveValue(cs.flexBasis, availableMain)
  if (isDefined(basis)) {
    const b = Math.max(0, basis)
    child._fbBasis = b
    child._fbOwnerW = ownerWidth
    child._fbOwnerH = ownerHeight
    child._fbAvailMain = availableMain
    child._fbAvailCross = availableCross
    child._fbCrossMode = crossMode
    child._fbGen = _generation
    return b
  }

  // 主轴上的样式尺寸
  const mainStyleDim = isMainRow ? cs.width : cs.height
  const mainOwner = isMainRow ? ownerWidth : ownerHeight
  const resolved = resolveValue(mainStyleDim, mainOwner)
  if (isDefined(resolved)) {
    const b = Math.max(0, resolved)
    child._fbBasis = b
    child._fbOwnerW = ownerWidth
    child._fbOwnerH = ownerHeight
    child._fbAvailMain = availableMain
    child._fbAvailCross = availableCross
    child._fbCrossMode = crossMode
    child._fbGen = _generation
    return b
  }

  // 需要测量子节点以获取其自然尺寸
  const crossStyleDim = isMainRow ? cs.height : cs.width
  const crossOwner = isMainRow ? ownerHeight : ownerWidth
  let crossConstraint = resolveValue(crossStyleDim, crossOwner)
  let crossConstraintMode: MeasureMode = isDefined(crossConstraint)
    ? MeasureMode.Exactly
    : MeasureMode.Undefined
  if (!isDefined(crossConstraint) && isDefined(availableCross)) {
    crossConstraint = availableCross
    crossConstraintMode =
      crossMode === MeasureMode.Exactly && isStretchAlign(child)
        ? MeasureMode.Exactly
        : MeasureMode.AtMost
  }

  // 上游 yoga（YGNodeComputeFlexBasisForChild）在子树将调用 measure-func
  // 时传递可用内部宽度和 AtMost 模式——这样文本节点不会将无约束的固有宽度
  // 报告为 flex-basis，否则会强制兄弟节点收缩且文本在错误的宽度处换行。
  // 在此传递 Undefined 曾导致 Ink 的 <Text> 在 <Box flexGrow={1}> 内获得
  // width = 固有宽度而非可用宽度，导致换行边界处字符丢失。
  //
  // 此规则的适用条件有两个：
  //   - 仅限宽度。高度在 flex-basis 测量期间从不约束——列容器必须以自然
  //     高度测量子节点，以便可滚动内容能够溢出（约束高度会裁剪 ScrollBox）。
  //   - 子树具有 measure-func。纯布局子树（无 measure-func）包含 flex-grow
  //     子节点会增长到 AtMost 约束内，导致 flex-basis 膨胀（破坏了
  //     YGMinMaxDimensionTest flex_grow_in_at_most，其中 flexGrow:1 的子节点
  //     应保持 basis 为 0，而不是增长到 100）。
  let mainConstraint = NaN
  let mainConstraintMode: MeasureMode = MeasureMode.Undefined
  if (isMainRow && isDefined(availableMain) && hasMeasureFuncInSubtree(child)) {
    mainConstraint = availableMain
    mainConstraintMode = MeasureMode.AtMost
  }

  const mw = isMainRow ? mainConstraint : crossConstraint
  const mh = isMainRow ? crossConstraint : mainConstraint
  const mwMode = isMainRow ? mainConstraintMode : crossConstraintMode
  const mhMode = isMainRow ? crossConstraintMode : mainConstraintMode

  layoutNode(child, mw, mh, mwMode, mhMode, ownerWidth, ownerHeight, false)
  const b = isMainRow ? child.layout.width : child.layout.height
  child._fbBasis = b
  child._fbOwnerW = ownerWidth
  child._fbOwnerH = ownerHeight
  child._fbAvailMain = availableMain
  child._fbAvailCross = availableCross
  child._fbCrossMode = crossMode
  child._fbGen = _generation
  return b
}

function hasMeasureFuncInSubtree(node: Node): boolean {
  if (node.measureFunc) return true
  for (const c of node.children) {
    if (hasMeasureFuncInSubtree(c)) return true
  }
  return false
}

function resolveFlexibleLengths(
  children: Node[],
  availableInnerMain: number,
  totalFlexBasis: number,
  isMainRow: boolean,
  ownerW: number,
  ownerH: number,
): void {
  // 根据 CSS flexbox 规范 §9.7 "解析弹性长度" 的多轮 flex 分配：
  // 分配空闲空间，检测最小/最大违规，冻结所有违规者，
  // 在未冻结的子节点之间重新分配。重复直到稳定。
  const n = children.length
  const frozen: boolean[] = new Array(n).fill(false)
  const initialFree = isDefined(availableInnerMain)
    ? availableInnerMain - totalFlexBasis
    : 0
  // 冻结非弹性项，保持其钳制后的 basis
  for (let i = 0; i < n; i++) {
    const c = children[i]!
    const clamped = boundAxis(c.style, isMainRow, c._flexBasis, ownerW, ownerH)
    const inflexible =
      !isDefined(availableInnerMain) ||
      (initialFree >= 0 ? c.style.flexGrow === 0 : c.style.flexShrink === 0)
    if (inflexible) {
      c._mainSize = Math.max(0, clamped)
      frozen[i] = true
    } else {
      c._mainSize = c._flexBasis
    }
  }
  // 迭代分配直到无违规。每次重新计算空闲空间：初始空闲空间减去
  // 已冻结子节点在其 basis 之上（或之下）消耗的增量。
  const unclamped: number[] = new Array(n)
  for (let iter = 0; iter <= n; iter++) {
    let frozenDelta = 0
    let totalGrow = 0
    let totalShrinkScaled = 0
    let unfrozenCount = 0
    for (let i = 0; i < n; i++) {
      const c = children[i]!
      if (frozen[i]) {
        frozenDelta += c._mainSize - c._flexBasis
      } else {
        totalGrow += c.style.flexGrow
        totalShrinkScaled += c.style.flexShrink * c._flexBasis
        unfrozenCount++
      }
    }
    if (unfrozenCount === 0) break
    let remaining = initialFree - frozenDelta
    // 规范 §9.7 步骤 4c：如果 flex 因子之和 < 1，仅分配
    // initialFree × 总和，而非全部剩余空间（部分 flex）。
    if (remaining > 0 && totalGrow > 0 && totalGrow < 1) {
      const scaled = initialFree * totalGrow
      if (scaled < remaining) remaining = scaled
    } else if (remaining < 0 && totalShrinkScaled > 0) {
      let totalShrink = 0
      for (let i = 0; i < n; i++) {
        if (!frozen[i]) totalShrink += children[i]!.style.flexShrink
      }
      if (totalShrink < 1) {
        const scaled = initialFree * totalShrink
        if (scaled > remaining) remaining = scaled
      }
    }
    // 计算所有未冻结子节点的目标值 + 违规值
    let totalViolation = 0
    for (let i = 0; i < n; i++) {
      if (frozen[i]) continue
      const c = children[i]!
      let t = c._flexBasis
      if (remaining > 0 && totalGrow > 0) {
        t += (remaining * c.style.flexGrow) / totalGrow
      } else if (remaining < 0 && totalShrinkScaled > 0) {
        t +=
          (remaining * (c.style.flexShrink * c._flexBasis)) / totalShrinkScaled
      }
      unclamped[i] = t
      const clamped = Math.max(
        0,
        boundAxis(c.style, isMainRow, t, ownerW, ownerH),
      )
      c._mainSize = clamped
      totalViolation += clamped - t
    }
    // 根据规范 §9.7 步骤 5 冻结：若 totalViolation 为零则全部冻结；
    // 若为正则冻结最小违规者；若为负则冻结最大违规者。
    if (totalViolation === 0) break
    let anyFrozen = false
    for (let i = 0; i < n; i++) {
      if (frozen[i]) continue
      const v = children[i]!._mainSize - unclamped[i]!
      if ((totalViolation > 0 && v > 0) || (totalViolation < 0 && v < 0)) {
        frozen[i] = true
        anyFrozen = true
      }
    }
    if (!anyFrozen) break
  }
}

function isStretchAlign(child: Node): boolean {
  const p = child.parent
  if (!p) return false
  const align =
    child.style.alignSelf === Align.Auto
      ? p.style.alignItems
      : child.style.alignSelf
  return align === Align.Stretch
}

function resolveChildAlign(parent: Node, child: Node): Align {
  return child.style.alignSelf === Align.Auto
    ? parent.style.alignItems
    : child.style.alignSelf
}

// 根据 CSS Flexbox §8.5 / yoga 的 YGBaseline 计算节点基线。叶节点
//（无子节点）使用自身高度。容器递归到第一行中第一个基线对齐的
// 子节点（如果没有基线对齐的子节点，则使用第一个流式子节点），
// 返回该子节点的基线 + 其顶部偏移。
function calculateBaseline(node: Node): number {
  let baselineChild: Node | null = null
  for (const c of node.children) {
    if (c._lineIndex > 0) break
    if (c.style.positionType === PositionType.Absolute) continue
    if (c.style.display === Display.None) continue
    if (
      resolveChildAlign(node, c) === Align.Baseline ||
      c.isReferenceBaseline_
    ) {
      baselineChild = c
      break
    }
    if (baselineChild === null) baselineChild = c
  }
  if (baselineChild === null) return node.layout.height
  return calculateBaseline(baselineChild) + baselineChild.layout.top
}

// 容器仅在行方向、且 align-items 为 baseline 或任何流式子节点
// 具有 align-self: baseline 时使用基线布局。
function isBaselineLayout(node: Node, flowChildren: Node[]): boolean {
  if (!isRow(node.style.flexDirection)) return false
  if (node.style.alignItems === Align.Baseline) return true
  for (const c of flowChildren) {
    if (c.style.alignSelf === Align.Baseline) return true
  }
  return false
}

function childMarginForAxis(
  child: Node,
  axis: FlexDirection,
  ownerWidth: number,
): number {
  if (!child._hasMargin) return 0
  const lead = resolveEdge(child.style.margin, leadingEdge(axis), ownerWidth)
  const trail = resolveEdge(child.style.margin, trailingEdge(axis), ownerWidth)
  return lead + trail
}

function resolveGap(style: Style, gutter: Gutter, ownerSize: number): number {
  let v = style.gap[gutter]!
  if (v.unit === Unit.Undefined) v = style.gap[Gutter.All]!
  const r = resolveValue(v, ownerSize)
  return isDefined(r) ? Math.max(0, r) : 0
}

function boundAxis(
  style: Style,
  isWidth: boolean,
  value: number,
  ownerWidth: number,
  ownerHeight: number,
): number {
  const minV = isWidth ? style.minWidth : style.minHeight
  const maxV = isWidth ? style.maxWidth : style.maxHeight
  const minU = minV.unit
  const maxU = maxV.unit
  // 快速路径：未设置 min/max 约束。根据 CPU 分析，这是绝对常见情况
  //（在 1000 节点基准测试中约 32k 次调用/布局，几乎所有 min/max 都
  // 未定义）——跳过总是无操作的 2× resolveValue + 2× isNaN
  // Unit.Undefined = 0。
  if (minU === 0 && maxU === 0) return value
  const owner = isWidth ? ownerWidth : ownerHeight
  let v = value
  // 内联 resolveValue：Unit.Point=1，Unit.Percent=2。`m === m` 即 !isNaN。
  if (maxU === 1) {
    if (v > maxV.value) v = maxV.value
  } else if (maxU === 2) {
    const m = (maxV.value * owner) / 100
    if (m === m && v > m) v = m
  }
  if (minU === 1) {
    if (v < minV.value) v = minV.value
  } else if (minU === 2) {
    const m = (minV.value * owner) / 100
    if (m === m && v < m) v = m
  }
  return v
}

function zeroLayoutRecursive(node: Node): void {
  for (const c of node.children) {
    c.layout.left = 0
    c.layout.top = 0
    c.layout.width = 0
    c.layout.height = 0
    // 使布局缓存失效——否则，取消隐藏后 calculateLayout 发现子节点
    // 是干净的（!isDirty_）且 _hasL 完好，命中 ~第 1086 行的缓存，
    // 恢复过期的 _lOutW/_lOutH，并提前返回——跳过子节点定位递归。
    // 孙节点保持在上方归零的 (0,0,0,0) 状态，渲染为不可见。
    // isDirty_=true 还通过 (sameGen || !isDirty_) 检查门控 _cN 和
    // _fbBasis——_cGen/_fbGen 在隐藏期间冻结，因此取消隐藏时 sameGen 为 false。
    c.isDirty_ = true
    c._hasL = false
    c._hasM = false
    zeroLayoutRecursive(c)
  }
}

function collectLayoutChildren(node: Node, flow: Node[], abs: Node[]): void {
  // 将节点的子节点划分为流式列表和绝对定位列表，展平
  // display:contents 子树，使其子节点作为此节点的直接子节点进行
  // 布局（根据 CSS display:contents 规范——该盒子从布局树中移除，
  // 但其子节点保留，提升到祖父级）。
  for (const c of node.children) {
    const disp = c.style.display
    if (disp === Display.None) {
      c.layout.left = 0
      c.layout.top = 0
      c.layout.width = 0
      c.layout.height = 0
      zeroLayoutRecursive(c)
    } else if (disp === Display.Contents) {
      c.layout.left = 0
      c.layout.top = 0
      c.layout.width = 0
      c.layout.height = 0
      // 递归——嵌套的 display:contents 一直向上提升。contents
      // 节点自身的外边距/内边距/定位/尺寸被忽略。
      collectLayoutChildren(c, flow, abs)
    } else if (c.style.positionType === PositionType.Absolute) {
      abs.push(c)
    } else {
      flow.push(c)
    }
  }
}

function roundLayout(
  node: Node,
  scale: number,
  absLeft: number,
  absTop: number,
): void {
  if (scale === 0) return
  const l = node.layout
  const nodeLeft = l.left
  const nodeTop = l.top
  const nodeWidth = l.width
  const nodeHeight = l.height

  const absNodeLeft = absLeft + nodeLeft
  const absNodeTop = absTop + nodeTop

  // 上游 YGRoundValueToPixelGrid：文本节点（有 measureFunc）对其位置
  // 向下取整，以便换行文本永远不会超出其分配的列。宽度使用 ceil-if-fractional
  // 以避免裁剪最后一个字形。非文本节点使用标准四舍五入。与 yoga 的
  // PixelGrid.cpp 匹配——没有此逻辑，justify center/space-evenly 的
  // 位置与 WASM 相比会有 1 像素偏差，且 flex-shrink 溢出会将兄弟节点
  // 放在错误的列上。
  const isText = node.measureFunc !== null
  l.left = roundValue(nodeLeft, scale, false, isText)
  l.top = roundValue(nodeTop, scale, false, isText)

  // 宽度/高度通过绝对边缘四舍五入以避免累积漂移
  const absRight = absNodeLeft + nodeWidth
  const absBottom = absNodeTop + nodeHeight
  const hasFracW = !isWholeNumber(nodeWidth * scale)
  const hasFracH = !isWholeNumber(nodeHeight * scale)
  l.width =
    roundValue(absRight, scale, isText && hasFracW, isText && !hasFracW) -
    roundValue(absNodeLeft, scale, false, isText)
  l.height =
    roundValue(absBottom, scale, isText && hasFracH, isText && !hasFracH) -
    roundValue(absNodeTop, scale, false, isText)

  for (const c of node.children) {
    roundLayout(c, scale, absNodeLeft, absNodeTop)
  }
}

function isWholeNumber(v: number): boolean {
  const frac = v - Math.floor(v)
  return frac < 0.0001 || frac > 0.9999
}

function roundValue(
  v: number,
  scale: number,
  forceCeil: boolean,
  forceFloor: boolean,
): number {
  let scaled = v * scale
  let frac = scaled - Math.floor(scaled)
  if (frac < 0) frac += 1
  // 浮点 epsilon 容差匹配上游 YGDoubleEqual（1e-4）
  if (frac < 0.0001) {
    scaled = Math.floor(scaled)
  } else if (frac > 0.9999) {
    scaled = Math.ceil(scaled)
  } else if (forceCeil) {
    scaled = Math.ceil(scaled)
  } else if (forceFloor) {
    scaled = Math.floor(scaled)
  } else {
    // 四舍五入（>= 0.5 向上取整），与上游一致
    scaled = Math.floor(scaled) + (frac >= 0.4999 ? 1 : 0)
  }
  return scaled / scale
}

// --
// 辅助函数

function parseDimension(v: number | string | undefined): Value {
  if (v === undefined) return UNDEFINED_VALUE
  if (v === 'auto') return AUTO_VALUE
  if (typeof v === 'number') {
    // WASM yoga 的 YGFloatIsUndefined 将 NaN 和 ±Infinity 视为未定义。
    // Ink 传递 height={Infinity}（例如 LogSelector 的 maxHeight 默认值）
    // 并期望其表示"无约束"——将其存储为字面量 point 值会使节点高度
    // 变为 Infinity 并破坏所有下游布局。
    return Number.isFinite(v) ? pointValue(v) : UNDEFINED_VALUE
  }
  if (typeof v === 'string' && v.endsWith('%')) {
    return percentValue(parseFloat(v))
  }
  const n = parseFloat(v)
  return isNaN(n) ? UNDEFINED_VALUE : pointValue(n)
}

function physicalEdge(edge: Edge): number {
  switch (edge) {
    case Edge.Left:
    case Edge.Start:
      return EDGE_LEFT
    case Edge.Top:
      return EDGE_TOP
    case Edge.Right:
    case Edge.End:
      return EDGE_RIGHT
    case Edge.Bottom:
      return EDGE_BOTTOM
    default:
      return EDGE_LEFT
  }
}

// --
// 模块 API，匹配 yoga-layout/load

export type Yoga = {
  Config: {
    create(): Config
    destroy(config: Config): void
  }
  Node: {
    create(config?: Config): Node
    createDefault(): Node
    createWithConfig(config: Config): Node
    destroy(node: Node): void
  }
}

const YOGA_INSTANCE: Yoga = {
  Config: {
    create: createConfig,
    destroy() {},
  },
  Node: {
    create: (config?: Config) => new Node(config),
    createDefault: () => new Node(),
    createWithConfig: (config: Config) => new Node(config),
    destroy() {},
  },
}

export function loadYoga(): Promise<Yoga> {
  return Promise.resolve(YOGA_INSTANCE)
}

export default YOGA_INSTANCE

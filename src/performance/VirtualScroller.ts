/**
 * 虚拟滚动管理器
 * 文件：src/performance/VirtualScroller.ts
 * 文档 17 §7.1
 */

export interface VirtualScrollItem {
  index: number;
  offset: number;
  size: number;
}

export interface VirtualScrollConfig {
  itemHeight: number | ((index: number) => number);
  viewportHeight: number;
  overscan: number;
}

export class VirtualScroller<T> {
  private items: T[] = [];
  private config: VirtualScrollConfig;
  private scrollTop: number = 0;

  constructor(config: Partial<VirtualScrollConfig> = {}) {
    this.config = {
      itemHeight: 24,
      viewportHeight: 600,
      overscan: 5,
      ...config,
    };
  }

  /**
   * 设置项目
   */
  setItems(items: T[]): void {
    this.items = items;
  }

  /**
   * 设置滚动位置
   */
  setScrollTop(scrollTop: number): void {
    this.scrollTop = Math.max(0, scrollTop);
  }

  /**
   * 获取可见项目
   */
  getVisibleItems(): VirtualScrollItem[] {
    const visibleItems: VirtualScrollItem[] = [];
    const startIndex = this.getStartIndex();
    const endIndex = this.getEndIndex(startIndex);

    for (let i = startIndex; i <= endIndex && i < this.items.length; i++) {
      visibleItems.push({
        index: i,
        offset: this.getOffsetForIndex(i),
        size: this.getItemHeight(i),
      });
    }

    return visibleItems;
  }

  /**
   * 获取总高度
   */
  getTotalHeight(): number {
    let total = 0;
    for (let i = 0; i < this.items.length; i++) {
      total += this.getItemHeight(i);
    }
    return total;
  }

  /**
   * 获取起始索引
   */
  private getStartIndex(): number {
    if (typeof this.config.itemHeight === 'number') {
      return Math.max(0, Math.floor(this.scrollTop / this.config.itemHeight) - this.config.overscan);
    }

    // 可变高度
    let offset = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (offset + this.getItemHeight(i) > this.scrollTop - this.config.overscan * 24) {
        return Math.max(0, i);
      }
      offset += this.getItemHeight(i);
    }
    return 0;
  }

  /**
   * 获取结束索引
   */
  private getEndIndex(startIndex: number): number {
    if (typeof this.config.itemHeight === 'number') {
      const visibleCount = Math.ceil(this.config.viewportHeight / this.config.itemHeight);
      return Math.min(this.items.length - 1, startIndex + visibleCount + this.config.overscan * 2);
    }

    // 可变高度
    let offset = this.getOffsetForIndex(startIndex);
    const targetOffset = this.scrollTop + this.config.viewportHeight + this.config.overscan * 24;

    for (let i = startIndex; i < this.items.length; i++) {
      offset += this.getItemHeight(i);
      if (offset >= targetOffset) {
        return i;
      }
    }
    return this.items.length - 1;
  }

  /**
   * 获取项目高度
   */
  private getItemHeight(index: number): number {
    if (typeof this.config.itemHeight === 'number') {
      return this.config.itemHeight;
    }
    return this.config.itemHeight(index);
  }

  /**
   * 获取项目偏移量
   */
  private getOffsetForIndex(index: number): number {
    if (typeof this.config.itemHeight === 'number') {
      return index * this.config.itemHeight;
    }

    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += this.getItemHeight(i);
    }
    return offset;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<VirtualScrollConfig>): void {
    this.config = { ...this.config, ...updates };
  }
} 

/**
 * 懒加载管理器
 * 文件：src/performance/LazyLoader.ts
 * 文档 17 §2.1
 */

export interface LazyModule<T> {
  loaded: boolean;
  module: T | null;
  load: () => Promise<T>;
}

export class LazyLoader {
  private modules: Map<string, LazyModule<any>> = new Map();
  private loadingPromises: Map<string, Promise<any>> = new Map();

  /**
   * 注册懒加载模块
   */
  register<T>(name: string, loader: () => Promise<T>): void {
    this.modules.set(name, {
      loaded: false,
      module: null,
      load: async () => {
        if (this.loadingPromises.has(name)) {
          return this.loadingPromises.get(name);
        }

        const promise = loader().then((module) => {
          const lazyModule = this.modules.get(name);
          if (lazyModule) {
            lazyModule.loaded = true;
            lazyModule.module = module;
          }
          this.loadingPromises.delete(name);
          return module;
        });

        this.loadingPromises.set(name, promise);
        return promise;
      },
    });
  }

  /**
   * 加载模块
   */
  async load<T>(name: string): Promise<T> {
    const lazyModule = this.modules.get(name);
    if (!lazyModule) {
      throw new Error(`Module ${name} not registered`);
    }

    if (lazyModule.loaded) {
      return lazyModule.module as T;
    }

    return lazyModule.load() as Promise<T>;
  }

  /**
   * 预加载模块
   */
  async preload(names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this.load(name).catch(() => null)));
  }

  /**
   * 检查模块是否已加载
   */
  isLoaded(name: string): boolean {
    return this.modules.get(name)?.loaded || false;
  }

  /**
   * 卸载模块
   */
  unload(name: string): void {
    const lazyModule = this.modules.get(name);
    if (lazyModule) {
      lazyModule.loaded = false;
      lazyModule.module = null;
    }
  }

  /**
   * 获取加载状态
   */
  getLoadStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [name, module] of this.modules.entries()) {
      status[name] = module.loaded;
    }
    return status;
  }
}

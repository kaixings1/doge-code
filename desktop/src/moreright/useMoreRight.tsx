// 外部构建的桩代码——真正的 hook 仅在内部使用。
// 分隔符
// 自包含：无相对导入。类型检查器在 overlay 之前看到此文件位于
// scripts/external-stubs/src/moreright/ 下，而 ../types/
// 会解析到 scripts/external-stubs/src/types/（不存在）。

 
type M = any;
export function useMoreRight(_args: {
  enabled: boolean;
  setMessages: (action: M[] | ((prev: M[]) => M[])) => void;
  inputValue: string;
  setInputValue: (s: string) => void;
  setToolJSX: (args: M) => void;
}): {
  onBeforeQuery: (input: string, all: M[], n: number) => Promise<boolean>;
  onTurnComplete: (all: M[], aborted: boolean) => Promise<void>;
  render: () => null;
} {
  return {
    onBeforeQuery: async () => true,
    onTurnComplete: async () => {},
    render: () => null
  };
}

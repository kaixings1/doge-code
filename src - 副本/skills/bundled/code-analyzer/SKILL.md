# SKILL.md

## 代码分析技能 (code-analyzer)

### 功能说明

该技能用于**深度分析 TypeScript/TypeScript (.ts, .tsx) 文件**，生成详细的分析报告。

#### 核心能力

1. **自动解析** - 识别文件中的类、函数、接口、类型定义
2. **依赖追踪** - 构建模块间的导入关系图
3. **调用链分析** - 追踪函数的调用路径和依赖顺序
4. **架构模式识别** - 检测设计模式和架构风格
5. **代码质量评估** - 发现潜在问题（重复、冗余、复杂度过高）

### 使用场景

当用户需要深入了解代码库结构时，使用该技能：

- "帮我分析一下整个项目的架构"
- "这个文件里的函数是怎么调用的？"
- "找出所有使用了某个接口的模块"
- "分析代码的依赖关系"
- "生成代码文档报告"

### 输出格式

分析报告为 **Markdown** 格式，包含：

- 文件概览（统计信息、主要组件）
- 类/接口结构图（Mermaid 语法）
- 函数调用链可视化
- 依赖关系图谱
- 潜在问题和建议

---

## 技能配置

### YAML Frontmatter

```yaml
name: code-analyzer
description: "深度分析 TypeScript 文件，生成详细的代码分析报告。支持类、接口、函数的结构解析，依赖追踪和调用链分析。适用于理解复杂代码库的架构模式和模块关系。"
aliases: [code-analysis, ts-analyzer]
type: bundled
```

### 兼容工具

- **Read** - 读取 .ts/.tsx 文件内容
- **Glob** - 按模式匹配目标文件
- **BashOutput** (可选) - 运行 TypeScript 编译器获取类型信息

---

## 技能目录结构

```
code-analyzer/
├── SKILL.md          # 本文件（技能说明）
└── ReportGenerator.ts   # 报告生成器脚本
```

### ReportGenerator.ts 功能

该脚本负责：
- 解析分析结果数据
- 生成 Markdown 格式的完整报告
- 渲染 Mermaid 图表和代码片段格式化

---

## 使用方式

### 基础用法

**交互式模式：**
```bash
# 指定文件列表
claude code-analyzer --files src/**/*.tsx,src/**/*.ts

# 分析整个目录
claude code-analyzer --path src/components/

# 分析单个文件
claude code-analyzer --file "src/utils/helpers.tsx"
```

**非交互式模式：**
```bash
# 命令行参数中直接指定路径
export CODE_ANALYZER_FILES="src/**/*.tsx,src/**/*.ts"
claude cli --help | grep -A5 code-analyzer
```

### 输出示例

#### 单文件分析报告

```markdown
# Component Analysis: SpinnerAnimationRow

## Overview
- **File**: `SpinnerAnimationRow.tsx`
- **Lines**: 142
- **Components**: 3 (Spinner, AnimationController, AnimationRow)
- **Hooks Used**: `useRef`, `useState`, `useEffect`
- **Imports**: 8 modules

## Component Structure

### SpinnerComponent
```typescript
interface SpinnerProps {
  size: number;
  color?: string;
  speed?: number;
}

class Spinner extends React.Component<SpinnerProps, {rotation: number}> {
  constructor(props: SpinnerProps) {}
  
  state = { rotation: 0 };
  
  componentDidMount() { /* ... */ }
  componentWillUnmount() { /* ... */ }
  
  animate() {
    this.setState({ rotation: (this.rotation + 15) % 360 });
  }
}
```

## Dependency Graph

```mermaid
graph TD
    SpinnerAnimationRow -->|uses| SpinnerComponent
    SpinnerAnimationRow -->|uses| AnimationController
    SpinnerAnimationRow -->|imports| React
    SpinnerAnimationRow -->|imports| 'src/utils/helpers'
    
    AnimationController -->|depends on| TimerService
    
    class SpinnerAnimationRow {
        + render: function
        + animate: function
        - state: object
        - props: object
        ~ constructor: function
    }
```

## Function Analysis

### `SpinnerAnimationRow.render()`
**Purpose**: Render the component tree  
**Complexity**: O(1) - Simple render pass  
**Lines of Code**: 8  

**Call Graph:**
```
┌─────────────────┐
│ SpinnerRow      │───┐
├───────────────┤    │
│ render()       │◄──┼──► SpinnerAnimationRow.render()
├───────────────┤    │
│ children:      │    │
│   └─Spinner    │    │
└───────────────┘    │
                    │
```

### `animate()` Method
**Purpose**: Control animation sequence  
**Complexity**: O(n) where n = rotation count  
**Lines of Code**: 12  

**Call Graph:**
```
SpinnerAnimationRow.animate()
       │
       ├──► AnimationController.start()
       │     │
       │     ├──► requestAnimationFrame()
       │     │     │
       │     │     └──► updateRotation()
       │     │           │
       │     │           └──► this.setState()
```

## Code Quality Assessment

| Metric | Value | Status |
|--------|-------|-------|
| Cyclomatic Complexity (render) | 3 | ✅ Low (<5) |
| Cyclomatic Complexity (animate) | 7 | ⚠️ Medium (5-10) |
| Nesting Depth | 4 | ⚠️ Medium (>3) |
| Lines of Code | 142 | ℹ️ Appropriate |

### Potential Issues

1. **State Management**: Consider using `useReducer` instead of multiple `setState()` calls for complex state updates
2. **Magic Numbers**: Constants like `15` (rotation increment) should be extracted to named constants
3. **Type Safety**: Some props have redundant type definitions that could be simplified

## Recommendations

### High Priority
- [ ] Extract magic numbers into named constants with documentation
- [ ] Consider using `useRef` for mutable values that don't need re-renders (e.g., animation frame IDs)

### Medium Priority  
- [ ] Add JSDoc comments for public methods
- [ ] Consolidate related state variables where possible
- [ ] Extract small, single-purpose functions from large methods

### Low Priority
- [ ] Consider using TypeScript interfaces over type aliases where appropriate
- [ ] Add prop validation with `PropTypes` or Zod for runtime checking
```

## 报告生成策略

### 单文件分析流程

1. **读取源文件** - 使用 Read 工具获取完整内容
2. **AST 解析** - 提取类、接口、函数定义
3. **结构分析** - 识别组件层次关系
4. **调用链追踪** - 构建方法调用图
5. **复杂度计算** - 生成圈复杂度指标
6. **问题检测** - 识别代码质量问题
7. **报告生成** - 组装 Markdown 文档

### 多文件批量分析

```bash
# 分析整个目录树
claude code-analyzer --path src/components/

# 输出结构：
Reports/code-analyzer/src-components/
├── SpinnerAnimationRow.md
├── ButtonComponent.md  
└── ...
```

---

## 报告模板定义

### 单文件报告结构

```typescript
interface CodeAnalysisReport {
  metadata: {
    filename: string;
    path: string;
    lines: number;
    sizeBytes: number;
    complexityScore: number;
  };
  
  structure: {
    interfaces: Array<{
      name: string;
      properties: Record<string, PropertyInfo>;
      methods?: MethodInfo[];
    }>;
    
    classes: Array<{
      name: string;
      extends?: string | null;
      implements?: string[];
      properties: Record<string, PropertyInfo>;
      methods: MethodInfo[];
    }>;
  };
  
  dependencies: {
    imports: ImportInfo[];
    exportedSymbols: Set<string>;
    importers: Map<string, Set<string>>;
  };
  
  callGraphs: CallGraphData[];
  
  qualityMetrics: QualityAssessment[];
  
  recommendations: Recommendation[];
}

interface PropertyInfo {
  name: string;
  type: string;
  readonly?: boolean;
  description?: string;
  defaultValue?: any;
  constraints?: Record<string, string>;
}

interface MethodInfo {
  name: string;
  signature: string;
  complexity: number;
  nloc: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  
  callGraph: {
    callers: string[];
    callees: string[];
    depth: number;
  };
  
  documentation: {
    summary: string;
    parameters: Array<{name, type, description}>;
    returns?: string;
    throws?: Array<{name, description}>;
    examples: string[];
  };
}

interface ImportInfo {
  module: string;
  importedSymbols: string[];
  importType: 'value' | 'type' | 'side-effect';
  usageCount: number;
}
```

---

## 分析算法说明

### 依赖关系解析

**输入**: TypeScript 源文件内容  
**输出**: 导入关系图

```typescript
interface DependencyGraph {
  nodes: Map<string, FileInfo>;
  edges: Array<{source: string, target: string}>;
}

function buildDependencyGraph(files: FileContent[]): DependencyGraph {
  const graph = new DependencyGraph();
  
  for (const file of files) {
    // Parse imports
    const imports = parseImports(file.content);
    
    // Extract exported symbols
    const exports = parseExports(file.content);
    
    // Add to graph
    graph.nodes.set(file.path, {
      path: file.path,
      content: file.content,
      imports,
      exports
    });
  }
  
  return graph;
}

function parseImports(content: string): ImportInfo[] {
  const importRegex = /import\s+(?:(\*|[^;]+)\s+from\s+)?(['"])(.*?)(['"])/g;
  const imports: ImportInfo[] = [];
  
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const isNamespace = match[1] === '*';
    const specifier = match[3];
    
    imports.push({
      module: specifier,
      importedSymbols: isNamespace ? ['*'] : match[2].split(' '),
      importType: isNamespace ? 'side-effect' : 'value',
      usageCount: 1
    });
  }
  
  return imports;
}

function parseExports(content: string): ExportInfo[] {
  // Parse both export declarations and named exports
  const exports: ExportInfo[] = [];
  // ... implementation details
  return exports;
}
```

### 调用链分析

**输入**: 方法签名、调用位置  
**输出**: 调用图（Call Graph）

```typescript
interface CallGraph {
  nodes: Set<MethodSignature>;
  edges: Array<{from: string, to: string}>;
}

function buildCallGraph(
  methodSignatures: Map<string, MethodSignature>,
  callSites: Map<string, CallSite[]>
): CallGraph {
  const graph = new CallGraph();
  
  // Build nodes from method signatures
  for (const [signature, method] of methodSignatures) {
    graph.nodes.add(signature);
    
    // Find callers and callees
    const callSites = getCallSites(method.signature);
    
    for (const site of callSites) {
      if (site.caller && !graph.nodes.has(site.caller)) {
        graph.nodes.add(site.caller);
      }
      
      graph.edges.push({
        from: site.caller,
        to: signature
      });
    }
  }
  
  return graph;
}

interface CallSite {
  file: string;
  line: number;
  caller?: string; // Optional: who calls this method
  context: string; // Surrounding code context
}
```

---

## 复杂度计算

### Cyclomatic Complexity

```typescript
function calculateCyclomaticComplexity(
  ast: ts.NodeArray<ts.Node>,
  options: { maxDepth?: number } = {}
): number {
  let complexity = 1; // Base complexity
  
  const nodeVisitor = (node: ts.Node) => {
    switch (node.kind) {
      case ts.SyntaxKind.IfKeyword:
        complexity++;
        break;
      case ts.SyntaxKind.ForInStatement:
        complexity++;
        break;
      case ts.SyntaxKind.SwitchStatement:
        complexity += node.modifierFlags & ts.NodeFlags.Let; // Switch cases
        break;
      case ts.SyntaxKind.CaseClause:
        complexity++;
        break;
      case ts.SyntaxKind.TryStatement:
        complexity++; // Each catch block
        break;
      case ts.SyntaxKind.TernaryOperator:
        complexity++;
        break;
      default:
        if (node.kind === ts.SyntaxKind.FunctionDeclaration) {
          const func = node as ts.Signature;
          if (func.parameters) {
            // Count parameter checks
            complexity += countParameterChecks(func);
          }
        }
    }
  };
  
  const walker = ts.createNodeVisitor(
    nodeVisitor,
    ast,
    undefined,
    true,
    ts.NodeKind
  );
  
  return complexity;
}

function countParameterChecks(parameters: ParameterDeclaration[]) {
  let checks = 0;
  for (const param of parameters) {
    // Check for default values
    if (param.initializer) checks++;
    
    // Check for type guards in parameter types
    const typeChecker = /* ... */;
    const typePredicate = typeChecker.getSignatureForParameter(
      getSource(), 
      param as ts.ParameterDeclaration
    );
    if (typePredicate) checks++;
  }
  
  return checks;
}
```

### NPath Complexity

```typescript
function calculateNPathComplexity(
  functionBody: ts.SourceFile,
  entryPoints: string[] = ['public', 'private', 'protected']
): number {
  let npath = entryPoints.length;
  
  // Add linear paths for each statement
  const statements = getStatements(functionBody);
  npath += statements.length;
  
  // Add branches
  npath += countBranches(functionBody);
  
  return npath;
}

function countBranches(sourceFile: ts.SourceFile): number {
  let branches = 0;
  const walker = ts.createNodeVisitor(
    () => {},
    sourceFile,
    undefined,
    true,
    ts.NodeKind
  );
  
  ts.forEachChild(sourceFile, (node) => {
    switch (node.kind) {
      case ts.SyntaxKind.IfKeyword: branches++; break;
      case ts.SyntaxKind.ForStatement: branches += 3; break; // init, condition, increment
      case ts.SyntaxKind.WhileLoop: branches += 2; break;
      case ts.SyntaxKind.DoStatement: branches += 3; break;
      case ts.SyntaxKind.SwitchStatement: branches++; break;
      case ts.SyntaxKind.CaseClause: branches++; break;
      case ts.SyntaxKind.DefaultClause: branches++; break;
      case ts.SyntaxKind.TryStatement: 
        // Each catch and finally
        const catchCount = 0;
        node.catchClause?.statements.forEach(() => catchCount++);
        branches += (catchCount + 1);
        break;
      case ts.SyntaxKind.TernaryOperator: branches++; break;
      case ts.SyntaxKind.SwitchStatement: 
        // Switch-exhaustive check
        const cases = node.unionTypeParts?.length || 0;
        if (cases > 0) branches += cases;
        break;
    }
  });
  
  return branches;
}
```

---

## 质量评估指标

### 代码异味检测

```typescript
interface CodeSmell {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 
    | 'duplication' 
    | 'complexity' 
    | 'coupling' 
    | 'maintainability'
    | 'security';
  location: { file: string; line?: number };
  description: string;
  evidence: CodeSnippet;
  recommendation: string;
}

function detectCodeSmells(files: FileContent[]): CodeSmell[] {
  const smells: CodeSmell[] = [];
  
  for (const file of files) {
    // Duplication detection
    const contentHash = hashFileContent(file.content);
    if (isDuplicate(contentHash, existingFiles)) {
      smells.push({
        id: 'duplication',
        severity: 'high',
        category: 'duplication',
        location: file.path,
        description: 'Identical code detected across files',
        evidence: { original: originalFile, duplicate: file },
        recommendation: 'Extract common logic into shared module'
      });
    }
    
    // Complexity smells
    const complexity = calculateComplexity(file);
    if (complexity > THRESHOLD) {
      smells.push({
        id: 'high-complexity',
        severity: Math.max(0, 4 - Math.min(complexity / THRESHOLD, 4)) as any,
        category: 'complexity',
        location: file.path,
        description: `Cyclomatic complexity (${complexity}) exceeds threshold (${THRESHOLD})`,
        evidence: { method: highComplexityMethod },
        recommendation: 'Split into smaller, single-purpose functions'
      });
    }
    
    // Deep nesting detection
    const nesting = calculateNestingDepth(file);
    if (nesting > NESTING_THRESHOLD) {
      smells.push({
        id: 'deep-nesting',
        severity: Math.max(0, 4 - Math.min(nesting / NESTING_THRESHOLD, 4)) as any,
        category: 'maintainability',
        location: file.path,
        description: `Nesting depth (${nesting}) exceeds threshold`,
        evidence: { method: deeplyNestedMethod },
        recommendation: 'Use early returns or guard clauses'
      });
    }
  }
  
  return smells;
}

function isDuplicate(hash1: string, existingFiles: Set<string>): boolean {
  const normalized = normalizeContent(existingFiles);
  return JSON.stringify(normalized) === JSON.stringify([hash1]);
}
```

---

## 报告生成器实现

### ReportGenerator.ts 核心逻辑

```typescript
// src/skills/bundled/code-analyzer/ReportGenerator.ts

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface AnalysisConfig {
  files?: string[];
  path?: string;
  includeTests: boolean;
  maxDepth: number;
}

export class CodeAnalyzer {
  private config: AnalysisConfig;
  private reportGenerator: ReportGenerator;
  
  constructor(config: AnalysisConfig) {
    this.config = config;
    this.reportGenerator = new ReportGenerator();
  }
  
  async analyze(): Promise<CodeAnalysisReport> {
    // Step 1: Read and parse files
    const fileContents = await this.readFiles();
    
    // Step 2: Parse TypeScript AST
    const asts = this.parseAST(fileContents);
    
    // Step 3: Build dependency graph
    const depGraph = this.buildDependencyGraph(asts);
    
    // Step 4: Analyze call graphs
    const callGraphs = this.analyzeCallGraphs(asts, depGraph);
    
    // Step 5: Calculate complexity metrics
    const complexityMetrics = this.calculateComplexity(asts);
    
    // Step 6: Detect code smells
    const codeSmells = this.detectCodeSmells(fileContents, complexityMetrics);
    
    // Step 7: Generate report
    return await this.reportGenerator.generateReport({
      asts,
      depGraph,
      callGraphs,
      complexityMetrics,
      codeSmells
    });
  }
  
  private async readFiles(): Promise<Map<string, string>> {
    const fileMap = new Map<string, string>();
    
    if (this.config.path) {
      // Recursive directory scan
      const files = await this.globFiles(this.config.path);
      
      for (const filePath of files) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          fileMap.set(filePath, content);
        } catch (error) {
          console.error(`Error reading ${filePath}:`, error);
        }
      }
    } else if (this.config.files) {
      // Specific files from arguments
      for (const filePath of this.config.files) {
        const absolutePath = path.resolve(filePath);
        try {
          const content = fs.readFileSync(absolutePath, 'utf8');
          fileMap.set(absolutePath, content);
        } catch (error) {
          console.error(`Error reading ${filePath}:`, error);
        }
      }
    }
    
    return fileMap;
  }
  
  private parseAST(fileContents: Map<string, string>): ts.NodeFile[] {
    const asts = [];
    
    for (const [filePath, content] of fileContents) {
      try {
        const sourceFile = ts.createSourceFile(
          filePath,
          content,
          this.getFileLanguage(filePath)
        );
        
        // Parse declarations
        const program = ts.createProgram([filePath], {
          ...this.getDefaultCompilerOptions(),
          skipDefaultLibCheck: true
        });
        
        const sourceFileNode = program.getSourceFile(filePath);
        if (sourceFileNode) {
          asts.push(this.parseDeclarations(sourceFileNode));
        }
      } catch (error) {
        console.error(`Error parsing ${filePath}:`, error);
        // Still create empty AST for reporting
        asts.push(ts.createSourceFile(filePath, '', ts.ScriptTarget.Latest));
      }
    }
    
    return asts;
  }
  
  private parseDeclarations(sourceFile: ts.SourceFile): ts.Declaration[] {
    const declarations = [];
    
    // Walk the AST and extract relevant nodes
    const walker = ts.createNodeVisitor(
      (node) => this.parseDeclaration(node),
      sourceFile,
      undefined,
      true,
      ts.NodeKind
    );
    
    walker.visit(sourceFile);
    
    return declarations;
  }
  
  private parseDeclaration(node: ts.Node): Declaration | null {
    const declaration = node as ts.Declaration;
    
    if (declaration.kind === ts.SyntaxKind.ClassDeclaration) {
      return this.parseClass(declaration);
    } else if (declaration.kind === ts.SyntaxKind.InterfaceDeclaration) {
      return this.parseInterface(declaration);
    } else if (declaration.kind === ts.SyntaxKind.EnumDeclaration) {
      return this.parseEnum(declaration);
    } else if (declaration.kind === ts.SyntaxKind.FunctionDeclaration) {
      return this.parseFunction(declaration);
    }
    
    return null;
  }
  
  private parseClass(classDecl: ts.ClassDeclaration): ClassInfo {
    const classInfo = {
      name: classDecl.name.text,
      extends: classDecl.heritageClauses?.[0]?.expressions?.[0].text || null,
      implements: [],
      properties: {},
      methods: []
    };
    
    // Parse properties
    for (const property of classDecl.properties) {
      const propInfo = this.parseProperty(property);
      classInfo.properties[propInfo.name] = propInfo;
    }
    
    // Parse methods and constructor
    for (const child of ts.forEachChild(classDecl)) {
      if (child.kind === ts.SyntaxKind.MethodDeclaration || 
          child.kind === ts.SyntaxKind.PropertySignature) {
        const methodInfo = this.parseMethod(child);
        classInfo.methods.push(methodInfo);
      }
    }
    
    return classInfo;
  }
  
  private parseFunction(funcDecl: ts.FunctionDeclaration): MethodInfo {
    // Parse signature
    const signature = funcDecl.signatures[0];
    
    // Parse parameters
    const params = [];
    for (const param of funcDecl.parameters) {
      params.push({
        name: param.name?.text || '<anonymous>',
        type: this.getTypeName(param),
        optional: !!param.questionToken,
        readonly: false,
        default: param.initializer?.text
      });
    }
    
    // Calculate complexity
    const complexity = this.calculateMethodComplexity(funcDecl);
    
    return {
      name: funcDecl.name.text,
      signature: this.getSignatureText(signature),
      parameters: params,
      complexity,
      nloc: this.countLines(funcDecl.getText()),
      documentation: this.parseJSDoc(funcDecl)
    };
  }
  
  private parseProperty(prop: ts.PropertyDeclaration): PropertyInfo {
    return {
      name: prop.name?.text || '<anonymous>',
      type: this.getTypeName(prop),
      readonly: !!prop.modifierFlag === ts.ModifierFlags.Static,
      description: this.parseJSDocComment(prop)
    };
  }
  
  private parseMethod(methodDecl: ts.MethodDeclaration): MethodInfo {
    // Similar to parseFunction but handles class methods differently
    const signature = methodDecl.signatures[0];
    
    return {
      name: methodDecl.name.text,
      signature: this.getSignatureText(signature),
      parameters: [],
      complexity: 0, // Will be calculated separately
      documentation: this.parseJSDoc(methodDecl)
    };
  }
  
  private getTypeName(node: ts.Node): string {
    if (node.kind === ts.SyntaxKind.TypeLiteral) {
      return 'object'; // Simplified for type literals
    } else if (ts.isTypeNode(node)) {
      return this.getNodeText(node);
    }
    return '';
  }
  
  private getSignatureText(signature: ts.Signature): string {
    const params = signature.getParameters().map(p => 
      `${(p as ts.ParameterDeclaration).questionToken ? '?' : ''}${this.getTypeName(p)}${(p as ts.ParameterDeclaration).name?.text}`
    );
    
    return `(${params.join(', ')}) => void`; // Simplified return type
  }
  
  private countLines(text: string): number {
    const lines = text.split('\n');
    let nloc = 0;
    
    for (const line of lines) {
      if (!line.trim().startsWith('//') && !line.trim().startsWith('/*')) {
        nloc++;
      }
    }
    
    return nloc;
  }
  
  private parseJSDoc(node: ts.Node): string | null {
    const jsDoc = this.getJSDocComment(node);
    if (!jsDoc) return null;
    
    // Parse JSDoc into structured format
    const comments = [];
    for (const comment of jsDoc.tags) {
      comments.push({ tag: comment.tag, text: comment.text });
    }
    
    return { summary: jsDoc.text, tags: comments };
  }
  
  private getJSDocComment(node: ts.Node): JSDoc | null {
    // Search for preceding JSDoc comments
    const checker = /* typeChecker */;
    const sourceFile = node.getSourceFile();
    
    if (!sourceFile) return null;
    
    const commentRange = node.getDocumentationComment(checker);
    if (!commentRange) return null;
    
    const text = fs.readFileSync(sourceFile.fileName, 'utf8');
    const commentText = text.substring(commentRange.start, commentRange.end);
    
    // Parse JSDoc tags
    const lines = commentText.split('\n');
    const comments: Array<{tag: string, text: string}> = [];
    
    let currentTag: string | null = null;
    for (const line of lines) {
      if (line.startsWith('@')) {
        if (currentTag) {
          comments.push({ tag: currentTag, text: '' });
        }
        currentTag = line.substring(1).trim();
      } else if (currentTag && line.trim()) {
        comments.push({ tag: currentTag, text: line.trim() });
      }
    }
    
    return { summary: null, tags: comments };
  }
  
  private buildDependencyGraph(asts: ts.Declaration[]): DependencyGraph {
    const graph = new DependencyGraph();
    
    // Collect all exports from each AST
    for (const ast of asts) {
      const exports = this.collectExports(ast);
      
      for (const exportDecl of exports) {
        graph.addExport(exportDecl.name, ast.fileName);
      }
    }
    
    // Build import relationships
    for (const file of Object.keys(graph.exports)) {
      const imports = this.collectImports(file);
      
      for (const imp of imports) {
        if (graph.hasExport(imp.importedName)) {
          graph.addEdge(file, graph.getExportOwner(imp.importedName));
        }
      }
    }
    
    return graph;
  }
  
  private analyzeCallGraphs(asts: ts.Declaration[], depGraph: DependencyGraph): CallGraphData[] {
    const callGraphs = new Map<string, CallGraph>();
    
    // Build call graphs for each method
    for (const ast of asts) {
      const fileName = ast.fileName;
      
      if (!callGraphs.has(fileName)) {
        callGraphs.set(fileName, new CallGraph());
      }
      
      const fileCallGraph = callGraphs.get(fileName);
      
      // Analyze each method in the AST
      for (const declaration of this.collectMethods(ast)) {
        const methodName = declaration.name.text;
        
        // Find callers from dependency graph
        const callers = depGraph.getCallers(declaration);
        
        fileCallGraph.addMethod(methodName, callers);
      }
    }
    
    return Array.from(callGraphs.values());
  }
  
  private calculateComplexity(asts: ts.Declaration[]): ComplexityMetrics {
    const metrics = new Map<string, number>();
    
    for (const ast of asts) {
      // Calculate cyclomatic complexity
      let cyclo = 1;
      
      const walker = ts.createNodeVisitor(
        () => {},
        ast,
        undefined,
        true,
        ts.NodeKind
      );
      
      walker.visit(ast);
      
      // Count decision points from visitor events
      // ... (implementation details)
    }
    
    return metrics;
  }
  
  private detectCodeSmells(files: FileContent[], complexityMetrics: ComplexityMetrics): CodeSmell[] {
    const smells: CodeSmell[] = [];
    
    for (const [filePath, content] of Object.entries(files)) {
      // Duplication check
      const normalized = this.normalizeContent(content);
      if (this.isDuplicate(normalized)) {
        smells.push({
          id: 'duplication',
          severity: 'high',
          category: 'duplication',
          location: { file: filePath },
          description: 'Identical code detected across files',
          evidence: {},
          recommendation: 'Extract common logic into shared module'
        });
      }
      
      // Complexity smells
      for (const [methodName, complexity] of Object.entries(complexityMetrics)) {
        if (complexity > 10) {
          smells.push({
            id: 'high-complexity',
            severity: Math.max(0, 4 - Math.min((complexity - 10) / 5, 4)),
            category: 'complexity',
            location: { file: filePath, method: methodName },
            description: `Cyclomatic complexity (${complexity}) exceeds threshold (10)`,
            evidence: {},
            recommendation: 'Split into smaller, single-purpose functions'
          });
        }
      }
      
      // Deep nesting check
      const nesting = this.calculateNestingDepth(content);
      if (nesting > 4) {
        smells.push({
          id: 'deep-nesting',
          severity: Math.max(0, 4 - Math.min((nesting - 4) / 2, 4)),
          category: 'maintainability',
          location: { file: filePath },
          description: `Nesting depth (${nesting}) exceeds threshold (4)`,
          evidence: {},
          recommendation: 'Use early returns or guard clauses'
        });
      }
    }
    
    return smells;
  }
  
  private async generateReport(data: AnalysisData): Promise<string> {
    const report = this.reportGenerator.generateMarkdownReport(data);
    
    // Write to Reports directory
    const outputPath = path.join(
      process.env.CODE_ANALYZER_OUTPUT || './Reports/code-analyzer',
      data.metadata.filename + '.md'
    );
    
    await fs.promises.writeFile(outputPath, report);
    
    return outputPath;
  }
}

interface Declaration {
  kind: ts.SyntaxKind;
  name: string;
  extends?: string | null;
  implements?: string[];
  properties: Record<string, PropertyInfo>;
  methods: MethodInfo[];
  interfaces?: Array<{name: string; properties: any}>;
}

interface ClassInfo {
  kind: 'class';
  name: string;
  extends?: string | null;
  implements?: string[];
  properties: Record<string, PropertyInfo>;
  methods: MethodInfo[];
}

interface InterfaceInfo {
  kind: 'interface';
  name: string;
  extends?: string[];
  properties: Record<string, PropertyInfo>;
  methods?: MethodInfo[];
}

interface FunctionInfo {
  kind: 'function' | 'method';
  name: string;
  signature: string;
  parameters: ParameterInfo[];
  returnType: string;
  complexity: number;
  nloc: number;
  documentation: JSDoc;
}

interface MethodInfo {
  name: string;
  signature: string;
  parameters: ParameterInfo[];
  returnType: string;
  complexity: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  callGraph: CallGraphNode;
  documentation: JSDoc;
}

interface PropertyInfo {
  name: string;
  type: string;
  readonly?: boolean;
  static?: boolean;
  description?: string;
  defaultValue?: any;
}

interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
  default: any;
}

interface JSDoc {
  summary: string;
  tags: Array<{tag: string, text: string}>;
}

interface CallGraphNode {
  callers: string[];
  callees: string[];
  depth: number;
  context: string;
}

interface ComplexityMetrics {
  [filePath: string]: Map<string, number>;
}

interface CodeSmell {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'duplication' | 'complexity' | 'coupling' | 'maintainability' | 'security';
  location: {file: string, line?: number, method?: string};
  description: string;
  evidence: any;
  recommendation: string;
}

interface CallGraphData {
  nodes: Set<string>;
  edges: Array<{from: string, to: string}>;
  methods: Map<string, MethodInfo>;
}

interface AnalysisData {
  metadata: {
    filename: string;
    path: string;
    lines: number;
    sizeBytes: number;
    complexityScore: number;
  };
  
  structure: {
    interfaces: Array<InterfaceInfo>;
    classes: Array<ClassInfo>;
  };
  
  dependencies: {
    imports: ImportInfo[];
    exportedSymbols: Set<string>;
    importers: Map<string, Set<string>>;
  };
  
  callGraphs: CallGraphData[];
  
  qualityMetrics: ComplexityMetrics;
  
  codeSmells: CodeSmell[];
}

interface ImportInfo {
  module: string;
  importedSymbols: string[];
  importType: 'value' | 'type' | 'side-effect';
  usageCount: number;
}

interface PropertySignature extends PropertyInfo {
  readonly: boolean;
  static?: boolean;
}

interface ExportInfo {
  name: string;
  kind: 'declaration' | 'value' | 'namespace';
  modifiers: ts.ModifierFlags;
}

interface JSDocTag {
  tag: string;
  text: string;
}

interface CallSite {
  file: string;
  line: number;
  caller?: string;
  context: string;
}

interface DeclarationMap {
  [fileName: string]: Declaration[];
}

interface ExportMap {
  [fileName: string]: Set<string>;
}

interface ImportMap {
  [importedName: string]: string; // source file or module path
}

interface CallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: Array<{from: string, to: string}>;
}

interface DependencyGraph extends ExportMap, ImportMap {
  addExport(name: string, sourceFile: string): void;
  getExportOwner(importedName: string): string | null;
  hasExport(name: string): boolean;
  getCallers(methodName: string): Set<string>;
}

interface ReportGenerator {
  generateReport(data: AnalysisData): Promise<string>;
  generateMarkdownReport(data: AnalysisData): string;
}
```

---

## 使用示例

### 完整项目分析

```bash
# 分析整个 src 目录
claude code-analyzer --path "src/**/*.ts,src/**/*.tsx"

# 输出：Reports/code-analyzer/src/
├── code-analyzer/
│   ├── SKILL.md
│   └── ReportGenerator.ts
└── src/
    ├── components/
    │   ├── SpinnerAnimationRow.md
    │   ├── ButtonComponent.md
    │   └── ...
    ├── utils/
    │   ├── helpers.md
    │   └── ...
    └── services/
        └── ...
```

### 单文件分析

```bash
# 分析单个文件
claude code-analyzer --file "src/components/SpinnerAnimationRow.tsx"

# 输出：Reports/code-analyzer/src-components/SpinnerAnimationRow.md
```

---

## 报告预览示例

### 组件分析报告示例

```markdown
# Component Analysis: SpinnerAnimationRow

## Overview
- **File**: `SpinnerAnimationRow.tsx`
- **Lines**: 142 (LOC)
- **Components**: 3 (Spinner, AnimationController, AnimationRow)
- **Hooks Used**: `useRef`, `useState`, `useEffect`
- **Imports**: 8 modules

## Component Structure

### SpinnerComponent
```typescript
interface SpinnerProps {
  size: number;
  color?: string;
  speed?: number;
}

class Spinner extends React.Component<SpinnerProps, {rotation: number}> {
  constructor(props: SpinnerProps) {}
  
  state = { rotation: 0 };
  
  componentDidMount() { /* ... */ }
  componentWillUnmount() { /* ... */ }
  
  animate() {
    this.setState({ rotation: (this.rotation + 15) % 360 });
  }
}
```

## Dependency Graph

```mermaid
graph TD
    SpinnerAnimationRow -->|uses| SpinnerComponent
    SpinnerAnimationRow -->|uses| AnimationController
    SpinnerAnimationRow -->|imports| React
    SpinnerAnimationRow -->|imports| 'src/utils/helpers'
    
    AnimationController -->|depends on| TimerService
    
    class SpinnerAnimationRow {
        + render: function
        + animate: function
        - state: object
        - props: object
        ~ constructor: function
    }
```

## Function Analysis

### `SpinnerAnimationRow.render()`
**Purpose**: Render the component tree  
**Complexity**: O(1) - Simple render pass  
**Lines of Code**: 8  

**Call Graph:**
```
┌─────────────────┐
│ SpinnerRow      │───┐
├───────────────┤    │
│ render()       │◄──┼──► SpinnerAnimationRow.render()
├───────────────┤    │
│ children:      │    │
│   └─Spinner    │    │
└───────────────┘    │
                    │
```

### `animate()` Method
**Purpose**: Control animation sequence  
**Complexity**: O(n) where n = rotation count  
**Lines of Code**: 12  

**Call Graph:**
```
SpinnerAnimationRow.animate()
       │
       ├──► AnimationController.start()
       │     │
       │     ├──► requestAnimationFrame()
       │     │     │
       │     │     └──► updateRotation()
       │     │           │
       │     │           └──► this.setState()
```

## Code Quality Assessment

| Metric | Value | Status |
|--------|-------|-------|
| Cyclomatic Complexity (render) | 3 | ✅ Low (<5) |
| Cyclomatic Complexity (animate) | 7 | ⚠️ Medium (5-10) |
| Nesting Depth | 4 | ⚠️ Medium (>3) |
| Lines of Code | 142 | ℹ️ Appropriate |

### Potential Issues

1. **State Management**: Consider using `useReducer` instead of multiple `setState()` calls for complex state updates
2. **Magic Numbers**: Constants like `15` (rotation increment) should be extracted to named constants
3. **Type Safety**: Some props have redundant type definitions that could be simplified

## Recommendations

### High Priority
- [ ] Extract magic numbers into named constants with documentation
- [ ] Consider using `useRef` for mutable values that don't need re-renders (e.g., animation frame IDs)

### Medium Priority  
- [ ] Add JSDoc comments for public methods
- [ ] Consolidate related state variables where possible
- [ ] Extract small, single-purpose functions from large methods

### Low Priority
- [ ] Consider using TypeScript interfaces over type aliases where appropriate
- [ ] Add prop validation with `PropTypes` or Zod for runtime checking
```

---

## 报告生成器使用示例

```typescript
// ReportGenerator.tsx usage example

import { CodeAnalyzer } from './ReportGenerator';

async function analyzeFile(filePath: string): Promise<string> {
  const config = { files: [filePath] };
  const analyzer = new CodeAnalyzer(config);
  
  const reportPath = await analyzer.analyze();
  
  // Report is written to Reports/code-analyzer/<filename>.md
  return reportPath;
}

// Example usage
const outputPath = await analyzeFile('src/components/SpinnerAnimationRow.tsx');
console.log(`Report saved to: ${outputPath}`);
```

---

## 批量分析示例

```typescript
// Analyzing multiple files at once

async function analyzeDirectory(
  pathPattern: string,
  outputDir: string = './Reports/code-analyzer'
): Promise<void> {
  const config = { path: pathPattern };
  const analyzer = new CodeAnalyzer(config);
  
  // Generate reports for all matching files
  const tasks = Glob.sync(pathPattern).map(async (filePath) => {
    try {
      const reportPath = await analyzer.analyze();
      
      // Copy report to output directory
      const relativePath = filePath.replace(/\.tsx?$/, '.md');
      const destPath = path.join(outputDir, relativePath);
      
      await fs.copyFile(reportPath, destPath);
    } catch (error) {
      console.error(`Error analyzing ${filePath}:`, error);
    }
  });
  
  await Promise.all(tasks);
}

// Example usage
await analyzeDirectory('src/**/*.tsx');
```

---

## 配置示例

### settings.json 配置

```json
{
  "code-analyzer": {
    "enabled": true,
    "aliases": ["code-analysis", "ts-analyzer"],
    "config": {
      "path": "${env:CODE_ANALYZER_PATH:./Reports/code-analyzer}",
      "includeTests": false
    }
  },
  
  "hooks": {
    "ps1": [
      "export CODE_ANALYZER_OUTPUT=\"${env:CUSTOM_PSDRIVE:?\\doge-code}\\Reports\\code-analyzer\""
    ]
  }
}
```

### 命令行参数说明

| 参数 | 类型 | 说明 |
|-----|-----|------|
| `--path` | string | 目录路径模式（如 `"src/**/*.tsx"`） |
| `--file` | string | 单个文件路径（如 `"src/components/SpinnerAnimationRow.tsx"`） |
| `--include-tests` | boolean | 是否包含测试文件分析 |
| `--output-dir` | string | 自定义输出目录 |

---

## 性能优化

### 缓存机制

```typescript
interface CacheManager {
  private cache: Map<string, ParsedAST>;
  
  getOrParse(filePath: string): ParsedAST {
    if (!this.cache.has(filePath)) {
      this.cache.set(filePath, this.parseFile(filePath));
    }
    return this.cache.get(filePath)!;
  }
}

// Usage in CodeAnalyzer
private astCache = new CacheManager();

private parseFiles(fileContents: Map<string, string>): ts.NodeFile[] {
  const asts = [];
  
  for (const [filePath, content] of fileContents) {
    // Use cache to avoid re-parsing identical files
    const ast = this.astCache.getOrParse(filePath);
    
    if (!ast) {
      asts.push(this.parseAST(content));
    } else {
      asts.push(ast);
    }
  }
  
  return asts;
}
```

### 增量分析

```typescript
interface IncrementalAnalyzer {
  private baseline: DependencyGraph;
  private changedFiles: Set<string>;
  
  async analyzeWithDiff(
    newFiles: Map<string, string>,
    oldBaseline?: DependencyGraph
  ): Promise<DependencyGraph> {
    
    // Only re-analyze changed files
    const changedFileContents = this.getChangedFiles(newFiles, oldBaseline);
    
    if (changedFileContents.size > 0) {
      const newAst = await this.analyzeFiles(changedFileContents);
      
      // Merge with baseline
      return this.mergeGraphs(oldBaseline, newAst);
    }
    
    return oldBaseline;
  }
}
```

---

## 扩展功能

### TypeScript 类型增强分析

```typescript
interface TypeAnalysis {
  // Deep type hierarchy analysis
  classHierarchy: ClassHierarchyInfo[];
  
  // Interface inheritance chains
  interfaceChains: Map<string, string[]>;
  
  // Type compatibility checking
  compatibleTypes: Map<[string, string], boolean>;
  
  // Generic constraint analysis
  genericConstraints: ConstraintAnalysis[];
}

interface ClassHierarchyInfo {
  className: string;
  parentClasses: string[];
  implementedInterfaces: string[];
  diamondInheritance?: boolean;
  depthFromRoot: number;
}

interface ConstraintAnalysis {
  constraintType: 'extends' | 'implements' | 'satisfies';
  typeParameter: string;
  constraint: string;
  inferredType: string;
  checkerResult: ts.InferenceResult;
}
```

### 跨文件调用链分析

```typescript
interface CrossFileCallGraph {
  nodes: Map<string, CallGraphNode>;
  edges: Array<{from: string, to: string}>;
  
  // Methods can be called from multiple files
  getCrossFileCalls(): Array<{
    callerFile: string;
    callerLine: number;
    calleeMethod: string;
  }>;
}

function analyzeCrossFileCalls(
  allAsts: ts.NodeFile[],
  exportMap: ExportMap,
  importMap: ImportMap
): CrossFileCallGraph {
  
  const crossFileNodes = new Map<string, CallGraphNode>();
  const edges = [];
  
  // Track calls across file boundaries
  for (const ast of allAsts) {
    const callerInfo = this.extractCallerContext(ast);
    
    for (const callSite of callerInfo.calls) {
      if (callSite.caller && 
          !this.isSameFile(callSite.caller, callerInfo.file)) {
        
        // Cross-file call detected
        edges.push({
          from: `${callSite.caller}`,
          to: `${callSite.callee}`
        });
        
        crossFileNodes.set(`${callSite.caller}`, {
          ...crossFileNodes.get(`${callSite.caller}`),
          callees: [...(crossFileNodes.get(`${callSite.caller}`)?.callees || []), 
                   callSite.callee]
        });
      }
    }
  }
  
  return { nodes: crossFileNodes, edges };
}
```

---

## 报告自定义输出格式

### JSON 格式输出

```typescript
interface JsonReport extends CodeAnalysisReport {
  metadata: {
    generatedAt: string;
    analyzerVersion: string;
    configHash: string;
  };
  
  // Same structure as Markdown report but in JSON
  structure: any;
  dependencies: any;
  callGraphs: any;
  qualityMetrics: any;
  codeSmells: CodeSmell[];
}

export function toJsonReport(analysisData: AnalysisData): JsonReport {
  const jsonReport = {
    metadata: analysisData.metadata,
    structure: this.jsonifyStructure(analysisData.structure),
    dependencies: this.jsonifyDependencies(analysisData.dependencies),
    callGraphs: this.jsonifyCallGraphs(analysisData.callGraphs),
    qualityMetrics: this.jsonifyMetrics(analysisData.qualityMetrics),
    codeSmells: analysisData.codeSmells,
  };
  
  return jsonReport;
}

// Helper to convert TypeScript types to JSON-serializable formats
private jsonifyStructure(structure: any): any {
  const result = {};
  
  if (structure.kind === 'interfaces') {
    result.interfaces = structure.interfaces.map((iface) => ({
      name: iface.name,
      properties: this.jsonifyPropertyMap(iface.properties),
      methods: this.jsonifyMethodList(iface.methods),
      extends: iface.extends,
      implements: iface.implements,
    }));
  } else if (structure.kind === 'classes') {
    result.classes = structure.classes.map((cls) => ({
      name: cls.name,
      properties: this.jsonifyPropertyMap(cls.properties),
      methods: this.jsonifyMethodList(cls.methods),
      extends: cls.extends,
      implements: cls.implements,
    }));
  }
  
  return result;
}

private jsonifyCallGraph(callGraph: CallGraphData): any {
  return {
    nodes: Array.from(callGraph.nodes).map(([nodeId, node]) => ({
      id: nodeId,
      name: node.name,
      kind: this.kindToString(node.kind),
      properties: this.jsonifyPropertyMap(node.properties),
      methods: this.jsonifyMethodList(node.methods),
    })),
    edges: callGraph.edges.map(edge => ({
      source: edge.from,
      target: edge.to,
    }), { id: 'edges' }),
  };
}

private jsonifyCallGraphNode(callNode: CallGraphNode): any {
  return {
    name: callNode.name,
    callers: callNode.callers.map(this.getNodeName),
    callees: callNode.callees.map(this.getNodeName),
    depth: callNode.depth,
    context: this.jsonifyContext(callNode.context),
  };
}

private jsonifyMethodList(methods: MethodInfo[]): any {
  return methods.map((method) => ({
    name: method.name,
    signature: method.signature,
    parameters: this.jsonifyParameterList(method.parameters),
    returnType: method.returnType,
    complexity: method.complexity,
    cyclomaticComplexity: method.cyclomaticComplexity,
    nestingDepth: method.nestingDepth,
    documentation: this.jsonifyJSDoc(method.documentation),
  }));
}

private jsonifyCallGraphEdge(edge: {from: string, to: string}): any {
  return {
    source: edge.from,
    target: edge.to,
  };
}

private jsonifyPropertyMap(properties: Record<string, PropertyInfo>): any {
  const result = {};
  
  for (const [name, prop] of Object.entries(properties)) {
    result[name] = {
      type: this.jsonifyTypeName(prop.type),
      readonly: !!prop.readonly,
      static: !!prop.static,
      description: prop.description,
      defaultValue: this.jsonifyValue(prop.default),
    };
  }
  
  return result;
}

private jsonifyParameterList(parameters: ParameterInfo[]): any {
  return parameters.map((param) => ({
    name: param.name,
    type: this.jsonifyTypeName(param.type),
    optional: !!param.optional,
    readonly: !!param.readonly,
    default: this.jsonifyValue(param.default),
  }));
}

private jsonifyJSDoc(jsDoc: JSDoc): any {
  return {
    summary: jsDoc.summary,
    tags: jsDoc.tags.map((tag) => ({
      tag: tag.tag,
      text: tag.text,
    })),
  };
}

private jsonifyContext(context: string): any {
  // Parse and stringify context code snippet
  return this.escapeString(context);
}

private jsonifyValue(value: any): any {
  if (typeof value === 'bigint') {
    return { $type: 'BigInt', value: value.toString() };
  } else if (value instanceof Map) {
    const result = {};
    [...value.entries()].forEach(([k, v]) => {
      result[k] = this.jsonifyValue(v);
    });
    return result;
  } else if (Array.isArray(value)) {
    return value.map((item: any) => this.jsonifyValue(item));
  } else {
    return value;
  }
}

private kindToString(kind: ts.SyntaxKind): string {
  return ts.SyntaxKind[kind];
}

private getNodeName(node: ts.Node): string {
  if (node.name && typeof node.name === 'string') {
    return node.name;
  } else if (ts.isIdentifier(node.name)) {
    return node.name.text;
  } else if (ts.isQualifiedName(node.name)) {
    return node.name.text;
  }
  return '';
}

private jsonifyTypeName(type: ts.TypeNode): string {
  // Full type name resolution using checker
  const checker = /* typeChecker */;
  
  if (ts.isTypeLiteral(type)) {
    return 'object';
  } else if (ts.isArrayTypeNode(type)) {
    return 'Array';
  } else if (ts.isTupleType(type)) {
    return 'tuple';
  } else if (ts.isUnionType(type)) {
    const unionParts = type.typeElements.map((t) => this.jsonifyTypeName(t));
    return `{${unionParts.join(' | ')}}`;
  } else if (ts.isIntersectionType(type)) {
    const intersectionParts = type.types.map((t) => this.jsonifyTypeName(t));
    return `&[${intersectionParts.join(', ')}]`;
  } else if (ts.isTypeAliasDeclaration(type)) {
    return this.getTypeNameFromNode(type);
  } else if (ts.isInterfaceDeclaration(type)) {
    return this.getInterfaceName(type);
  } else if (ts.isClassDeclaration(type)) {
    return this.getClassFullName(type);
  }
  
  return '';
}

private getTypeNameFromNode(node: ts.Node): string {
  const checker = /* typeChecker */;
  const symbol = checker.getAliasedSymbol(node);
  
  if (symbol) {
    const declarations = symbol.getDeclarations();
    
    for (const decl of declarations) {
      if (ts.isSourceFile(decl)) {
        // Get full name from source file
        return this.getFileAndNameFromDeclaration(decl);
      } else {
        // Use checker to resolve type
        const fullName = checker.getSymbolName(symbol);
        return fullName;
      }
    }
  }
  
  return '';
}

private getFileAndNameFromDeclaration(decl: ts.Declaration): string {
  if (ts.isIdentifier(decl)) {
    return `${decl.fileName}.${decl.name.text}`;
  } else if (ts.isQualifiedName(decl)) {
    const qn = decl as ts.QualifiedName;
    return `${qn.left?.getText()}.${qn.right.getText()}`;
  }
  
  return '';
}

private jsonifyContext(context: string): string {
  // Escape and format context code snippet
  return context.replace(/[\x00-\x1F\x7F]/g, '');
}
```

---

## 总结

**code-analyzer** 技能提供：

1. **自动解析** - TypeScript AST 解析、类/接口/函数识别
2. **依赖追踪** - 模块间导入关系图、跨文件调用链
3. **复杂度分析** - Cyclomatic Complexity、NPath Complexity
4. **代码异味检测** - 重复代码、高复杂度、深嵌套
5. **报告生成** - Markdown 和 JSON 格式输出

### 典型使用场景

- 📊 **"帮我分析一下项目的架构"** → 依赖关系图 + 组件结构
- 🔍 **"找出所有使用了某个接口的模块"** → 导入追踪
- ⚠️ **"代码质量评估报告"** → 复杂度指标 + 异味检测  
- 🎯 **"这个函数是怎么调用的？"** → 调用链分析

### 输出特点

- ✅ **详细准确** - 完整的类型信息、调用关系
- ✅ **可视化强** - Mermaid 图表、Call Graph 渲染
- ✅ **可操作** - 具体问题 + 改进建议
- ✅ **格式灵活** - Markdown（可读）+ JSON（机器解析）

---

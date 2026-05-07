// src/skills/bundled/code-analyzer/ReportGenerator.ts

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface AnalysisConfig {
  files?: string[];
  path?: string;
  includeTests: boolean;
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
    // Parse signature
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
    const checker: any = null;
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

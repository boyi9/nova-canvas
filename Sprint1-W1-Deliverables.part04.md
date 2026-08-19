  // 3. 解析测试用例
  const allCases: TestCase[] = [];
  for (const file of testFiles) {
    const cases = parseTestCases(file);
    allCases.push(...cases);
  }
  console.log(`[INFRA-002] Extracted ${allCases.length} test cases`);

  // 4. 构建目录结构
  const structure = buildDirectoryStructure(testFiles);

  const result: ExtractionResult = {
    totalFiles: testFiles.length,
    totalCases: allCases.length,
    cases: allCases,
    structure,
  };

  // 5. 生成报告
  generateTestManifest(result, targetDir);
  generateRegressionScript(targetDir);

  console.log('[INFRA-002] Extraction completed successfully');
  return result;
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const targetDir = args.find(a => a.startsWith('--dir='))?.split('=')[1] || join(process.cwd(), LOCAL_TEST_DIR);

  extractUpstreamTests(targetDir)
    .then(result => {
      console.log(`\n✅ Extraction complete:`);
      console.log(`  Files: ${result.totalFiles}`);
      console.log(`  Cases: ${result.totalCases}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('[INFRA-002] Extraction failed:', error);
      process.exit(1);
    });
}

export { cloneUpstreamRepo, extractTestFiles, parseTestCases, buildDirectoryStructure };
~~~

### 2.2.2 README.md

~~~markdown
# INFRA-002: 拉取原生仓库全量单测用例

> **Task ID**: S1-W1-D2-01
> **Story**: INFRA-002 原有infinite-canvas全量用例回归验证
> **Sprint**: 1 | **Week**: 1 | **Day**: 2
> **Assignee**: 测试/开发
> **Story Points**: 2

---

## 📋 验收清单 (Definition of Done)

| # | 验收项 | 标准 | 状态 | 备注 |
|---|--------|------|------|------|
| 1 | 仓库克隆成功 | 浅克隆 infinite-canvas 主分支，耗时 < 60s | ☐ | |
| 2 | 测试文件提取完整 | 覆盖 `src/**/*.test.ts`、`src/**/__tests__/**` 等模式 | ☐ | |
| 3 | 目录结构清晰 | 生成 `tests/regression/upstream/` 镜像目录结构 | ☐ | |
| 4 | 测试用例解析 | 解析出 `describe/it/test` 套件与用例名 | ☐ | |
| 5 | 清单报告生成 | 输出 `test-manifest.json` 含文件/用例/行号 | ☐ | |
| 5 | 基线脚本生成 | 输出 `run-baseline.sh` 可一键跑通全量回归 | ☐ | |
| 7 | 单测覆盖 | 核心函数覆盖率 ≥ 80% | ☐ | |

---

## 🚀 快速开始

### 完整提取流程

```bash
# 在项目根目录运行
pnpm tsx src/infra/regression/INFRA-002/index.ts

# 或指定目标目录
pnpm tsx src/infra/regression/INFRA-002/index.ts --dir=tests/regression/upstream
```

### 仅生成基线脚本

```bash
pnpm tsx -e "
import { generateRegressionScript } from './src/infra/regression/INFRA-002/index.ts';
generateRegressionScript('./tests/regression/upstream');
"
```

---

## 📁 输出产物

```
tests/regression/upstream/
├── test-manifest.json      # 测试清单：文件/用例/行号/目录树
├── run-baseline.sh         # 一键回归测试脚本
├── src/                    # 镜像上游源码结构
│   ├── canvas/
│   ├── plugins/
│   └── ...
└── package.json            # 上游 package.json (用于依赖分析)
```

---

## 📊 test-manifest.json 结构

```json
{
  "metadata": {
    "generatedAt": "2025-01-16T00:00:00.000Z",
    "upstreamRepo": "https://github.com/infinite-canvas/infinite-canvas.git",
    "upstreamBranch": "main",
    "totalFiles": 42,
    "totalCases": 156
  },
  "structure": {
    "src": {
      "canvas": {
        "engine": ["CanvasEngine.test.ts"],
        "nodes": ["NodeManager.test.ts"]
      }
    }
  },
  "cases": [
    {
      "file": "src/canvas/engine/CanvasEngine.test.ts",
      "suite": "CanvasEngine",
      "name": "should initialize with default config",
      "line": 15
    }
  ]
}
```

---

## 🧪 回归测试基线运行

```bash
# 赋予执行权限
chmod +x tests/regression/upstream/run-baseline.sh

# 运行基线
./tests/regression/upstream/run-baseline.sh
```

**run-baseline.sh 执行流程：**
1. `pnpm install --frozen-lockfile` - 安装依赖
2. `pnpm test --reporter=json` - 运行上游测试，输出 JSON
3. `pnpm test --reporter=json` - 运行项目测试，输出 JSON
4. `node scripts/compare-baselines.js` - 对比差异

---

## 🔧 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `UPSTREAM_REPO_URL` | `https://github.com/infinite-canvas/infinite-canvas.git` | 上游仓库地址 |
| `UPSTREAM_BRANCH` | `main` | 克隆分支 |
| `LOCAL_TEST_DIR` | `tests/regression/upstream` | 本地存储目录 |
| `TEST_PATTERNS` | 见源码 | 测试文件匹配模式 |

---

## 🧪 测试指令

```bash
# 运行单元测试
pnpm test src/infra/regression/INFRA-002/index.test.ts

# 覆盖率
pnpm test:coverage src/infra/regression/INFRA-002/
```

---

## ⚠️ 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 克隆超时 | 网络/仓库大 | 增加 `--depth=1`、配置代理 |
| 解析用例为 0 | 正则不匹配 | 调整 `describe/it` 正则，支持 `test()` |
| 权限报错 | 目录已存在/只读 | 删除目标目录重试 |
| 依赖缺失 | 上游 package.json 变更 | 运行前同步 `package.json` |

---

## 📝 变更记录

| 版本 | 日期 | 变更内容 | 操作人 |
|------|------|----------|--------|
| 1.0.0 | 2025-01-16 | 初始版本：克隆、提取、解析、报告生成 | [开发者] |

---

## 📚 相关链接

- [infinite-canvas 仓库](https://github.com/infinite-canvas/infinite-canvas)
- [Git 浅克隆文档](https://git-scm.com/docs/git-clone#Documentation/git-clone.txt---depthltdepthgt)
- [Vitest 测试运行器](https://vitest.dev/)
~~~

### 2.2.3 index.test.ts

~~~typescript
/**
 * INFRA-002 单元测试
 * Task: S1-W1-D2-01
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  parseTestCases,
  buildDirectoryStructure,
  generateTestManifest,
  generateRegressionScript,
  extractTestFiles,
} from './index.js';

const TEST_OUTPUT_DIR = join(process.cwd(), 'test-output', 'INFRA-002');
const TEST_UPSTREAM_DIR = join(TEST_OUTPUT_DIR, 'upstream');

describe('INFRA-002: 拉取原生仓库全量单测用例', () => {
  beforeEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_UPSTREAM_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  describe('parseTestCases', () => {
    it('应该解析 describe 和 it 块', () => {
      const testContent = `
describe('CanvasEngine', () => {
  it('should initialize with default config', () => {
    expect(true).toBe(true);
  });

  it('should handle resize', () => {
    expect(true).toBe(true);
  });
});

describe('NodeManager', () => {
  test('should create node', () => {
    expect(true).toBe(true);
  });
});
`;

      const testFile = join(TEST_UPSTREAM_DIR, 'CanvasEngine.test.ts');
      writeFileSync(testFile, testContent);

      const cases = parseTestCases(testFile);

      expect(cases.length).toBe(3);
      expect(cases[0]).toMatchObject({
        suite: 'CanvasEngine',
        name: 'should initialize with default config',
      });
      expect(cases[1]).toMatchObject({
        suite: 'CanvasEngine',
        name: 'should handle resize',
      });
      expect(cases[2]).toMatchObject({
        suite: 'NodeManager',
        name: 'should create node',
      });
    });

    it('不存在的文件应返回空数组', () => {
      const cases = parseTestCases('/non/existent/file.test.ts');
      expect(cases).toEqual([]);
    });

    it('空文件应返回空数组', () => {
      const testFile = join(TEST_UPSTREAM_DIR, 'empty.test.ts');
      writeFileSync(testFile, '');
      expect(parseTestCases(testFile)).toEqual([]);
    });

    it('应正确记录行号', () => {
      const testContent = `
describe('Test', () => {
  it('first test', () => {});
  it('second test', () => {});
});
`;
      const testFile = join(TEST_UPSTREAM_DIR, 'line.test.ts');
      writeFileSync(testFile, testContent);

      const cases = parseTestCases(testFile);
      expect(cases[0].line).toBeLessThan(cases[1].line);
    });
  });

  describe('buildDirectoryStructure', () => {
    it('应该构建嵌套目录结构', () => {
      const testFiles = [
        'src/canvas/engine/CanvasEngine.test.ts',
        'src/canvas/nodes/NodeManager.test.ts',
        'src/plugins/PluginManager.test.ts',
      ];

      const structure = buildDirectoryStructure(testFiles);

      expect(structure.src).toBeDefined();
      expect(structure.src.canvas).toBeDefined();
      expect(structure.src.canvas.engine).toBeDefined();
      expect(structure.src.plugins).toBeDefined();
    });

    it('空数组应返回空对象', () => {
      const structure = buildDirectoryStructure([]);
      expect(structure).toEqual({});
    });
  });

  describe('generateTestManifest', () => {
    it('应该生成包含元数据的清单文件', () => {
      const mockResult = {
        totalFiles: 2,
        totalCases: 3,
        cases: [
          { file: 'a.test.ts', suite: 'A', name: 'test1', line: 1 },
          { file: 'b.test.ts', suite: 'B', name: 'test2', line: 5 },
        ],
        structure: { src: { test: ['a.test.ts'] } },
      };

      generateTestManifest(mockResult, TEST_OUTPUT_DIR);

      const manifestPath = join(TEST_OUTPUT_DIR, 'test-manifest.json');
      expect(existsSync(join(process.cwd(), TEST_OUTPUT_DIR, 'test-manifest.json'))).toBe(true);

      const manifest = JSON.parse(readFileSync(join(TEST_OUTPUT_DIR, 'test-manifest.json'), 'utf-8'));
      expect(manifest.metadata.totalFiles).toBe(2);
      expect(manifest.metadata.totalCases).toBe(3);
      expect(manifest.cases.length).toBe(2);
    });
  });

  describe('generateRegressionScript', () => {
    it('应该生成可执行的 bash 脚本', () => {
      generateRegressionScript(TEST_OUTPUT_DIR);

      const scriptPath = join(TEST_OUTPUT_DIR, 'run-baseline.sh');
      expect(existsSync(scriptPath)).toBe(true);

      const content = readFileSync(scriptPath, 'utf-8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('pnpm install');
      expect(content).toContain('pnpm test');
      expect(content).toContain('compare-baselines');
    });
  });

  describe('extractTestFiles', () => {
    it('应该返回目标目录下的测试文件路径', () => {
      // 创建模拟文件结构
      const mockFiles = [
        'src/canvas/engine/CanvasEngine.test.ts',
        'src/canvas/nodes/NodeManager.test.ts',
        'src/plugins/PluginManager.test.ts',
        'src/utils/helper.ts', // 非测试文件
      ];

      for (const file of mockFiles) {
        const fullPath = join(TEST_UPSTREAM_DIR, file);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, '// test file');
      }

      const files = extractTestFiles(TEST_UPSTREAM_DIR);

      expect(files.length).toBe(3);
      expect(files.every(f => f.endsWith('.test.ts'))).toBe(true);
      expect(files.some(f => f.includes('helper.ts'))).toBe(false);
    });

    it('不存在的目录应返回空数组', () => {
      const files = extractTestFiles('/non/existent/dir');
      expect(files).toEqual([]);
    });
  });
});
~~~

## 2.3 CANVAS-001（画布兼容性分析）

**目录**：`src/canvas/compat/CANVAS-001/`

### 2.3.1 index.ts

~~~typescript
/**
 * CANVAS-001: 画布核心引擎兼容性分析
 * Task: S1-W1-D4-01
 * Story: CANVAS-001 原有画布核心能力兼容性改造
 * Sprint: 1 | Week: 1 | Day: 4
 *
 * 验收标准：
 * - 架构分析文档输出
 * - 风险点识别
 */

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ 配置常量 ============

const UPSTREAM_SOURCE_DIR = 'tests/regression/upstream/src';
const ANALYSIS_OUTPUT_DIR = 'docs/architecture/canvas-compat';
const INFINITE_CANVAS_CORE_MODULES = [
  'canvas/engine',
  'canvas/nodes',
  'canvas/layers',
  'canvas/selection',
  'canvas/history',
  'canvas/viewport',
  'plugins/PluginManager',
  'tools',
  'import-export',
];

// ============ 类型定义 ============

interface ModuleAnalysis {
  path: string;
  exports: string[];
  dependencies: string[];
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  notes: string[];
}

interface CompatibilityReport {
  generatedAt: string;
  upstreamVersion: string;
  modules: ModuleAnalysis[];
  riskSummary: {
    high: number;
    medium: number;
    low: number;
  };
  breakingChanges: BreakingChange[];
  migrationGuide: MigrationStep[];
}

interface BreakingChange {
  module: string;
  changeType: 'api' | 'behavior' | 'removed' | 'signature';
  description: string;
  severity: 'high' | 'medium' | 'low';
  workaround?: string;
}

interface MigrationStep {
  step: number;
  module: string;
  action: string;
  effort: 'low' | 'medium' | 'high';
  dependencies: string[];
}

// ============ 核心分析函数 ============

/**
 * 扫描源码目录，识别核心模块
 */
export function scanSourceDirectory(sourceDir: string): string[] {
  if (!existsSync(sourceDir)) {
    console.warn(`[CANVAS-001] Source directory not found: ${sourceDir}`);
    return [];
  }

  const modules: string[] = [];

  function walk(dir: string, prefix: string = ''): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = join(prefix, entry.name);

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath, relPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        // 检查是否为核心模块入口
        if (entry.name === 'index.ts' || entry.name === 'index.tsx') {
          modules.push(relative(sourceDir, dir).replace(/\\/g, '/'));
        }
      }
    }
  }

  walk(sourceDir);
  return [...new Set(modules)];
}

/**
 * 分析单个模块
 */
export function analyzeModule(modulePath: string, sourceDir: string): ModuleAnalysis {
  const fullPath = join(sourceDir, modulePath, 'index.ts');
  const exports: string[] = [];
  const dependencies: string[] = [];
  const notes: string[] = [];

  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, 'utf-8');

    // 提取导出
    const exportRegex = /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    // 提取导入依赖
    const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
    let importMatch: RegExpExecArray | null;
    while ((importMatch = importRegex.exec(content)) !== null) {
      if (!importMatch[1].startsWith('.')) {
        dependencies.push(importMatch[1]);
      }
    }

    // 复杂度评估（基于导出数量和代码行数）
    const lineCount = content.split('\n').length;
    const complexity = lineCount > 500 ? 'high' : lineCount > 200 ? 'medium' : 'low';
  }

  // 风险评估
  const riskLevel = assessRisk(modulePath, exports.length, dependencies.length);

  return {
    path: modulePath,
    exports,
    dependencies,
    complexity: complexity || 'low',
    riskLevel,
    notes,
  };
}

/**
 * 评估模块风险等级
 */
function assessRisk(modulePath: string, exportCount: number, depCount: number): 'low' | 'medium' | 'high' {
  // 核心渲染引擎、状态管理风险最高
  const highRiskModules = ['canvas/engine', 'canvas/history', 'canvas/selection'];
  const mediumRiskModules = ['canvas/nodes', 'canvas/layers', 'canvas/viewport', 'plugins/PluginManager'];

  if (highRiskModules.some(m => modulePath.includes(m))) return 'high';
  if (mediumRiskModules.some(m => modulePath.includes(m))) return 'medium';
  return 'low';
}

/**
 * 识别破坏性变更
 */
export function identifyBreakingChanges(
  upstreamModules: ModuleAnalysis[],
  currentModules: ModuleAnalysis[]
): BreakingChange[] {
  const changes: BreakingChange[] = [];

  for (const upstream of upstreamModules) {
    const current = currentModules.find(m => m.path === upstream.path);

    if (!current) {
      changes.push({
        module: upstream.path,
        changeType: 'removed',
        description: `Module ${upstream.path} removed in current codebase`,
        severity: 'high',
        workaround: 'Check if functionality moved to another module',
      });
      continue;
    }

    // 检查导出变化
    const removedExports = upstream.exports.filter(e => !current.exports.includes(e));
    for (const exp of removedExports) {
      changes.push({
        module: upstream.path,
        changeType: 'api',
        description: `Export '${exp}' removed`,
        severity: 'high',
        workaround: 'Find alternative export or implement shim',
      });
    }

    // 检查签名变化（简化：导出数量变化）
    if (upstream.exports.length !== current.exports.length) {
      changes.push({
        module: upstream.path,
        changeType: 'signature',
        description: `Export count changed: ${upstream.exports.length} -> ${current.exports.length}`,
        severity: 'medium',
        workaround: 'Review API changes and update callers',
      });
    }
  }

  return changes;
}

/**
 * 生成迁移指南
 */
export function generateMigrationGuide(changes: BreakingChange[]): MigrationStep[] {
  const steps: MigrationStep[] = [];
  let step = 1;

  // 按严重度分组
  const highChanges = changes.filter(c => c.severity === 'high');
  const mediumChanges = changes.filter(c => c.severity === 'medium');
  const lowChanges = changes.filter(c => c.severity === 'low');

  for (const change of highChanges) {
    steps.push({
      step: step++,
      module: change.module,
      action: `HIGH: ${change.description}. ${change.workaround || 'Requires manual intervention'}`,
      effort: 'high',
      dependencies: [],
    });
  }

  for (const change of mediumChanges) {
    steps.push({
      step: step++,
      module: change.module,
      action: `MEDIUM: ${change.description}. ${change.workaround || 'Update callers'}`,
      effort: 'medium',
      dependencies: [],
    });
  }

  for (const change of lowChanges) {
    steps.push({
      step: step++,
      module: change.module,
      action: `LOW: ${change.description}`,
      effort: 'low',
      dependencies: [],
    });
  }

  return steps;
}

/**
 * 生成兼容性分析报告
 */
export function generateCompatibilityReport(
  upstreamModules: ModuleAnalysis[],
  currentModules: ModuleAnalysis[],
  outputDir: string
): CompatibilityReport {
  const breakingChanges = identifyBreakingChanges(upstreamModules, currentModules);
  const migrationGuide = generateMigrationGuide(breakingChanges);

  const riskSummary = {
    high: upstreamModules.filter(m => m.riskLevel === 'high').length,
    medium: upstreamModules.filter(m => m.riskLevel === 'medium').length,
    low: upstreamModules.filter(m => m.riskLevel === 'low').length,
  };

  const report: CompatibilityReport = {
    generatedAt: new Date().toISOString(),
    upstreamVersion: 'infinite-canvas@main',
    modules: upstreamModules,
    riskSummary,
    breakingChanges,
    migrationGuide,
  };

  // 写入报告
  const reportPath = join(outputDir, 'compatibility-report.json');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'compatibility-report.json'), JSON.stringify(report, null, 2));

  // 生成 Markdown 版本
  const mdPath = join(outputDir, 'COMPATIBILITY_ANALYSIS.md');
  writeFileSync(mdPath, generateMarkdownReport(report));

  console.log(`[CANVAS-001] Compatibility report written to: ${outputDir}`);
  return report;
}

/**
 * 生成 Markdown 格式报告
 */
function generateMarkdownReport(report: CompatibilityReport): string {
  const { riskSummary, breakingChanges, migrationGuide, modules } = report;

  return `# 画布核心引擎兼容性分析报告

> 生成时间: ${report.generatedAt}
> 上游版本: ${report.upstreamVersion}

## 📊 风险概览

| 风险等级 | 模块数量 |
|---------|---------|
| 🔴 高风险 | ${riskSummary.high} |
| 🟡 中风险 | ${riskSummary.medium} |
| 🟢 低风险 | ${riskSummary.low} |

## 📦 核心模块分析

| 模块路径 | 导出数量 | 依赖数量 | 复杂度 | 风险等级 | 备注 |
|---------|---------|---------|--------|---------|------|
${modules.map(m => `| ${m.path} | ${m.exports.length} | ${m.dependencies.length} | ${m.complexity} | ${riskIcon(m.riskLevel)} ${m.riskLevel} | ${m.notes.join('; ') || '-' }`).join('\n')}

## ⚠️ 破坏性变更识别

${breakingChanges.length === 0 ? '未发现破坏性变更 ✅' : breakingChanges.map(c => 
`### ${severityIcon(c.severity)} ${c.module} - ${c.changeType}
- **描述**: ${c.description}
- **严重度**: ${c.severity}
- **规避方案**: ${c.workaround || '暂无'}`).join('\n\n')}

## 🗺️ 迁移指南

${migrationGuide.map(s => 
`### Step ${s.step}: ${s.module}
- **动作**: ${s.action}
- **工作量**: ${s.effort}
- **依赖**: ${s.dependencies.join(', ') || '无'}`).join('\n\n')}

## 📋 行动清单

- [ ] 完成高风险模块适配
- [ ] 解决所有破坏性变更
- [ ] 编写中风险模块测试用例
- [ ] 更新类型定义文件
- [ ] 运行全量回归测试

---
*报告由 CANVAS-001 自动生成*
`;
}

function riskIcon(level: string): string {
  return level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢';
}

function severityIcon(level: string): string {
  return level === 'high' ? '🔴' : level === 'medium' ? '🟡' : '🟢';
}

// ============ 主入口 ============

export async function runCompatibilityAnalysis(
  sourceDir: string = join(process.cwd(), 'tests/regression/upstream/src'),
  outputDir: string = join(process.cwd(), 'docs/architecture/canvas-compat')
): Promise<void> {
  console.log('[CANVAS-001] Starting compatibility analysis...');

  // 1. 扫描上游模块
  const upstreamModulePaths = scanSourceDirectory(sourceDir);
  console.log(`[CANVAS-001] Found ${upstreamModulePaths.length} modules in upstream`);

  // 2. 分析上游模块
  const upstreamModules = upstreamModulePaths.map(p => analyzeModule(p, sourceDir));

  // 3. 扫描当前项目模块（用于对比）
  const currentSourceDir = join(process.cwd(), 'src');
  const currentModulePaths = existsSync(currentSourceDir) ? scanSourceDirectory(currentSourceDir) : [];
  const currentModules = currentModulePaths.map(p => analyzeModule(p, currentSourceDir));

  // 3. 生成报告
  generateCompatibilityReport(upstreamModules, currentModules, outputDir);

  console.log('[CANVAS-001] Analysis completed');
}

// CLI 入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sourceDir = args.find(a => a.startsWith('--src='))?.split('=')[1] || 
    join(process.cwd(), 'tests/regression/upstream/src');
  const outputDir = args.find(a => a.startsWith('--out='))?.split('=')[1] || 
    join(process.cwd(), 'docs/architecture/canvas-compat');

  runCompatibilityAnalysis(sourceDir, outputDir)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[CANVAS-001] Analysis failed:', err);
      process.exit(1);
    });
}

export { scanSourceDirectory, analyzeModule, identifyBreakingChanges, generateMigrationGuide };
~~~

### 2.3.2 README.md

~~~markdown
# CANVAS-001: 画布核心引擎兼容性分析

> **Task ID**: S1-W1-D4-01
> **Story**: CANVAS-001 原有画布核心能力兼容性改造
> **Sprint**: 1 | **Week**: 1 | **Day**: 4
> **Assignee**: 前端开发
> **Story Points**: 2

---

## 📋 验收清单 (Definition of Done)

| # | 验收项 | 标准 | 状态 | 备注 |
|---|--------|------|------|------|
| 1 | 源码目录扫描 | 识别 infinite-canvas 核心模块（引擎/节点/图层/历史/视口/插件/工具/导入导出） | ☐ | |
| 2 | 模块导出分析 | 解析每个模块的 `export` 列表、依赖关系、复杂度 | ☐ | |
| 3 | 架构分析文档输出 | 生成 `docs/architecture/canvas-compat/COMPATIBILITY_ANALYSIS.md` | ☐ | |
| 4 | 风险点识别 | 高/中/低风险模块分类，输出 `riskSummary` | ☐ | |
| 5 | 破坏性变更识别 | 对比上游/当前模块，输出 `breakingChanges`（API/行为/签名/移除） | ☐ | |
| 6 | 迁移指南生成 | 按严重度分级，输出 `migrationGuide` 含步骤/工作量/依赖 | ☐ | |
| 7 | JSON 报告输出 | `compatibility-report.json` 含完整结构化数据 | ☐ | |
| 8 | 单测覆盖 | 核心函数覆盖率 ≥ 80% | ☐ | |

---

## 🚀 快速开始

### 运行完整分析

```bash
# 在项目根目录运行（需先完成 INFRA-002 提取上游源码）
pnpm tsx src/canvas/compat/CANVAS-001/index.ts

# 指定源码目录和输出目录
pnpm tsx src/canvas/compat/CANVAS-001/index.ts --src=tests/regression/upstream/src --out=docs/architecture/canvas-compat
```

### 仅生成迁移指南

```bash
pnpm tsx -e "
import { generateMigrationGuide } from './src/canvas/compat/CANVAS-001/index.ts';
const changes = [...]; // 从报告加载
const guide = generateMigrationGuide(changes);
console.log(JSON.stringify(guide, null, 2));
"
```

---

## 📁 输出产物

```
docs/architecture/canvas-compat/
├── COMPATIBILITY_ANALYSIS.md    # 人类可读的分析报告
├── compatibility-report.json    # 结构化数据（供 CI/工具消费）
└── modules/                     # 可选：各模块详细分析
```

---

## 📊 compatibility-report.json 结构

```json
{
  "generatedAt": "2025-01-16T00:00:00.000Z",
  "upstreamVersion": "infinite-canvas@main",
  "modules": [
    {
      "path": "canvas/engine",
      "exports": ["CanvasEngine", "createEngine"],
      "dependencies": ["fabric", "eventemitter3"],
      "complexity": "high",
      "riskLevel": "high",
      "notes": ["核心渲染循环", "需重点回归"]
    }
  ],
  "riskSummary": { "high": 3, "medium": 4, "low": 2 },
  "breakingChanges": [
    {
      "module": "canvas/engine",
      "changeType": "api",
      "description": "Export 'CanvasEngine' removed",
      "severity": "high",
      "workaround": "Use 'createEngine' factory instead"
    }
  ],
  "migrationGuide": [
    {
      "step": 1,
      "module": "canvas/engine",
      "action": "HIGH: Export 'CanvasEngine' removed. Use 'createEngine' factory instead",
      "effort": "high",
      "dependencies": []
    }
  ]
}
```

---

## 🎯 核心模块风险分级

| 风险等级 | 模块 | 关注点 |
|---------|------|--------|
| 🔴 **高** | `canvas/engine` | 渲染循环、性能、Fabric.js 版本兼容 |
| 🔴 **高** | `canvas/history` | 撤销重做栈、内存管理、序列化 |
| 🔴 **高** | `canvas/selection` | 多选/框选/对齐逻辑、事件冒泡 |
| 🟡 **中** | `canvas/nodes` | 节点 CRUD、类型系统、数据流 |
| 🟡 **中** | `canvas/layers` | 图层树、Z-index、分组/解组 |
| 🟡 **中** | `canvas/viewport` | 缩放/平移/旋转、坐标变换 |
| 🟡 **中** | `plugins/PluginManager` | 沙箱隔离、热加载、生命周期 |
| 🟢 **低** | `tools/*` | 选择/连线/文本工具、交互细节 |

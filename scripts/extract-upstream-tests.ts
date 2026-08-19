import { glob } from "fast-glob";
import { Project, SourceFile, SyntaxKind } from "ts-morph";
import simpleGit, { SimpleGit } from "simple-git";
import * as fs from "fs";
import * as path from "path";

const UPSTREAM_REPO = "https://github.com/infinite-canvas/nova-qihua.git";
const CLONE_DIR = path.resolve("tmp/upstream-clone");
const OUTPUT_DIR = path.resolve("tests/regression/upstream");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "test-manifest.json");
const BASELINE_SCRIPT_PATH = path.join(OUTPUT_DIR, "run-baseline.sh");

interface TestCase {
  file: string;
  suite: string;
  test: string;
  type: "describe" | "it" | "test";
  line: number;
}

async function main() {
  console.log("[1/5] Cloning upstream repo...");
  if (fs.existsSync(CLONE_DIR)) {
    fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(CLONE_DIR, { recursive: true });

  const git = simpleGit();
  await git.clone(UPSTREAM_REPO, CLONE_DIR, ["--depth", "1"]);
  console.log("    Clone done.");

  console.log("[2/5] Scanning test files...");
  const testFiles = await glob("**/*.test.ts", {
    cwd: CLONE_DIR,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  });
  console.log(`    Found ${testFiles.length} test files.`);

  console.log("[3/5] Parsing test cases with ts-morph...");
  const project = new Project({
    tsConfigFilePath: path.join(CLONE_DIR, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const allTests: TestCase[] = [];

  for (const filePath of testFiles) {
    const sourceFile = project.addSourceFileAtPath(filePath);
    const relativePath = path.relative(CLONE_DIR, filePath);

    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.CallExpression) {
        const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
        const expr = callExpr.getExpression();
        const name = expr.getText();

        if (["describe", "it", "test"].includes(name)) {
          const args = callExpr.getArguments();
          if (args.length > 0) {
            const firstArg = args[0];
            const testName = firstArg.getText().replace(/^["'`]|["'`]$/g, "");
            const line = firstArg.getStartLineNumber();

            allTests.push({
              file: relativePath,
              suite: name === "describe" ? testName : "",
              test: testName,
              type: name as "describe" | "it" | "test",
              line,
            });
          }
        }
      }
    });
  }

  console.log(`    Extracted ${allTests.length} test cases.`);

  console.log("[4/5] Writing test-manifest.json...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    upstreamRepo: UPSTREAM_REPO,
    cloneDir: CLONE_DIR,
    totalFiles: testFiles.length,
    totalTests: allTests.length,
    tests: allTests,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`    Written to ${MANIFEST_PATH}`);

  console.log("[5/5] Generating run-baseline.sh...");
  const baselineScript = `#!/usr/bin/env bash
# Auto-generated baseline test runner for upstream regression suite
# Generated: ${new Date().toISOString()}
# Upstream: ${UPSTREAM_REPO}

set -euo pipefail

CLONE_DIR="${CLONE_DIR}"
cd "\${CLONE_DIR}"

echo "=== Installing upstream dependencies ==="
if [ -f package.json ]; then
  if command -v pnpm &> /dev/null; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  elif command -v npm &> /dev/null; then
    npm ci 2>/dev/null || npm install
  fi
fi

echo "=== Running test suite ==="
# Run all test files found
${testFiles.map((f) => `npx vitest run "${path.relative(CLONE_DIR, f)}" || true`).join("\n")}

echo "=== Baseline run complete ==="
`;
  fs.writeFileSync(BASELINE_SCRIPT_PATH, baselineScript);
  fs.chmodSync(BASELINE_SCRIPT_PATH, 0o755);
  console.log(`    Written to ${BASELINE_SCRIPT_PATH} (executable)`);

  console.log("\n✅ Done!");
  console.log(`   Manifest: ${MANIFEST_PATH}`);
  console.log(`   Baseline script: ${BASELINE_SCRIPT_PATH}`);
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
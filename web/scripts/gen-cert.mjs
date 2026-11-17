#!/usr/bin/env node
// 生成本地开发用的自签名证书（仅用于本机 / 局域网调试，禁止用于生产环境）。
//
//   pnpm cert                 生成 web/certs/dev-cert.pem + dev-key.pem
//   pnpm cert --force         覆盖已存在的证书
//   pnpm cert --days 397      自定义有效期
//   pnpm cert --host dev.local --ip 192.168.1.50
//
// 依赖 openssl：优先使用 OPENSSL_BIN，其次 PATH 中的 openssl，
// 最后回退到 Windows 上 Git for Windows 自带的 openssl。
// 终端输出保持 ASCII，避免 Windows PowerShell 5.1（GBK 代码页）下中文乱码。
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { resolveInsideWeb, webDir } from "./lib/fsx.mjs";

const USAGE = `Usage: node scripts/gen-cert.mjs [options]

  --force             Overwrite existing certificate
  --days <n>          Validity in days (default: 397)
  --out-dir <dir>     Output dir relative to web/ (default: certs)
  --host <name>       Extra DNS name (repeatable)
  --ip <addr>         Extra IP address (repeatable)
  -h, --help          Show this help

Env: OPENSSL_BIN (path to the openssl executable)`;

const DEFAULT_DAYS = 397;

function fail(message) {
    console.error(`\n[cert] ERROR: ${message}`);
    process.exit(1);
}

function parseArgs(argv) {
    const options = { force: false, days: DEFAULT_DAYS, outDir: "certs", hosts: [], ips: [] };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            console.log(USAGE);
            process.exit(0);
        } else if (arg === "--force") {
            options.force = true;
        } else if (arg.startsWith("--days=")) {
            options.days = Number(arg.slice("--days=".length));
        } else if (arg === "--days") {
            options.days = Number(argv[++i]);
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = arg.slice("--out-dir=".length);
        } else if (arg === "--out-dir") {
            options.outDir = argv[++i] ?? "";
        } else if (arg.startsWith("--host=")) {
            options.hosts.push(arg.slice("--host=".length));
        } else if (arg === "--host") {
            options.hosts.push(argv[++i] ?? "");
        } else if (arg.startsWith("--ip=")) {
            options.ips.push(arg.slice("--ip=".length));
        } else if (arg === "--ip") {
            options.ips.push(argv[++i] ?? "");
        } else {
            fail(`Unknown argument: ${arg}\n\n${USAGE}`);
        }
    }

    if (!Number.isFinite(options.days) || options.days <= 0) fail("--days must be a positive number");
    if (!options.outDir) fail("--out-dir requires a value");
    options.hosts = options.hosts.filter(Boolean);
    options.ips = options.ips.filter(Boolean);
    return options;
}

/** 找到可用的 openssl：环境变量 > PATH > Windows 上 Git 自带。 */
function findOpenSSL() {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const candidates = [
        process.env.OPENSSL_BIN,
        "openssl",
        process.platform === "win32" ? join(programFiles, "Git", "usr", "bin", "openssl.exe") : null,
        process.platform === "win32" ? join(programFiles, "Git", "mingw64", "bin", "openssl.exe") : null,
        process.platform === "win32" ? join(programFilesX86, "Git", "usr", "bin", "openssl.exe") : null,
    ].filter(Boolean);

    for (const bin of candidates) {
        const probe = spawnSync(bin, ["version"], { encoding: "utf8" });
        if (!probe.error && probe.status === 0) return { bin, version: probe.stdout.trim() };
    }
    return null;
}

/** 证书需要覆盖的域名与 IP：localhost + 回环 + 本机所有局域网 IPv4。 */
function collectSans(extraHosts, extraIps) {
    const hosts = new Set(["localhost", ...extraHosts]);
    const ips = new Set(["127.0.0.1", "::1", ...extraIps]);

    for (const entries of Object.values(networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === "IPv4" && !entry.internal) ips.add(entry.address);
        }
    }

    return {
        hosts: [...hosts],
        ips: [...ips],
        extension: [...[...hosts].map((host) => `DNS:${host}`), ...[...ips].map((ip) => `IP:${ip}`)].join(","),
    };
}

const options = parseArgs(process.argv.slice(2));
const outDir = resolveInsideWeb(options.outDir, { label: "Output dir" });
const certPath = join(outDir, "dev-cert.pem");
const keyPath = join(outDir, "dev-key.pem");

const openssl = findOpenSSL();
if (!openssl) {
    fail(
        ["openssl not found.", "Install it or point OPENSSL_BIN at the executable:", '  Windows: "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" (ships with Git for Windows)', "  macOS:   brew install openssl", "  Linux:   apt install openssl"].join(
            "\n",
        ),
    );
}

if (existsSync(certPath) && existsSync(keyPath) && !options.force) {
    console.log("[cert] Certificate already exists, nothing to do.");
    console.log(`[cert]   cert: ${certPath}`);
    console.log(`[cert]   key:  ${keyPath}`);
    console.log("[cert] Use --force to regenerate.");
    printDetails(openssl.bin, certPath);
    process.exit(0);
}

function printDetails(bin, file) {
    const detail = spawnSync(bin, ["x509", "-in", file, "-noout", "-subject", "-dates", "-ext", "subjectAltName"], {
        encoding: "utf8",
    });
    if (detail.status !== 0) return;
    for (const line of detail.stdout.split(/\r?\n/)) {
        const text = line.trim();
        if (text) console.log(`[cert]   ${text}`);
    }
}

const { hosts, ips, extension } = collectSans(options.hosts, options.ips);

mkdirSync(outDir, { recursive: true });

console.log(`[cert] openssl: ${openssl.version}`);
console.log(`[cert] SANs:    ${extension}`);
console.log(`[cert] Valid:   ${options.days} days`);
console.log("[cert] Generating self-signed certificate...");

// 用临时 config 而不是 -addext：macOS 自带 LibreSSL 没有 -addext，config 写法兼容性最好。
const altNames = [...hosts.map((host, index) => `DNS.${index + 1} = ${host}`), ...ips.map((ip, index) => `IP.${index + 1} = ${ip}`)].join("\n");
const configPath = join(tmpdir(), `nova-dev-cert-${process.pid}.cnf`);
writeFileSync(
    configPath,
    [
        "[req]",
        "distinguished_name = dn",
        "x509_extensions = v3_req",
        "prompt = no",
        "",
        "[dn]",
        "CN = localhost",
        "O = Nova Canvas Development",
        "",
        "[v3_req]",
        "basicConstraints = critical, CA:FALSE",
        "keyUsage = critical, digitalSignature, keyEncipherment",
        "extendedKeyUsage = serverAuth",
        "subjectAltName = @alt_names",
        "",
        "[alt_names]",
        altNames,
        "",
    ].join("\n"),
    "utf8",
);

const result = spawnSync(openssl.bin, ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", String(options.days), "-nodes", "-keyout", keyPath, "-out", certPath, "-config", configPath], { encoding: "utf8" });

try {
    unlinkSync(configPath);
} catch {
    // 临时文件清理失败不影响结果
}

if (result.error) fail(`Failed to run openssl: ${result.error.message}`);
if (result.status !== 0) fail(`openssl exited with code ${result.status}\n${result.stderr || result.stdout}`);

if (process.platform !== "win32") {
    try {
        chmodSync(keyPath, 0o600);
    } catch {
        // 文件系统不支持 chmod 时忽略
    }
}

console.log("\n[cert] OK");
console.log(`[cert]   cert: ${certPath}`);
console.log(`[cert]   key:  ${keyPath}`);
printDetails(openssl.bin, certPath);

console.log("\n[cert] Next steps:");
console.log("[cert]   1. Trust the certificate locally (browser warning disappears):");
if (process.platform === "win32") {
    console.log(`[cert]      certutil -user -addstore Root "${certPath}"`);
} else if (process.platform === "darwin") {
    console.log(`[cert]      sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`);
} else {
    console.log(`[cert]      sudo cp "${certPath}" /usr/local/share/ca-certificates/nova-dev.crt && sudo update-ca-certificates`);
}
console.log("[cert]   2. Enable HTTPS in web/.env.local:");
console.log("[cert]      HTTPS=1");
console.log("[cert]   3. Restart: pnpm dev   (or pnpm preview)");
console.log("[cert]   Note: for a quick throwaway check you can skip trust and use https://localhost:5173 with a browser warning.");

// 保持目录结构清晰：说明文件不参与运行
if (!existsSync(join(outDir, "README.md"))) {
    writeFileSync(join(outDir, "README.md"), "# 本地开发证书\n\n由 `pnpm cert` 生成，已加入 .gitignore，**不要提交**，也不要在生产环境使用。\n", "utf8");
}

console.log(`\n[cert] Output dir: ${outDir} (${webDir})`);

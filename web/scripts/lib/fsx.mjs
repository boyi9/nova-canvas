// 构建脚本共用的文件系统工具：路径安全检查、目录清理、体积统计。
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** web/ 目录的绝对路径（本文件位于 web/scripts/lib/）。 */
export const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * 把相对/绝对路径解析到 web/ 之内，避免脚本误删仓库外的文件。
 * @param {string} input 相对 web/ 的路径或绝对路径
 * @param {{ label?: string }} [options]
 * @returns {string} 规范化后的绝对路径
 */
export function resolveInsideWeb(input, { label = "path" } = {}) {
    const abs = resolve(webDir, input);
    const rel = relative(webDir, abs);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`${label} must be inside web/ (got: ${abs})`);
    }
    return abs;
}

/** 递归收集目录下的所有文件（不跟随符号链接）。 */
export function walkFiles(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(abs, out);
        else if (entry.isFile()) out.push(abs);
    }
    return out;
}

/** 统计目录内的文件数与总字节数；目录不存在时返回 0。 */
export function dirStats(dir) {
    if (!existsSync(dir)) return { files: 0, bytes: 0 };
    const files = walkFiles(dir);
    return { files: files.length, bytes: files.reduce((sum, file) => sum + statSync(file).size, 0) };
}

/** 删除目录并返回删除前的规模；目录不存在时 removed=false。 */
export function removeDir(dir) {
    const stats = dirStats(dir);
    if (!existsSync(dir)) return { removed: false, ...stats };
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    return { removed: true, ...stats };
}

/** 人类可读的体积格式（B / KB / MB / GB）。 */
export function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

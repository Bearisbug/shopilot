// 本地文件存储（ENT-File，DESIGN §17）：file.path 存相对 DATA_DIR 的路径，读写都经这里解析。
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

export function dataPath(relative: string): string {
  const root = path.resolve(env().DATA_DIR);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`文件路径越出 DATA_DIR：${relative}`);
  return full;
}

export async function writeDataFile(relative: string, data: Uint8Array): Promise<void> {
  const full = dataPath(relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

/** 删除磁盘文件；文件已不存在时静默返回 */
export async function removeDataFile(relative: string): Promise<void> {
  await rm(dataPath(relative), { force: true });
}

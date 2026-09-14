// 构建 dsh-prompt-only-forge：src → lib 直拷（无编译依赖，与 writing-pad 同构）。
// v0.3.0：src 只剩「最小宿主 index.js」+「客户端 bundle client.bundle.js」。
import { rm, cp, mkdir, readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
// preflight：build 前必过——语法/大小/单一 ModuleLoader.load/注入面在位/只注入不发送
import { execFileSync } from "node:child_process"
try { execFileSync("./scripts/preflight.sh", { stdio: "inherit" }) } catch (e) {
  console.error("[dsh-prompt-only-forge] preflight 失败, build 中断")
  process.exit(1)
}

await rm(new URL("../lib", import.meta.url), { force: true, recursive: true })
await mkdir(new URL("../lib", import.meta.url), { recursive: true })
await cp(new URL("../src/index.js", import.meta.url), new URL("../lib/index.js", import.meta.url))
await cp(new URL("../src/client.bundle.js", import.meta.url), new URL("../lib/client.js", import.meta.url))
const copied = await readdir(new URL("../lib", import.meta.url))
console.log('built dsh-prompt-only-forge:', copied.sort().join(', '))

/**
 * smoke-apply.mjs — host 半边冒烟（改插件红线 10：上线前用真 apply + 假 cordis ctx 跑一遍）。
 * v0.3.0 起 host 半边是**最小占位**：不读任何 ctx 服务、不注册任何路由、无 settings schema。
 * 探针 0 依赖 —— 用 Proxy 记录「apply 到底碰了 ctx 的什么」，期望是空集。
 * 运行：node scripts/smoke-apply.mjs
 */
import { readFileSync } from "node:fs"
import * as plugin from "../src/index.js"

let pass = 0
let fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log("  ok - " + label) } else { fail++; console.log("  FAIL - " + label) }
}

const touched = []
const ctx = new Proxy({}, {
  get(_t, key) {
    if (typeof key === "string") touched.push(key)
    return undefined
  },
})

let threw = null
try { plugin.apply(ctx, { contextMode: "full", traceDir: "/tmp/legacy-key" }) } catch (e) { threw = e }

ok(threw === null, "apply 不抛错（即使传入历史配置键）")
ok(touched.length === 0, "apply 不触碰任何 ctx 服务（实碰: " + JSON.stringify(touched) + "）")
ok(Array.isArray(plugin.inject) && plugin.inject.length === 0, "inject 声明为空（纯客户端插件）")
ok(plugin.name === "dsh-prompt-only-forge", "name 唯一化: " + plugin.name)

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
ok(pkg.name === plugin.name, "package.json name 与插件 name 一致")
ok(pkg.version === plugin.VERSION, "package.json version 与 VERSION 一致（" + plugin.VERSION + "）")
ok(plugin.default && plugin.default.name === plugin.name && typeof plugin.default.apply === "function", "default 导出兼容 cordis loader")
ok(plugin.buildApi === undefined && plugin.PolishError === undefined && plugin.effectiveConfig === undefined, "旧服务端 API 面已不在导出中")

console.log("\nsmoke-apply: " + pass + "/" + (pass + fail) + " " + (fail === 0 ? "PASS" : "FAIL"))
process.exit(fail === 0 ? 0 : 1)

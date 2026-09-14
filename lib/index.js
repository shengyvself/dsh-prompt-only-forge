/**
 * dsh-prompt-only-forge — host 半边（v0.3.0 完全重构后的**最小占位**）。
 *
 * 行为（用户指令 2026-09-14）：点主框 ✨ **只做一件事**——把「打磨提示词」注入用户输入栏（不发送）。
 * 因此本插件**不再有任何服务端行为**：无 HTTP 路由、无 ctx 服务依赖、无模型调用、无 trace、
 * 无子代理编排。真正的打磨由用户按下回车后、由当前会话的主 agent 带全上下文完成。
 *
 * 为什么还留 host 半边：包必须在 boot graph 里，客户端半边（package.json 的 exports "./client"）
 * 才会被 DSH 客户端加载；另外这行启动日志是「HMR/重启后新代码确实生效」的取证锚点。
 *
 * 历史实现（0.0.1–0.2.0 的会话复刻 / 意图骨架 / 子代理编排）完整快照在 legacy/0.2.0-subagent/。
 */
export const name = 'dsh-prompt-only-forge'
export const VERSION = '0.3.0'
/** 不依赖任何 ctx 服务（纯客户端插件）。 */
export const inject = []

/** @param {unknown} [_ctx] @param {unknown} [_patchConfig] */
export function apply(_ctx, _patchConfig) {
  console.log('[dsh-prompt-only-forge] ' + VERSION + ' 纯客户端注入模式：点 ✨ 只把打磨提示词写入输入栏（无路由 / 无模型调用 / 不发送）')
}

export default { name, inject, apply }

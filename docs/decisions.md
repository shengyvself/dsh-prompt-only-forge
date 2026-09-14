# 决策记录：narrative-prompt-polish 内部设计取舍

> 本文档只记录本插件**自身**的设计抉择与权衡依据；不再附上游对比。

## 1. 整体架构选型：HTTP prefix 路由
- 用 `webServer.register({kind:"prefix"})` + 信任围栏 + JSON 信封。
- 理由：测试可直接驱动方法表，无需 cordis 运行时；围栏与信封解耦便于纯函数单测。

## 2. LLM 直调消息构造：手写 userMessage / assembleText
- 不 import `@deepseek-ai/dsh-llm` 的 createUserMessage / BlockAssembler。
- 理由：服务端包必须真存在才允许装；该包曾因 npm 缺版本引发过崩溃连锁。行为等价：text-delta 累积 + finish.kind 校验一致。

## 3. 上下文策略：三档 contextMode
- `full`（默认）：`ctx.sessions.get().deriveMessages()` + `requestHeader().system/config` 复刻完整前缀直调 `ctx.llm.stream`——前缀与主会话一致即命中 prompt cache。
- `partial`：`sessionQuery.readSurface` 过滤折叠近期 user/assistant 段。
- `none`：只发草稿。
- 非 live 会话走 `sessionQuery.readSession(id)` raw log + foldRequestHeader/deriveEventMessage 离线重建（dsh-session 动态 import，失败降 partial）。
- partial 模式暂不做 background 压缩二次调用：保持单次直调的延迟可预测性；需要时可在 assembleContext 内加回。

## 4. 意图骨架：正则预分类 + 双落位
- 本地正则预分类 debug/implement/explain/chat。
- partial/none 时骨架进 system；full 时骨架作为末尾 user 指令的组织要求（system 保持会话原文，前缀不动才命中 cache）。
- `intentEnabled=false` 回退单一 POLISH_SYSTEM 指令。

## 5. CAS 写回：客户端职责
- `ref` 快照 + `AbortController` + `aliveRef` 三件套；并扩展到 sidebar target（`readTarget` 快照 vs 回写前 `readTarget`）。

## 6. 错误细分
- 业务码 `no-session / route-unavailable / rejected / stream-failed / empty-result / context-fallback` 全部落地。
- 另保留基建码 `bad-request / not-found / settings-unavailable / forbidden`。
- context-fallback 在 strictFull 失败路径与组装异常路径出现；软降级走 fallbackReasons 字段不报错。

## 7. 引用 chip 拒绝
- composer 引用占位符 U+FFFC 送模型会产生幽灵引用——草稿含 \uFFFC → `rejected:references`。

## 8. inflight supersession
- 主框按钮由组件 abortRef 承担；sidebar bridge 按 target 记 inflight，同框新触发 abort 旧的。

## 9. 设置持久化：settings 服务优先、patch config 兜底
- settingsService.register(ns, JSON Schema) + try/catch——不引入 schemastery 硬依赖；settings 缺位时 config.update 返回 503 settings-unavailable（诚实暴露不可持久化，静默内存态会造成「重启丢配置」困惑）。

## 10. trace：文件不数据库
- 落盘到 `lore/traces/prompt-polish/YYYY-MM-DD.jsonl`，与 lore 系统对齐可被 narrative 工具分析。
- hash 截断 sha256 前 16 位存指纹不存全文（上下文可能含敏感代码）；cacheHit 从 `usage.prompt_cache_hit_tokens` 尽力提取。

## 11. sidebar 联动：slot 缺失的现实（**0.2.0 起部分作废，见 §13**）
> 2026-09-13：宿主扫描与悬浮按钮层已随 better-sidebar 一并移除；本条只保留**事件总线**契约。
- 实测 better-sidebar 仅暴露 `conversation.chat.turnTail` / `settings.section`，无 floating-tools slot → 走 B 方案：MutationObserver 扫描宿主内的 textarea/[contenteditable]。
- 悬浮按钮挂插件自有 fixed 层（body 直挂 `data-npp-float-layer`），按 getBoundingClientRect 定位——不修改 DSH DOM，规避 React reconciliation 冲突。
- 通信 CustomEvent 总线（trigger/result），外部模块可不带 targetElement 广播 trigger 自理回写，或带 targetElement 由 bridge 代跑 CAS+回写。

## 12. 安全边界
- fence：Host loopback 或连接行 trustedHosts；cross-site/跨源 origin 拒绝（DNS rebinding 防御，非认证）。
- 会话只读：deriveMessages/requestHeader/readSession/readSurface 全部只读投影；llm.stream 无 sessionId 参数——物理上不可能污染主会话历史。
- 密钥零接触：provider/model 继承自会话 header 或用户显式配置，无任何凭据读写。

## 13. 主路径宿主迁移：better-sidebar sidechat → 内核原生子代理（2026-09-13，0.2.0）
- **背景**：0.0.20 起主流程是「点 ✨ → better-sidebar 的 sidechat 子会话」。但 better-sidebar 已
  从本部署架构移除（0.1.5 起右侧栏面板一律走官方 keyed 槽位；better-sidebar 自身 `disabled`），
  其服务 `ctx.betterSidebar` 永久缺位——旧客户端 `inject` 里含 `betterSidebar`，
  cordis 注入守卫会让 `apply` **永不执行**（主框 ✨ 与设置面板都不注册）。
- **候选与取舍**：① 自研右侧栏聊天面板＝重写官方 ChatView（否决，重复造轮子）；
  ② 原生**会话分叉**（`ctx.sessions.fork`）＝真实顶层会话（用户裁决：不要，选子代理语义）；
  ③ **内核原生 continuable 子代理**（采纳）。
- **采纳方案**：`ctx.subagents.startContinuable({ provider: 'fork', request: { parent, prompt } })`。
  fork provider（`dsh-subagent-fork-in-process`）`inheritsParentContext = true`：子代理 seed
  母会话**已完成轮**（不含进行中的那一轮），并继承父 Agent 的 provider/model/推理档与预设；
  `split` 语义与官方 `subagent_fork` 工具同源。
- **为什么符合红线 9**：子代理不可用/主会话无 live agent/启动异常时**全部显式抛错**并 toast，
  不回退到 `/api/polish` 单次直改。单次路径仍在，但只服务事件总线与 headless 场景。
- **代价与边界**：需要母会话有 live Agent（agent 被回收时点 ✨ 会报 no-live-agent）；
  母会话无已完成轮时 fork 只给空 seed（子代理从零开始，不是错误）；
  子代理是**子代理**（列在会话列表的「子代理」目录下），可被官方输入框继续对话（continuable
  且 parentAvailable）。

## 14. 完全重构：改写式 polish（LLM/子代理）→ 纯注入（2026-09-14，v0.3.0）
- **用户指令**：点图标时**只会发生**「把打磨提示词注入输入栏，不发送」；并批准「作为替代原插件的新插件
  开发 + 重命名」（新名 dsh-prompt-only-forge，原 narrative-prompt-polish）。
- **为什么砍掉服务端**：0.0.1–0.2.0 的主路径（会话复刻 → LLM 单次改写 → 0.2.0 的可对话子代理）都要求
  插件自己持有一个模型调用面：需要解析渠道、读会话历史、管预算/超时/错误码/trace，并在 fork 子代理里
  复现主会话上下文。实测代价是三类问题：① 子代理对自身定位的认知错误（0.2.0 复盘）；② 与主会话上下文
  割裂（子代理拿到的是 seed 快照，而真正该做打磨的是**已经持有全部上下文的主 agent**）；③ 大量只在
  「插件直调模型」路径上才存在的失败面（channel/session/route/settings 四类缺位）。
- **现在的责任边界**：插件只做**一**件有确定性的事——把模板写进输入栏（setDraft，唯一状态写入）；
  打磨本身交给当前会话的主 agent（它天然拥有全部历史、工具与文件访问）。插件不需要模型、不需要会话、
  不需要配置，因此 host 半边退化为最小占位（inject = []，仅一行启动日志供 HMR/重启取证）。
- **模板不是「插件的一部分」而是「提示词契约」**：四行固定文本 + 一个 <内容> 占位符；空输入栏保留
  占位符（用户自己填），有草稿则嵌入草稿（不丢用户已写内容），已是模板则不重复包裹（幂等）。
  逐字锁定在 src/client.bundle.js 的 TEMPLATE，由 preflight 关4 + tests/unit.test.mjs 双重看护。
- **红线 9（不找替代路径）在本轮的落地方式**：不存在「主路径失败」了——插件不再有会失败的外部依赖
  （唯一可失败点是 inputActions 未注入，此时显式 toast 报错，不静默）。preflight 关5 把「不发送/不联网/
  不起子代理」写成反守卫：一旦有人往 bundle 里加回 submit / fetch( / 子代理调用，构建即失败。
- **旧实现去哪儿了**：legacy/0.2.0-subagent/（含当时的设计文档 sidebar-integration.md）。若要恢复
  「改写式 polish」，那是一套独立能力，应以新插件形态重新立项，而不是在本插件里复活。

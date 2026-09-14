# 架构（v0.3.0，纯注入模式）

> 2026-09-14 完全重构；旧架构（会话复刻 / 意图骨架 / CAS 回写 / 子代理）见
> `legacy/0.2.0-subagent/docs/architecture.md`，裁决理由见 `docs/decisions.md` §14。

## 一页图

```
用户点击 ✨（conversation.input.right 槽位，会话级）
        │
        ▼
PromptPolishButton（React，客户端 bundle）
        │  draft  = props.useInput(s => s).draft      ← 0.1.5 会话标准 props 契约
        │  text   = buildInjectText(draft)            ← 纯函数：模板 + <内容> 填充
        │  status = injectPrompt(props.inputActions, draft)
        ▼
inputActions.setDraft(text)      ← 唯一状态写入；到此结束
        │
        ▼
用户在输入栏里看到打磨提示词（可编辑）→ 自己按回车
        │
        ▼
当前会话的主 agent 带全部上下文打磨提示词 → 回复即成品
```

## 边界

| 面 | 状态 |
|---|---|
| 服务端路由 / API | **无**（host 半边 inject = []） |
| 模型调用 / 渠道解析 | **无** |
| 会话读写（历史 / 子代理 / 落盘） | **无** |
| settings / 配置文件 | **无**（旧 config 段整体移除） |
| ctx 服务依赖 | `slots` 一个 |
| 对外网络 | **无**（preflight 关5 反守卫锁死） |

## 契约

- **槽位**：`conversation.input.right`，id = `dsh-prompt-only-forge`，order = 0。
- **props**（0.1.5 实机取证）：`useInput`（SnapshotSelectorHook<InputState>，.draft 为输入栏文本）
  与 `inputActions`（setDraft 等）。旧写法 props.input.draft 在本内核恒为 undefined。
- **模板**：四行固定文本 + `<内容>` 占位符；填充规则见 README。
- **幂等**：输入栏已含模板首行时 buildInjectText 返回 null，不写、只提示。
- **失败面**：仅 inputActions 缺失（返回 no-input-actions → toast）。没有网络/模型/会话类失败。

## 门禁

`scripts/preflight.sh`（build 前置，6 关）：
1. `src/*.js` 语法 2. bundle 体积比例窗口 3. 单一 __ModuleLoader__.load
4. 注入面在位（模板三要素 + setDraft + 槽位注册 + inject: ["slots"]）
5. **反守卫「只注入不发送」**：submit / fetch( / XMLHttpRequest / WebSocket / EventSource /
   subagents / openSubagent / ctx.sessions / ctx.llm / 服务端路由串 出现即失败
6. better-sidebar 耦合为 0（旧 inject 会让 apply 永不执行）

单测另有一条源码级同款红线断言（`tests/unit.test.mjs`），与关5 互为双保险。

#!/bin/bash
# dsh-prompt-only-forge preflight（v0.3.0 纯注入模式）——build 前必过：
#  1) JS 语法 (node --check)
#  2) bundle 大小无异常翻倍（基线 PREV_BYTES）
#  3) 单一 __ModuleLoader__.load 顶层调用（13:08 重复 bug 教训）
#  4) 注入面在位（模板三要素 + setDraft + 槽位注册 + inject 声明）
#  5) 反守卫：**只注入、不发送** —— 不出现任何发送/联网/子代理/回写面
#  6) better-sidebar 耦合为 0
set -e
M=$(dirname "$(dirname "$(readlink -f "$0")")")
cd "$M"

fail=0
for f in src/*.js; do
  if ! node --check "$f" 2>/dev/null; then
    echo "X 语法失败: $f"; fail=1
  fi
done
[ "$fail" -eq 0 ] && echo "OK 关1: 语法" || exit 1

# 关2：体积异常的语义是「同一文件被重复拼接/整段复制」——用比例窗口守住。
PREV_BYTES=9300
BUNDLE="$M/src/client.bundle.js"
CUR_BYTES=$(stat -c %s "$BUNDLE")
python3 -c "CUR=$CUR_BYTES; PREV=$PREV_BYTES; import sys; r=CUR/PREV; sys.exit(0 if (0.7<=r<=1.5) else 1)"
if [ $? -ne 0 ]; then
  echo "X 字节异常: 当前 $CUR_BYTES, 基线 $PREV_BYTES"
  exit 1
fi
echo "OK 关2: 大小 $CUR_BYTES/$PREV_BYTES"

LO=$(grep -c "^window.__ModuleLoader__\.load" "$BUNDLE" || true)
if [ "$LO" -gt 1 ]; then
  echo "X 发现 $LO 个 __ModuleLoader__.load"
  exit 1
fi
echo "OK 关3: 单一 __ModuleLoader__.load ($LO)"

# 关4：注入面在位（模板逐行 + 写入动作 + 槽位注册 + inject 声明）
for guard in "# 【任务】将此前的所有信息作为背景知识，帮我打磨提示词。:1" "<内容>:1" "以下是原始提示词或者修改意见:1" "这不是给你的指令:1" "setDraft:2" "conversation.input.right:2" "inject: [\"slots\"]:1" "slots service unavailable at boot:1"; do
  pat="${guard%:*}"
  need="${guard##*:}"
  have=$(grep -cF -- "$pat" "$BUNDLE" || true)
  if [ "$have" -lt "$need" ]; then
    echo "X 注入面缺失: $pat 出现 $have 次, 至少 $need 次"
    exit 1
  fi
done
echo "OK 关4: 注入面在位"

# 关5（反守卫，用户红线「只会发生注入，不发送」）：任何发送/联网/子代理/服务端 API 面都不允许出现
for banned in "submit" "fetch(" "XMLHttpRequest" "WebSocket" "EventSource" "subagents" "openSubagent" "dsh-prompt-only-forge/api" "ctx.sessions" "ctx.llm"; do
  have=$(grep -cF -- "$banned" "$BUNDLE" || true)
  if [ "$have" -ne 0 ]; then
    echo "X 越界面残留: $banned 出现 $have 次（本插件只允许注入输入栏）"
    exit 1
  fi
done
echo "OK 关5: 只注入不发送（发送/联网/子代理面为 0）"

# 关6：better-sidebar 耦合必须彻底清零（旧 inject 会让 apply 永不执行）
for banned in "ctx.betterSidebar" "betterSidebar" "sidechat.start"; do
  have=$(grep -cF -- "$banned" "$BUNDLE" || true)
  if [ "$have" -ne 0 ]; then
    echo "X 残留 better-sidebar 耦合: $banned 出现 $have 次"
    exit 1
  fi
done
echo "OK 关6: better-sidebar 耦合为 0"

echo ""
echo "OK preflight 通过, 可 build"

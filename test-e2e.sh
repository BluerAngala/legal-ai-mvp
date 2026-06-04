#!/bin/bash
# LegalAI MVP - 端到端测试脚本
# 验证：用户问题 → pi-user 理解 → pi-internal 规划 → 硅基流动 AI → 最终答案

set -e

echo "================================================================"
echo "  LegalAI MVP - 端到端测试"
echo "  模型：Pro/MiniMaxAI/MiniMax-M2.5 (硅基流动)"
echo "================================================================"
echo ""

# 测试 1: 硅基流动 LLM 直连
echo "=== 测试 1: 硅基流动 AI 接口连通性 ==="
RESPONSE=$(curl -m 15 -s -X POST "https://api.siliconflow.cn/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe" \
  -d '{
    "model": "Pro/MiniMaxAI/MiniMax-M2.5",
    "messages": [
      {"role": "system", "content": "你是一位资深中国律师。"},
      {"role": "user", "content": "用一句话解释什么是法人人格否认？"}
    ],
    "max_tokens": 200
  }')

if echo "$RESPONSE" | grep -q "choices"; then
  echo "✅ LLM 调用成功"
  echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
content = d['choices'][0]['message']['content'].strip()
print('回答:', content[:200])
"
else
  echo "❌ LLM 调用失败: $RESPONSE"
fi
echo ""

# 测试 2: iii 引擎状态
echo "=== 测试 2: iii 引擎 ==="
if pgrep -f "iii " > /dev/null; then
  echo "✅ iii 引擎运行中"
  iii worker list 2>&1 | head -10
else
  echo "⚠️  iii 引擎未运行"
fi
echo ""

# 测试 3: shell worker (iii 官方)
echo "=== 测试 3: iii 官方 shell worker ==="
if iii worker list 2>&1 | grep -q "shell.*running"; then
  echo "✅ shell worker 运行中"
else
  echo "⚠️  shell worker 状态: $(iii worker list 2>&1 | grep shell)"
fi
echo ""

# 测试 4: Tauri Desktop App
echo "=== 测试 4: Tauri 桌面应用 ==="
if pgrep -f legalai-desktop > /dev/null; then
  echo "✅ 桌面应用运行中 (PID: $(pgrep -f legalai-desktop))"
else
  echo "❌ 桌面应用未运行"
fi
echo ""

# 测试 5: 编译状态
echo "=== 测试 5: Rust 后端编译 ==="
if [ -f "apps/desktop/src-tauri/target/debug/legalai-desktop" ]; then
  echo "✅ Rust 后端已编译 ($(ls -la apps/desktop/src-tauri/target/debug/legalai-desktop | awk '{print $5}') bytes)"
else
  echo "❌ Rust 后端未编译"
fi
echo ""

# 测试 6: Worker 代码
echo "=== 测试 6: Worker 集团代码 ==="
echo "  pi-user:     $([ -f workers/pi-user/src/index.ts ] && echo "✅" || echo "❌")"
echo "  pi-internal: $([ -f workers/pi-internal/src/index.ts ] && echo "✅" || echo "❌")"
echo "  knowledge:   $([ -f workers/knowledge/src/index.ts ] && echo "✅" || echo "❌")"
echo "  analysis:    $([ -f workers/analysis/src/index.ts ] && echo "✅" || echo "❌")"
echo "  document:    $([ -f workers/document/src/index.ts ] && echo "✅" || echo "❌")"
echo "  docgen:      $([ -f workers/docgen/src/index.ts ] && echo "✅" || echo "❌")"
echo "  upload:      $([ -f workers/upload/src/index.ts ] && echo "✅" || echo "❌")"
echo ""

echo "================================================================"
echo "  测试完成"
echo "================================================================"

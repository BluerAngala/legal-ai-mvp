#!/bin/bash
# Real end-to-end test of the LegalAI stack
# Tests the actual LLM call path used by ask_pi

set -e

echo "================================================================"
echo "  LegalAI - 真实端到端测试"
echo "  调用硅基流动 Pro/MiniMaxAI/MiniMax-M2.5"
echo "================================================================"

API_KEY="sk-crwfmfqcogblddlpymiqqaatuepooklkjdelsxephytdswwe"
BASE_URL="https://api.siliconflow.cn/v1/chat/completions"
MODEL="Pro/MiniMaxAI/MiniMax-M2.5"

test_legal_question() {
    local QUESTION="$1"
    local EXPECTED="$2"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Q: $QUESTION"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    local SYSTEM_PROMPT='你是一位资深中国律师（20年执业经验），精通中国法律。

请按以下格式回答用户问题：

【法律领域】
明确问题类别（合同/婚姻/劳动/刑事/交通事故/债权债务/房产/侵权/其他）

【法律依据】
引用具体法条（民法典第xxx条、刑法第xxx条、劳动法第xxx条等）

【分析建议】
给出专业、实用、可操作的法律建议

要求：
1. 答案准确、专业、有理有据
2. 法条引用要准确
3. 建议要实用
4. 不知道的不要瞎编'

    local START=$(date +%s%N)
    local RESPONSE=$(curl -m 30 -s -X POST "$BASE_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $API_KEY" \
        -d "$(cat <<EOF
{
    "model": "$MODEL",
    "messages": [
        {"role": "system", "content": $(echo "$SYSTEM_PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')},
        {"role": "user", "content": $(echo "$QUESTION" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}
    ],
    "max_tokens": 1500,
    "temperature": 0.3
}
EOF
    )" 2>&1)
    local END=$(date +%s%N)
    local ELAPSED=$(( (END - START) / 1000000 ))

    # Parse the response
    local ANSWER=$(echo "$RESPONSE" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    if 'choices' in d:
        print(d['choices'][0]['message']['content'].strip())
    elif 'error' in d:
        print('ERROR:', d.get('error', {}).get('message', 'Unknown'))
    else:
        print('UNEXPECTED:', str(d)[:200])
except Exception as e:
    print('PARSE ERROR:', str(e), file=sys.stderr)
    print(sys.stdin.read()[:200])
" 2>&1)

    echo ""
    echo "$ANSWER"
    echo ""
    echo "⏱️ 响应时间: ${ELAPSED}ms"
}

# Test multiple questions
test_legal_question "什么是法人人格否认？请用结构化方式回答" "法理"
test_legal_question "老板拖欠工资两个月，我该怎么维权？要求具体步骤和法条" "劳动法"
test_legal_question "夫妻离婚，两个孩子，一方想要抚养权，法院会怎么判？" "婚姻法"
test_legal_question "酒驾被抓，酒精含量150mg/100ml，会受到什么处罚？" "刑法+道交法"
test_legal_question "我在网上被人诽谤，能要求赔偿吗？怎么取证？" "民法典"

echo ""
echo "================================================================"
echo "  测试完成"
echo "================================================================"

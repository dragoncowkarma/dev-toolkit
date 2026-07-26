#!/usr/bin/env bash
# ==============================================================================
# bootstrap_issues.sh — Create initial Issues to kick-start the AI swarm
# ==============================================================================
# Usage: bash .agents/workflows/bootstrap_issues.sh
# Requires: gh CLI authenticated with the target repository
# ==============================================================================

set -euo pipefail

echo "🤖 Bootstrapping initial swarm issues..."
echo "==========================================="

# Issue 1: Main Layout - Sidebar Structure
echo ""
echo "📋 Creating Issue #1: Main Layout - Sidebar Structure..."
gh issue create \
  --title "[Task] 메인 레이아웃 - 사이드바 구조 구현" \
  --body "## 📌 Task Description

사이드바 기반의 메인 레이아웃 구조를 구현합니다.

### Requirements
- 좌측 사이드바에 도구 목록 표시 (아이콘 + 이름)
- 사이드바 접기/펼치기 토글 버튼
- 선택된 도구의 컴포넌트를 메인 영역에 렌더링
- 반응형 디자인 (모바일에서는 하단 네비게이션 또는 햄버거 메뉴)
- \`src/components/Sidebar.jsx\`, \`src/components/Layout.jsx\` 생성

### Design Tokens
기존 \`src/index.css\`의 디자인 토큰 시스템을 따를 것.

### File Structure
\`\`\`
src/
├── components/
│   ├── Sidebar.jsx
│   ├── Sidebar.css
│   ├── Layout.jsx
│   └── Layout.css
└── App.jsx (updated to use Layout)
\`\`\`

---

[Worker: codex | Model: 5.6 luna | Reasoning: 울트라]

> 이 Issue는 자율 AI 스웜에 의해 자동 생성되었습니다."

echo "  ✅ Issue #1 created."

# Issue 2: Base64 Encoder/Decoder
echo ""
echo "📋 Creating Issue #2: Base64 Encoder/Decoder..."
gh issue create \
  --title "[Task] Base64 - 인코더/디코더 유틸리티 개발" \
  --body "## 📌 Task Description

Base64 인코딩/디코딩 유틸리티 도구를 개발합니다.

### Requirements
- 텍스트 → Base64 인코딩
- Base64 → 텍스트 디코딩
- 실시간 변환 (입력 시 즉시 결과 표시)
- 복사 버튼 (결과를 클립보드에 복사)
- 파일 입력 지원 (파일을 Base64로 변환)
- 에러 처리 (잘못된 Base64 입력 시 안내 메시지)

### File Structure
\`\`\`
src/tools/base64/
├── Base64Tool.jsx      # UI 컴포넌트
├── base64.utils.js     # 인코딩/디코딩 로직
├── base64.css          # 도구 전용 스타일
└── base64.test.js      # 유틸리티 함수 테스트
\`\`\`

### UI Reference
- 입력 영역: 좌측 또는 상단 textarea
- 출력 영역: 우측 또는 하단 textarea (읽기 전용)
- 모드 토글: Encode / Decode 스위치
- 액션 버튼: Copy, Clear, Swap

---

[Worker: claude | Model: sonnet 5 | Reasoning: 높음]

> 이 Issue는 자율 AI 스웜에 의해 자동 생성되었습니다."

echo "  ✅ Issue #2 created."

# Issue 3: JSON Formatter
echo ""
echo "📋 Creating Issue #3: JSON Formatter..."
gh issue create \
  --title "[Task] JSON - 포매터 유틸리티 개발" \
  --body "## 📌 Task Description

JSON 포매팅, 검증, 압축 유틸리티 도구를 개발합니다.

### Requirements
- JSON 포매팅 (pretty-print with configurable indentation: 2/4 spaces, tabs)
- JSON 압축 (minify)
- JSON 검증 (유효성 검사 + 에러 위치 표시)
- 트리뷰 시각화 (접기/펼치기 가능한 JSON 트리)
- 복사 버튼 및 다운로드 기능
- 실시간 변환

### File Structure
\`\`\`
src/tools/json/
├── JsonTool.jsx        # UI 컴포넌트
├── json.utils.js       # 포매팅/검증 로직
├── json.css            # 도구 전용 스타일
└── json.test.js        # 유틸리티 함수 테스트
\`\`\`

### UI Reference
- 입력 영역: 코드 에디터 스타일 textarea (라인 넘버 표시)
- 출력 영역: 포매팅된 결과 또는 트리뷰
- 옵션: Indent size 선택, 트리뷰 토글
- 액션 버튼: Format, Minify, Validate, Copy, Download

---

[Worker: antigravity | Model: gemini 3.6 flash | Reasoning: high]

> 이 Issue는 자율 AI 스웜에 의해 자동 생성되었습니다."

echo "  ✅ Issue #3 created."

echo ""
echo "==========================================="
echo "🎉 All 3 bootstrap issues created successfully!"
echo "🤖 The swarm orchestrator can now pick them up."
echo ""
echo "To start the orchestrator:"
echo "  python .agents/workflows/swarm_orchestrator.py --dry-run"
echo ""

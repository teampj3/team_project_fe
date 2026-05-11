# 프론트 연동 요청 사항

이 문서는 현재 프론트 구현 상태를 기준으로 Spring 백엔드 담당자와 Python 에이전트 담당자에게 전달할 연동 요청 사항을 정리한 문서이다.

## 1. 현재 프론트 방향

프론트는 이제 단순 `보고서 생성 -> 초안 비교` 화면이 아니라 아래 흐름을 기준으로 구성되어 있다.

- 연구 주제 입력
- 파이프라인 실행
- 단계별 진행 상태 표시
  - Search
  - Reader
  - Relevance
  - Writer
- 검색 논문 목록 확인
- 관련성 선별 결과 확인
- 보고서 초안 확인
- 전용 편집 페이지 이동

즉 메인 화면은 **파이프라인 대시보드**, 편집 화면은 **문서 편집 전용 페이지**로 역할이 분리되어 있다.

---

## 2. Spring 백엔드 담당자에게 요청할 사항

### 2.1 메인 실행 API

현재 프론트는 주제 입력 후 실행 버튼을 눌러 파이프라인을 시작하는 구조를 기준으로 가고 있다.

필요 API:

### `POST /api/pipeline/run`

요청:

```json
{
  "topic": "AI code review"
}
```

응답:

```json
{
  "runId": "run_20260511_130108",
  "topic": "AI code review",
  "status": "PROCESSING",
  "currentStage": "search",
  "message": "Pipeline started"
}
```

### 2.2 실행 상태 조회 API

프론트 메인 대시보드는 단계 카드와 카운트 영역을 보여주므로, 현재 실행 상태를 조회할 수 있어야 한다.

### `GET /api/pipeline/result?runId=...`

응답 예시:

```json
{
  "runId": "run_20260511_130108",
  "topic": "AI code review",
  "status": "PROCESSING",
  "currentStage": "reader",
  "searchCount": 20,
  "summaryCount": 8,
  "relevanceCount": 0,
  "reportPath": null,
  "startedAt": "2026-05-11T13:01:08+09:00",
  "finishedAt": null
}
```

### 2.3 검색 논문 목록 API

프론트 `검색 결과` 탭에는 다음 컬럼이 필요하다.

- title
- authors
- year
- source
- summary

필요 API:

### `GET /api/papers/search-results?runId=...`

응답 예시:

```json
[
  {
    "id": "paper_001",
    "title": "Large Language Models for Code Review",
    "authors": ["A", "B"],
    "year": 2024,
    "source": "arXiv",
    "summary": "..."
  }
]
```

### 2.4 관련성 결과 API

프론트 `관련성 결과` 탭에는 다음 컬럼이 필요하다.

- title
- authors
- year
- source
- summary
- relevanceScore
- selected

필요 API:

### `GET /api/papers/relevance-results?runId=...`

응답 예시:

```json
[
  {
    "id": "paper_001",
    "title": "Large Language Models for Code Review",
    "authors": ["A", "B"],
    "year": 2024,
    "source": "arXiv",
    "summary": "...",
    "relevanceScore": 91,
    "selected": true
  }
]
```

### 2.5 보고서 초안 / 상세 결과 API

프론트는 현재 아래 필드를 기준으로 Writer 결과와 비교 화면을 구성한다.

- id
- topic
- status
- gptDraft
- claudeDraft
- commonHighlights
- differentHighlights
- reviewResult
- mergedReport
- pipeline
- searchResults
- relevanceResults

권장 응답 형식:

```json
{
  "id": "300cabf3-3026-43cd-9df3-59c287a46f4b",
  "topic": "AI code review",
  "status": "COMPLETED",
  "gptDraft": "...",
  "claudeDraft": "...",
  "commonHighlights": ["..."],
  "differentHighlights": ["..."],
  "reviewResult": "...",
  "mergedReport": "...",
  "pipeline": {
    "currentStage": "writer",
    "searchCount": 20,
    "summaryCount": 20,
    "relevanceCount": 8,
    "reportPath": "outputs/reports/ai_code_review_20260511_130108.md",
    "startedAt": "2026-05-11T13:01:08+09:00",
    "finishedAt": "2026-05-11T13:04:41+09:00"
  },
  "searchResults": [],
  "relevanceResults": []
}
```

### 2.6 실행 이력 API

좌측 패널의 최근 보고서 / 실행 이력 영역은 단순 report 목록보다 `run` 목록이 더 적합하다.

권장 API:

### `GET /api/pipeline/history`

응답 예시:

```json
[
  {
    "runId": "run_20260511_130108",
    "reportId": "300cabf3-3026-43cd-9df3-59c287a46f4b",
    "topic": "AI code review",
    "status": "COMPLETED",
    "createdAt": "2026-05-11T13:01:08+09:00"
  }
]
```

### 2.7 추가 요청

- 응답은 UTF-8 고정
- status 값은 `PENDING | PROCESSING | COMPLETED | FAILED` 계열로 통일
- currentStage 값은 `search | reader | relevance | writer` 계열로 통일
- `runId`와 `reportId`를 분리해주는 것이 좋음
- 실패 시 사용자 표시용 message 필드 추가 권장

---

## 3. Python 에이전트 담당자에게 요청할 사항

Spring이 웹 API를 안정적으로 제공하려면 Python 결과 파일 구조도 일정해야 한다.

### 3.1 각 단계 산출물 파일 구조 고정

웹에서는 단계별 결과를 읽어 화면에 뿌려야 하므로 아래 구조가 안정적으로 나와야 한다.

- Search 결과 파일
  - title
  - authors
  - year
  - source
  - abstract / snippet

- Reader 결과 파일
  - paper id
  - summary

- Relevance 결과 파일
  - paper id
  - relevance score
  - selected
  - reason(optional)

- Writer 결과 파일
  - gpt draft
  - claude draft
  - common highlights
  - different highlights
  - review result
  - merged report

### 3.2 Python 출력 스키마 요청

가능하면 Spring이 가공하기 쉬운 JSON 구조를 고정해주면 좋다.

권장 예시:

```json
{
  "topic": "AI code review",
  "search_results": [
    {
      "id": "paper_001",
      "title": "...",
      "authors": ["..."],
      "year": 2024,
      "source": "...",
      "summary": "..."
    }
  ],
  "relevance_results": [
    {
      "id": "paper_001",
      "relevance_score": 91,
      "selected": true
    }
  ],
  "writer_output": {
    "gptDraft": "...",
    "claudeDraft": "...",
    "commonHighlights": ["..."],
    "differentHighlights": ["..."],
    "reviewResult": "...",
    "mergedReport": "..."
  },
  "report_path": "outputs/reports/ai_code_review_20260511_130108.md"
}
```

### 3.3 단계 상태 기록 요청

웹에서 진행 상태를 보여주려면 각 단계 종료 시점을 기록할 수 있어야 한다.

필요 정보:

- current_stage
- search_count
- summary_count
- relevance_count
- started_at
- finished_at
- failed_stage
- error_message

즉 Python 또는 Spring 어느 한쪽에서는 아래 형태의 상태 정보를 보존해야 한다.

```json
{
  "current_stage": "reader",
  "search_count": 20,
  "summary_count": 12,
  "relevance_count": 0,
  "started_at": "2026-05-11T13:01:08+09:00",
  "finished_at": null,
  "failed_stage": null,
  "error_message": null
}
```

### 3.4 실패 시 처리 규칙

웹에서 사용자에게 보여주기 위해 아래 경우를 명확히 구분해야 한다.

- 검색 결과 없음
- Reader 요약 실패
- Relevance 계산 실패
- Writer 초안 생성 실패

각 경우:

- stage name
- machine-readable error code
- 사용자용 간단 메시지

가 있으면 프론트에서 처리하기 쉽다.

### 3.5 인코딩 / 파일 저장

- 한글 결과는 UTF-8 고정
- Markdown 보고서 저장 경로 규칙 고정
- 가능하면 JSON 결과도 runId 기준 파일명 규칙 고정

권장 예:

- `outputs/runs/{runId}/search_results.json`
- `outputs/runs/{runId}/relevance_results.json`
- `outputs/runs/{runId}/writer_output.json`
- `outputs/runs/{runId}/report.md`

---

## 4. 정리

현재 프론트는 아래 3단계 구조를 기준으로 가는 것이 맞다.

1. 파이프라인 실행 대시보드
2. 결과 상세 확인
3. 전용 문서 편집

따라서 백엔드는 단순 최종 보고서 응답만 주는 구조보다, **run 기준 상태 + 단계별 결과 + 최종 초안**을 함께 내려주는 방향으로 맞춰야 한다.

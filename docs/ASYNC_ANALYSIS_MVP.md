# Async Analysis MVP

## Purpose

이 문서는 Action Sports Journal의 Evidence Extraction을 진짜 비동기 구조로 전환하기 위한 MVP 설계입니다.

목표:

```text
Moment 생성
-> 앱은 즉시 응답을 받음
-> Evidence Extraction은 백그라운드 작업으로 처리
-> 앱은 Push 없이 상태를 다시 조회해 반영
```

범위:

- 문서 설계만 다룹니다.
- Auth는 포함하지 않습니다.
- Push notification은 포함하지 않습니다.
- App Store/TestFlight 배포 전략은 포함하지 않습니다.
- Coach, Score, Progression 확장은 포함하지 않습니다.

관련 문서:

- `docs/ASYNC_ANALYSIS_PLAN.md`
- `docs/FUTURE_ARCHITECTURE.md`
- `docs/INFRA_PLAN.md`
- `docs/SUPABASE_PHASE_1_SETUP.md`
- `supabase/phase1_schema.sql`

## 1. Current Synchronous Flow

현재 구현은 Moment 생성과 Evidence Extraction이 사용자 요청 안에서 거의 동시에 진행됩니다.

현재 흐름:

```text
사용자 영상 선택
-> Home 화면에서 local Session/Moment 생성
-> POST /api/moments
-> Supabase moments row 생성
-> 앱 local state에 remoteMomentId 저장
-> 앱이 즉시 POST /api/extract-session-evidence 호출
-> Render server가 같은 요청 안에서 Gemini Files API 업로드/분석/파싱 수행
-> analysis_jobs row 생성
-> evidence_results row 생성
-> moments.latest_analysis_job_id 업데이트
-> moments.latest_evidence_result_id 업데이트
-> moments.status completed 또는 failed 업데이트
-> 앱이 evidence result 응답을 받아 Home/Bottom Sheet에 표시
```

현재 장점:

- 구현이 단순합니다.
- 디버깅이 쉽습니다.
- Gemini 응답을 즉시 앱에서 볼 수 있습니다.
- 현재 standalone iPhone 앱에서 이미 검증된 경로입니다.

현재 한계:

- 모바일 요청이 Gemini 분석 완료까지 열린 상태로 유지됩니다.
- 앱이 백그라운드로 가거나 네트워크가 흔들리면 사용자 경험이 불안정해질 수 있습니다.
- Render request timeout, Gemini 지연, 영상 업로드 시간이 사용자 액션을 막습니다.
- `processing` 상태는 durable backend state라기보다 앱 요청 흐름에 붙어 있습니다.
- 앱을 재실행했을 때는 `/api/moments`를 다시 읽어야만 최신 상태를 복원할 수 있습니다.
- 자동 상태 갱신은 아직 polling/realtime 구조가 아니라 앱 시작 시 조회에 가깝습니다.

Confirmed current backend state:

- `moments` row 생성은 구현되어 있습니다.
- `analysis_jobs` row 생성은 동기 evidence extraction 완료 시점에 구현되어 있습니다.
- `evidence_results` row 생성은 동기 evidence extraction 완료 시점에 구현되어 있습니다.
- `/api/moments` 조회는 Render 환경변수 수정 후 200과 `moments` 배열 반환이 확인되었습니다.

## 2. Target Async MVP Flow

미래 MVP 흐름은 Moment 생성 응답과 Evidence Extraction 실행을 분리합니다.

목표 흐름:

```text
사용자 영상 선택
-> 앱이 POST /api/moments 호출
-> 서버가 moments row 생성
-> 서버가 analysis_jobs row 생성(status = queued)
-> 서버가 즉시 201/202 응답 반환
-> 앱은 Moment를 queued 또는 processing 상태로 표시
-> Render background worker가 queued AnalysisJob을 claim
-> worker가 Gemini evidence extraction 수행
-> worker가 evidence_results row 저장
-> worker가 analysis_jobs.status completed 또는 failed 업데이트
-> worker가 moments.status completed 또는 failed 업데이트
-> 앱은 polling으로 /api/moments 또는 /api/moments/:id 재조회
-> Home/Bottom Sheet가 최신 상태를 반영
```

핵심 차이:

```text
현재:
Moment 생성 -> 같은 모바일 요청에서 Gemini 결과까지 기다림

Async MVP:
Moment 생성 -> 즉시 응답
Evidence Extraction -> 서버 백그라운드에서 나중에 완료
앱 -> polling으로 상태 갱신
```

MVP에서 유지할 것:

- Auth 없음
- Push 없음
- Coach 없음
- Score 없음
- 기존 UI 구조 유지
- Supabase service role key는 Render에만 보관
- 모바일 앱에는 public HTTPS backend endpoint만 포함

## 3. AnalysisJob State Transitions

`analysis_jobs`는 Evidence Extraction 실행 단위를 나타내는 durable job record입니다.

필수 상태:

```text
queued
processing
completed
failed
cancelled
```

MVP에서는 `cancelled`를 UI에 노출하지 않아도 됩니다. 다만 schema에는 남겨두면 이후 운영에 유리합니다.

### Happy Path

```text
POST /api/moments
-> moments.status = queued 또는 processing
-> analysis_jobs.status = queued

Worker claims job
-> analysis_jobs.status = processing
-> analysis_jobs.started_at = now()
-> moments.status = processing

Gemini succeeds
-> evidence_results.status = completed
-> analysis_jobs.status = completed
-> analysis_jobs.completed_at = now()
-> moments.status = completed
-> moments.latest_analysis_job_id = analysis_jobs.id
-> moments.latest_evidence_result_id = evidence_results.id
```

### Failure Path

```text
Worker claims job
-> analysis_jobs.status = processing
-> moments.status = processing

Gemini/upload/parse/server error
-> analysis_jobs.status = failed
-> analysis_jobs.last_error = safe error message
-> analysis_jobs.failed_at = now()
-> moments.status = failed
-> optional failed evidence_results row
```

Failure 원칙:

- 실패도 제품 상태입니다.
- 실패한 job은 삭제하지 않습니다.
- retry는 기존 failed job을 덮어쓰지 않고 새 `analysis_jobs` row를 만드는 방향이 안전합니다.
- 사용자에게는 `failed` 상태와 "다시 시도" 액션만 보여주고 내부 error는 debug-safe 문구로 제한합니다.

### Duplicate Prevention

같은 Moment에 대해 아래 job이 존재하면 새 job을 만들지 않습니다.

```text
moment_id = target moment id
kind = evidence_extraction
status in ('queued', 'processing')
```

이 경우 API는 기존 active job을 반환합니다.

## 4. Render Implementation Options

Render Web Service 환경에서 가능한 구현 방식은 세 가지입니다.

### Option A: In-process Worker Loop

Render Web Service 프로세스 안에서 일정 주기로 Supabase `analysis_jobs`를 polling합니다.

흐름:

```text
setInterval 또는 async loop
-> queued job 조회
-> atomic claim
-> Gemini 실행
-> 결과 저장
```

장점:

- 가장 단순합니다.
- 추가 Render 서비스가 필요 없습니다.
- 초기 개인 사용/저트래픽에 적합합니다.

단점:

- Web Service 재시작 시 processing job 복구 전략이 필요합니다.
- 여러 instance로 scale-out하면 claim race를 조심해야 합니다.
- 긴 Gemini 작업이 web process resource를 공유합니다.

Recommendation:

- MVP 첫 구현은 Option A가 가장 짧은 경로입니다.
- 단, claim 쿼리는 반드시 atomic하게 설계해야 합니다.

### Option B: Separate Render Worker Service

Render에 별도 Background Worker 서비스를 둡니다.

흐름:

```text
Web Service
-> Moment/AnalysisJob 생성

Worker Service
-> queued job polling
-> Gemini 실행
-> Supabase 업데이트
```

장점:

- web request와 분석 실행이 분리됩니다.
- 장기적으로 운영 안정성이 좋습니다.
- worker만 별도로 scale 조정할 수 있습니다.

단점:

- Render 서비스가 하나 더 필요합니다.
- env 설정과 배포 관리가 늘어납니다.

Recommendation:

- MVP 안정화 후 두 번째 단계로 적합합니다.
- 초반에는 Option A로 시작하고, 분석량이 늘면 Option B로 분리합니다.

### Option C: External Queue / Supabase Queue

`analysis_jobs` 테이블 외에 Supabase Queues 또는 별도 queue system을 사용합니다.

장점:

- queue semantics가 더 명확합니다.
- retry/dead-letter 관리가 좋아질 수 있습니다.

단점:

- 현재 MVP에는 과합니다.
- 구현/운영 복잡도가 올라갑니다.

Recommendation:

- 지금은 사용하지 않습니다.
- `analysis_jobs` table polling으로 충분합니다.

## 5. Supabase Responsibilities

Supabase는 Async Analysis MVP의 durable source of truth입니다.

### `moments`

역할:

- Feed와 Detail의 핵심 제품 엔티티
- 사용자가 생성한 Moment의 상태 보관
- 최신 분석 결과 연결

주요 필드:

```text
id
user_id
title
notes
status
source_video_uri
file_name
mime_type
file_size
duration_ms
latest_analysis_job_id
latest_evidence_result_id
created_at
updated_at
```

MVP 상태 의미:

- `queued`: Moment가 생성됐고 분석 job이 대기 중
- `processing`: worker가 분석 중
- `completed`: 최신 EvidenceResult가 준비됨
- `failed`: 최신 분석 시도가 실패함

### `analysis_jobs`

역할:

- Background 작업 단위
- worker claim 대상
- retry, 실패 원인, 처리 시간 기록

주요 필드:

```text
id
moment_id
kind = evidence_extraction
status
provider
model
attempts
max_attempts
last_error
queued_at
started_at
completed_at
failed_at
```

### `evidence_results`

역할:

- Gemini evidence extraction 결과 저장
- 앱 재실행 후 Bottom Sheet 복원 데이터
- debugging/audit trail

주요 필드:

```text
id
moment_id
analysis_job_id
provider
model
status
quality_mode
predicted_trick
family
confidence
needs_review
consistency_status
consistency_warnings
approach_observed_facts
inversion_observed_facts
temporal_windows
evidence_windows
observations
raw_response_text
error_message
```

### Media Storage Caveat

Unknown / risk:

- 진짜 Async worker가 나중에 영상을 분석하려면 worker가 접근 가능한 영상 위치가 필요합니다.
- 현재 iPhone local URI는 서버가 나중에 다시 접근할 수 없습니다.

MVP-compatible approaches:

1. Moment 생성 요청에서 영상 파일을 같이 업로드하고, 서버가 즉시 임시 파일/Gemini file reference를 확보합니다.
2. 더 durable한 방식으로 Supabase Storage에 원본 영상을 저장하고 `source_video_uri` 또는 `storage_path`를 저장합니다.
3. 초단기 MVP에서는 "request는 즉시 반환하지만 server process가 이미 받은 file buffer를 background promise로 넘기는" 방식도 가능하나, Render 재시작에 취약하므로 durable async로 보기는 어렵습니다.

Recommendation:

- 진짜 Async MVP라면 최소한 worker가 접근 가능한 durable media reference가 필요합니다.
- 다만 이번 설계의 첫 구현은 "Moment/AnalysisJob 상태 전환"을 먼저 만들고, media durability는 별도 단계로 명시 관리합니다.

## 6. Minimum MVP Implementation Order

아래 순서가 가장 짧고 안전합니다.

### Step 1: API Contract Split

현재 긴 동기 분석 요청을 분리합니다.

새 계약:

```text
POST /api/moments
-> Moment 생성
-> AnalysisJob 생성
-> 즉시 { moment, analysisJob } 반환
```

응답 예:

```json
{
  "moment": {
    "id": "uuid",
    "status": "queued"
  },
  "analysisJob": {
    "id": "uuid",
    "status": "queued"
  }
}
```

### Step 2: Active Job Deduplication

같은 Moment에 active job이 있으면 재사용합니다.

```text
status in ('queued', 'processing')
```

### Step 3: Worker Claim Function

queued job을 하나 가져와 processing으로 바꿉니다.

필요 조건:

- race condition 방지
- stale processing job 복구 정책 준비
- attempts 증가
- started_at 기록

초기 구현 후보:

```text
select next queued job ordered by queued_at
-> update where id = target and status = queued
-> if exactly one row updated, claim success
```

더 안전한 구현은 Supabase SQL function/RPC로 `FOR UPDATE SKIP LOCKED`를 사용하는 방식입니다.

### Step 4: Existing Gemini Logic Reuse

기존 `/api/extract-session-evidence` 내부의 Gemini 업로드/분석/파싱 로직을 worker 함수에서 재사용 가능한 함수로 분리합니다.

중요:

- AI behavior는 바꾸지 않습니다.
- prompt/taxonomy/coaching logic은 이 단계에서 건드리지 않습니다.
- 동기 endpoint와 worker가 같은 evidence extraction core를 공유해야 합니다.

### Step 5: Persist Result

worker 완료 시:

```text
insert evidence_results
update analysis_jobs
update moments
```

실패 시:

```text
update analysis_jobs failed + last_error
update moments failed
optional insert failed evidence_results
```

### Step 6: App Polling

Push 없이 상태를 갱신합니다.

기본 polling:

```text
Home 화면 active
-> GET /api/moments every 5-10 seconds if any Moment is queued/processing
-> selected Bottom Sheet open
-> GET /api/moments/:id every 2-5 seconds while queued/processing
-> completed/failed이면 polling stop
```

초기 MVP는 `/api/moments` 하나로 시작해도 됩니다.

더 나은 API:

```text
GET /api/moments
GET /api/moments/:momentId
GET /api/analysis-jobs/:jobId
```

### Step 7: Retry

failed 상태에서만 retry를 허용합니다.

```text
POST /api/moments/:momentId/analysis-jobs
-> new queued AnalysisJob
-> moments.status = queued 또는 processing
```

Retry는 기존 failed job을 덮어쓰지 않습니다.

## 7. Status Refresh Without Push

Push notification 없이도 MVP는 충분히 가능합니다.

### App Startup Refresh

이미 필요한 흐름:

```text
앱 시작
-> GET /api/moments
-> Supabase-backed Moment list 복원
```

### Foreground Polling

앱이 foreground이고 queued/processing Moment가 있으면 주기적으로 조회합니다.

권장 interval:

- Home feed: 5-10초
- Bottom Sheet selected Moment: 2-5초

중지 조건:

- 모든 Moment가 `completed` 또는 `failed`
- 앱 background
- Bottom Sheet 닫힘

### Pull-to-refresh

추가 UX 후보:

- Home feed에 pull-to-refresh를 붙입니다.
- 사용자가 수동으로 최신 상태를 확인할 수 있습니다.
- Push 없이도 초기 사용성은 좋아집니다.

### Supabase Realtime

초기 MVP에는 필요하지 않습니다.

나중 후보:

```text
subscribe moments where user_id = default/current user
subscribe analysis_jobs where status changed
subscribe evidence_results inserts
```

Auth/RLS 전에는 신중해야 합니다.

## 8. Render MVP Recommendation

Recommendation:

1. Render Web Service 하나로 시작합니다.
2. In-process worker loop를 둡니다.
3. `analysis_jobs` table polling으로 queued job을 처리합니다.
4. Push 없이 앱 polling으로 상태를 갱신합니다.
5. Auth는 넣지 않습니다.
6. Supabase service role key는 Render env에만 둡니다.
7. 영상 durability는 별도 리스크로 명시하고, 가능한 빨리 worker-accessible media reference를 확보합니다.

왜 이 경로가 맞는가:

- 단일 개발자/초기 개인 사용/저트래픽 조건에 맞습니다.
- Render와 Supabase만으로 동작합니다.
- 현재 코드의 Supabase Moment/Evidence 저장 구조를 재사용할 수 있습니다.
- UI는 이미 `queued`, `processing`, `completed`, `failed`를 표현하기 시작했습니다.
- Push, Auth, 별도 queue를 미루면서도 "Moment 생성 즉시 응답"이라는 핵심 UX를 달성할 수 있습니다.

## 9. MVP Non-goals

이번 Async Analysis MVP에서 하지 않을 것:

- Auth
- Push notification
- App Store/TestFlight
- Coach async job
- Score calculation
- Progression model
- Supabase Realtime
- Multi-user RLS productization
- CDN
- Advanced queue infrastructure
- On-device thumbnail redesign
- Wakeboard prompt/taxonomy 변경

## 10. Validation Checklist

구현 후 검증해야 할 항목:

### Moment Creation

- Moment 생성 요청이 1-2초 안에 응답하는지
- 응답에 `moment.id`가 있는지
- 응답에 `analysisJob.id`가 있는지
- 앱 Home에 즉시 `queued` 또는 `processing` 상태가 표시되는지

### Job Processing

- `analysis_jobs.status`가 `queued -> processing -> completed`로 전이되는지
- 실패 시 `queued -> processing -> failed`로 전이되는지
- `last_error`가 secret 없이 저장되는지

### Supabase Persistence

- `moments` row 생성 확인
- `analysis_jobs` row 생성 확인
- `evidence_results` row 생성 확인
- `moments.latest_analysis_job_id` 업데이트 확인
- `moments.latest_evidence_result_id` 업데이트 확인
- 앱 재실행 후 `/api/moments`로 복원 확인

### App Refresh

- 앱 시작 시 Moment list 복원
- queued 표시
- processing 표시
- completed 표시와 Bottom Sheet result 표시
- failed 표시와 retry 가능성 표시
- completed/failed 이후 polling 중지

### Safety

- API key가 응답에 노출되지 않는지
- Supabase service role key가 앱/EAS env에 들어가지 않는지
- Render env에만 server-only secret이 있는지
- failed error message가 debug-safe한지

## 11. Open Questions

Confirmed fact:

- 현재 Render backend와 Supabase tables는 Moment/Evidence 저장과 조회를 수행할 수 있습니다.

Unknown:

- 실제 production-like async worker에서 영상 원본을 어느 위치에 durable하게 보관할지 아직 확정되지 않았습니다.
- Render Web Service in-process worker가 free/low-tier sleep/restart 조건에서 어느 정도 안정적인지는 실제 운영 검증이 필요합니다.
- 현재 Gemini Files API uploaded file reference를 worker 재시작 후 재사용할 수 있는지, 또는 매번 원본 파일이 필요한지는 별도 검증이 필요합니다.

Recommendation:

- 첫 Async MVP 구현 전에 "worker가 나중에 접근 가능한 영상 참조"를 명확히 결정해야 합니다.
- 가장 제품적으로 안전한 경로는 Supabase Storage에 원본 영상을 저장하고, AnalysisJob이 storage path를 참조하는 방식입니다.
- 가장 짧은 실험 경로는 Render가 요청에서 받은 video buffer를 즉시 background task로 넘기는 방식이지만, 이것은 durable async라기보다 non-blocking synchronous extension에 가깝습니다.


# Async Analysis Plan

## Purpose

현재 Wakeboard Evidence Extraction MVP를 다음 구조로 전환하기 위한 계획입니다.

```text
현재: Moment 생성/선택 -> 같은 요청 안에서 Gemini 분석 완료 대기
목표: Moment 생성 -> 즉시 화면 반환 -> 백그라운드 분석 -> completed / failed 상태 확인
```

이 문서는 설계 문서입니다.

금지:

- 코드 수정
- DB 마이그레이션 적용
- Auth UI 구현
- Storage 연결
- Job Queue 구현
- 커밋

## 1. 현재 분석 흐름

현재 구현은 UI 관점의 Moment를 `Session`으로 표현합니다.

주요 흐름:

```text
사용자 영상 선택
-> HomeScreen에서 Session 생성
-> selectedSessionId 설정
-> handleExtractEvidence 실행
-> extractSessionEvidenceWithGemini 호출
-> POST /api/extract-session-evidence
-> dev-server가 요청 안에서 Gemini Files API 업로드와 분석 실행
-> Gemini 응답 파싱
-> GeminiEvidenceResult 반환
-> HomeScreen local state에 결과 저장
-> Bottom Sheet에 processing / completed / failed 표시
```

현재 장점:

- 구현이 단순합니다.
- 한 번의 요청/응답으로 결과를 확인할 수 있습니다.
- 로컬 MVP에서 디버깅이 쉽습니다.
- Bottom Sheet UX는 이미 `processing`, `completed`, `failed` 상태를 표현합니다.

현재 한계:

- 모바일 요청이 Gemini 분석 완료까지 오래 열린 상태로 유지됩니다.
- 앱이 백그라운드로 가거나 네트워크가 흔들리면 분석 상태를 잃기 쉽습니다.
- 서버 프로세스가 재시작되면 진행 중인 분석을 추적하기 어렵습니다.
- `GeminiEvidenceResult`는 AsyncStorage에 저장되지만 durable backend source of truth는 아닙니다.
- 현재 중복 방지는 `extractingEvidenceBySessionId`라는 UI local state에 의존합니다.
- 진짜 제품 엔티티인 `Moment`, `AnalysisJob`, `EvidenceResult`가 아직 런타임 source of truth가 아닙니다.

현재 관련 파일:

- `src/features/sessions/HomeScreen.tsx`
- `src/services/ai/analyzeSessionVideo.ts`
- `src/types/index.ts`
- `dev-server/index.ts`
- `src/services/supabase/client.ts`
- `supabase/phase1_schema.sql`

## 2. 미래 비동기 분석 흐름

목표 흐름:

```text
사용자 Moment 생성
-> 앱은 Moment를 즉시 화면에 추가
-> 서버는 Moment row와 AnalysisJob row 생성
-> API는 즉시 201/202 응답
-> Moment status = processing
-> 백그라운드 worker가 queued job claim
-> worker가 Gemini evidence extraction 실행
-> EvidenceResult 저장
-> AnalysisJob status = completed 또는 failed
-> Moment status = completed 또는 failed
-> 앱은 polling 또는 realtime으로 상태 갱신
-> Bottom Sheet에서 분석 완료/실패 표시
```

사용자 경험 기준:

- Moment 생성 직후 사용자는 feed 또는 Bottom Sheet로 돌아옵니다.
- 분석이 끝날 때까지 화면을 막지 않습니다.
- 사용자는 언제든 Moment를 다시 열어 현재 상태를 확인할 수 있습니다.
- 실패한 Moment는 실패 상태와 재시도 버튼을 보여줍니다.
- 재시도는 기존 결과를 덮어쓰기보다 새 `AnalysisJob`을 생성하는 방향이 안전합니다.

권장 API 관점:

```text
POST /api/moments
  -> Moment 생성
  -> AnalysisJob 생성
  -> 즉시 { moment, analysisJob } 반환

GET /api/moments/:momentId
  -> Moment + latest AnalysisJob + latest EvidenceResult 반환

POST /api/moments/:momentId/analysis-jobs
  -> 재시도용 새 AnalysisJob 생성
```

초기 MVP에서는 endpoint 이름을 반드시 위처럼 바꿀 필요는 없습니다. 다만 기존
`/api/extract-session-evidence`가 "분석 완료 응답"을 반환하는 계약은
"job 생성 응답"으로 분리해야 합니다.

## 3. AnalysisJob 역할

`AnalysisJob`은 분석 실행 자체를 나타내는 durable state입니다.

역할:

- 어떤 Moment를 분석할지 기록합니다.
- 어떤 분석 종류인지 기록합니다.
- 어떤 provider/model을 사용할지 기록합니다.
- 현재 상태를 기록합니다.
- retry 횟수와 실패 원인을 기록합니다.
- worker가 안전하게 claim할 수 있는 단위가 됩니다.
- 동일 Moment에 대한 중복 분석을 막는 기준이 됩니다.

권장 상태:

```text
queued
processing
completed
failed
cancelled
```

권장 kind:

```text
evidence_extraction
```

현재 MVP에서는 `coaching`, `benchmark`를 만들지 않습니다. 기존 schema draft에는 확장 가능성이 남아 있지만, 실제 UX 전환의 primary job은 `evidence_extraction` 하나입니다.

중복 방지 기준:

- 같은 `moment_id`
- 같은 `kind = evidence_extraction`
- 상태가 `queued` 또는 `processing`

위 조건의 job이 있으면 새 job을 만들지 않고 기존 job을 반환합니다.

## 4. Moment / AnalysisJob / EvidenceResult 관계

권장 관계:

```text
Moment 1 ── N AnalysisJob
AnalysisJob 1 ── 0..1 EvidenceResult
Moment 1 ── N EvidenceResult
Moment.latest_analysis_job_id -> AnalysisJob.id
Moment.latest_evidence_result_id -> EvidenceResult.id
```

의미:

- `Moment`는 사용자가 다시 보고 싶은 제품 핵심 엔티티입니다.
- `AnalysisJob`은 분석 실행 시도입니다.
- `EvidenceResult`는 분석 결과물입니다.

상태 전이:

```text
Moment created
-> Moment.status = processing
-> AnalysisJob.status = queued

Worker starts
-> AnalysisJob.status = processing
-> Moment.status = processing

Worker succeeds
-> EvidenceResult.status = completed
-> AnalysisJob.status = completed
-> Moment.status = completed
-> Moment.latest_evidence_result_id = EvidenceResult.id
-> Moment.latest_analysis_job_id = AnalysisJob.id

Worker fails
-> EvidenceResult.status = failed 또는 EvidenceResult 미생성
-> AnalysisJob.status = failed
-> Moment.status = failed
-> AnalysisJob.last_error 저장
```

원칙:

- feed와 Bottom Sheet는 `Moment.status`를 먼저 봅니다.
- 상세 결과는 `latest_evidence_result_id`가 있을 때만 렌더링합니다.
- 분석 실패 원인은 `AnalysisJob.last_error`와 필요 시 failed `EvidenceResult.error_message`에 둡니다.
- 과거 분석 이력은 삭제하지 않고 남깁니다.

## 5. 변경될 파일 목록

실제 구현 시 영향 받을 파일입니다. 이번 문서 작업에서는 수정하지 않습니다.

### Mobile

`src/features/sessions/HomeScreen.tsx`

- Moment 생성 직후 긴 분석 요청을 기다리지 않도록 변경합니다.
- `extractingEvidenceBySessionId` 중심 상태를 `Moment.status` / `AnalysisJob.status` 중심으로 전환합니다.
- Bottom Sheet는 local loading flag보다 durable status를 우선 표시합니다.
- retry 버튼은 새 AnalysisJob 생성 또는 기존 failed job retry endpoint를 호출합니다.
- polling 또는 Supabase realtime subscription 연결 지점이 필요합니다.

`src/services/ai/analyzeSessionVideo.ts`

- `extractSessionEvidenceWithGemini`의 역할을 재정의하거나 새 client 함수로 분리합니다.
- 동기 분석 결과 반환 대신 job 생성/조회 계약을 추가합니다.
- `RemoteEvidenceResponse`와 별개로 `RemoteAnalysisJobResponse` 또는 `MomentWithAnalysisResponse` 타입이 필요합니다.

`src/services/supabase/client.ts`

- 초기에는 smoke test 수준입니다.
- Auth/RLS가 준비되면 Moment 상태 조회 또는 realtime subscription의 기반이 됩니다.
- service role key는 절대 mobile client에 들어가지 않습니다.

`src/types/index.ts`

- `Moment`, `AnalysisJob`, `EvidenceResult` 타입을 명시적으로 분리합니다.
- 현재 `Session` 기반 UI 모델과 future Moment 모델 사이의 adapter가 필요할 수 있습니다.

### Server

`dev-server/index.ts`

- 기존 `/api/extract-session-evidence`의 긴 동기 처리 경로를 분리합니다.
- Moment/AnalysisJob 생성 endpoint가 필요합니다.
- worker loop 또는 job processing 함수가 필요합니다.
- Gemini 호출 결과를 Supabase에 저장해야 합니다.
- duplicate queued/processing job 방지가 필요합니다.

`scripts/smoke-test-supabase.mjs`

- 현재 connection smoke test입니다.
- 이후 DB write smoke test로 확장할 수 있습니다.

### Database / Infra

`supabase/phase1_schema.sql`

- `moments`, `analysis_jobs`, `evidence_results`는 이미 초안이 있습니다.
- async MVP 구현 전에 unique/index/claim 전략을 보강해야 합니다.
- RLS는 Auth 전까지 잠금 상태를 유지합니다.

`.env.example`

- server-only Supabase env와 worker 관련 env가 필요할 수 있습니다.
- 예: poll interval, max concurrent jobs, worker secret, retry limit.

`docs/SUPABASE_PHASE_1_SETUP.md`

- Supabase project setup 이후 async analysis smoke test 절차를 추가할 수 있습니다.

## 6. Supabase가 들어갈 위치

Supabase는 비동기 분석 전환에서 durable source of truth 역할을 맡습니다.

### Postgres

즉시 필요한 역할:

- `moments`: 제품 상태와 feed의 기준
- `analysis_jobs`: 백그라운드 분석 상태
- `evidence_results`: Gemini evidence 결과와 실패 결과
- `users`: 소유권 경계 준비

### Auth

MVP 초반에는 Auth UI를 만들지 않습니다.

역할:

- 나중에 `auth.users.id`와 app-level `users.id`를 매핑합니다.
- RLS로 사용자별 Moment/Result 접근을 제한합니다.

### Storage

진짜 비동기 분석의 핵심 전제입니다.

이유:

- 현재 모바일 local video URI는 서버 worker가 나중에 다시 접근할 수 없습니다.
- 백그라운드 worker가 분석하려면 영상이 durable remote location에 있어야 합니다.

단계적 접근:

1. MVP 전환 초반에는 기존 요청에서 서버가 파일을 받은 즉시 임시 저장하거나 Gemini Files API에 업로드하고 job metadata에 참조를 남깁니다.
2. 안정화 후 Supabase Storage `moment-media` bucket에 원본 영상을 저장합니다.
3. worker는 Storage path를 읽어 Gemini 분석을 수행합니다.

### Realtime

초기 MVP에서는 polling으로 충분합니다.

나중에 추가할 역할:

- `moments.status`
- `analysis_jobs.status`
- `evidence_results` insert

변경을 구독해 Bottom Sheet와 feed를 자동 갱신합니다.

### Queues

초기 MVP에서는 job table polling으로 시작하는 편이 안전합니다.

나중에 추가할 역할:

- Supabase Queues 또는 별도 queue가 `analysis_jobs.id`를 전달합니다.
- worker는 queue message를 claim한 뒤 DB transaction으로 job 상태를 변경합니다.

## 7. 최소 구현 단계(MVP)

목표:

```text
Moment 생성 후 화면은 즉시 반환되고,
분석 상태는 processing -> completed / failed로 나중에 갱신된다.
```

MVP 범위:

- Auth UI 없음
- Push 없음
- OpenAI benchmark 없음
- Coaching 없음
- Scoring 없음
- Production-grade queue 없음

MVP 단계:

1. Supabase env 연결 확인
2. `phase1_schema.sql` 적용
3. 개발용 app user seed 생성
4. 서버에서 Moment 생성 + AnalysisJob 생성 endpoint 추가
5. endpoint는 즉시 Moment와 queued/processing job을 반환
6. 서버 worker 함수가 queued job을 처리
7. worker가 기존 Gemini evidence extraction 로직을 재사용
8. worker가 EvidenceResult 저장
9. worker가 AnalysisJob과 Moment status 업데이트
10. 모바일은 Moment 생성 후 즉시 화면 갱신
11. 모바일은 selected Moment에 대해 polling으로 상태 확인
12. Bottom Sheet는 `processing`, `completed`, `failed`를 durable status 기준으로 표시
13. retry 버튼은 failed Moment에 대해 새 AnalysisJob 생성

초기 polling 기준:

```text
processing 상태일 때 2~5초 간격으로 GET /api/moments/:id
completed 또는 failed가 되면 polling 중지
```

## 8. 리스크

### Media durability

가장 큰 리스크입니다.

비동기 worker가 나중에 분석하려면 영상 파일에 접근할 수 있어야 합니다. 현재 모바일 local URI는 서버가 나중에 읽을 수 없습니다.

대응:

- 단기: 요청 시 서버가 파일을 받아 임시 저장하거나 Gemini upload 결과를 job과 연결합니다.
- 중기: Supabase Storage에 원본 영상 업로드 후 worker가 Storage path를 사용합니다.

### Long-running Gemini request

Gemini video analysis는 오래 걸릴 수 있습니다.

대응:

- API request와 worker execution을 분리합니다.
- worker timeout과 retry limit을 명확히 둡니다.
- failed 상태를 제품 상태로 인정합니다.

### Duplicate jobs

사용자가 Moment를 여러 번 열거나 retry를 연타하면 중복 job이 생길 수 있습니다.

대응:

- `queued` / `processing` job이 있으면 재사용합니다.
- retry는 `failed` 이후에만 새 job을 허용합니다.

### Partial failure

EvidenceResult 저장은 성공했지만 Moment status 업데이트가 실패할 수 있습니다.

대응:

- 가능한 한 transaction으로 묶습니다.
- worker 재실행 시 idempotent하게 상태를 복구합니다.
- `latest_analysis_job_id`, `latest_evidence_result_id`를 최종 pointer로 사용합니다.

### RLS and service role boundary

server-only service role key가 mobile에 노출되면 안 됩니다.

대응:

- mobile은 publishable key만 사용합니다.
- server/worker만 service role key를 사용합니다.
- Auth UI 전까지 client-side DB write는 열지 않습니다.

### Current Session-to-Moment mismatch

현재 feed entity는 `Session`입니다.

대응:

- MVP에서는 `Session`을 Moment-like object로 계속 사용하되, API/DB에서는 `Moment`로 저장합니다.
- 이후 UI 모델을 `Moment` 중심으로 점진 전환합니다.

### Debug artifact behavior

현재 evidence capture artifact behavior는 유지해야 합니다.

대응:

- worker에서도 기존 capture 조건과 저장 방식을 보존합니다.
- DB에는 artifact summary/path만 저장하고 raw secret이나 private key는 저장하지 않습니다.

## 9. 구현 순서

권장 순서:

1. Supabase 개발 프로젝트 env 확정
2. `supabase/phase1_schema.sql` 적용
3. smoke test로 `users` table reachable 확인
4. 개발용 user seed 방식 결정
5. server-only Supabase client 추가
6. Moment create endpoint 추가
7. AnalysisJob create/reuse 로직 추가
8. 기존 Gemini evidence extraction 함수를 worker에서 호출 가능하게 분리
9. job table polling worker 추가
10. EvidenceResult insert 추가
11. AnalysisJob/Moment status update 추가
12. GET Moment status endpoint 추가
13. mobile create flow를 동기 분석 호출에서 async job 생성으로 전환
14. Bottom Sheet polling 추가
15. retry evidence extraction을 새 AnalysisJob 생성으로 전환
16. duplicate queued/processing job 방지 검증
17. failed 상태와 last_error 표시 검증
18. typecheck 및 diff check

실행 기준:

- 먼저 DB write spike를 서버에서 검증합니다.
- 그 다음 mobile UX를 async 상태 기반으로 바꿉니다.
- Storage는 media durability 문제를 해결해야 하는 시점에 붙입니다.
- Realtime과 Queue는 polling MVP가 안정화된 뒤 도입합니다.

## Final Target Shape

```text
Mobile
  -> create Moment
  -> receive processing state immediately
  -> show Bottom Sheet
  -> poll or subscribe

Server/API
  -> create Moment
  -> create/reuse AnalysisJob
  -> return immediately

Worker
  -> claim AnalysisJob
  -> run Gemini evidence extraction
  -> write EvidenceResult
  -> update Moment and AnalysisJob state

Supabase
  -> durable source of truth for Moment, AnalysisJob, EvidenceResult
```

The important product shift:

```text
Analysis is no longer a screen-blocking action.
Analysis becomes a durable background process attached to a Moment.
```

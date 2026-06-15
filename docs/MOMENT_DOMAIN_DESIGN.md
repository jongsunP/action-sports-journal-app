# Moment Domain Design

## Purpose

This document proposes the future Moment domain model for Action Sports
Journal.

Current implementation reality:

```text
Moment = UI concept built from Session
```

Target product direction:

```text
Moment = core product entity
```

This is a design document only. It must not be treated as an implemented data
model yet.

Non-goals for this document:

- No implementation
- No database migration
- No authentication design
- No push notification design
- No background job queue
- No scoring system

## Product Principle

Action Sports Journal is Moment First.

Users should feel they are revisiting real riding moments, not browsing session
records. Session remains useful as context, but Moment should become the
primary product surface.

Recommended future hierarchy:

```text
ActivityGroup
↓
Session
↓
Moment
↓
AnalysisResult
↓
ShareResult
```

Meaning:

- `ActivityGroup` answers: what sport or activity is this?
- `Session` answers: when and where did this riding block happen?
- `Moment` answers: what specific clip or attempt does the user want to revisit?
- `AnalysisResult` answers: what did AI observe or infer about that moment?
- `ShareResult` answers: what user-facing artifact was created from that moment?

## 1. Moment Schema Proposal

Moment should represent one user-relevant riding clip, attempt, scene, or
highlight.

Proposed TypeScript shape:

```ts
export type MomentStatus = 'draft' | 'processing' | 'completed' | 'failed';

export type MomentSource = 'user_selected_video' | 'manual_entry' | 'future_auto_detected';

export type Moment = {
  id: ID;
  sessionId: ID;
  activityGroupId: ID;

  title: string;
  notes?: string;

  source: MomentSource;
  status: MomentStatus;

  occurredAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;

  media: {
    videoUri?: string;
    thumbnailUri?: string;
    durationMs?: number;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  };

  timing?: {
    startSeconds?: number;
    endSeconds?: number;
    takeoffSeconds?: number;
    representativeFrameSeconds?: number;
  };

  userContext?: {
    intendedTrick?: string;
    userConfirmedTrick?: string;
    riderNotes?: string;
    conditions?: string[];
  };

  latestAnalysisResultId?: ID;
  analysisResultIds: ID[];
  shareResultIds: ID[];
};
```

### Field Notes

`sessionId`

Moment should belong to a Session, even if the UI is Moment First. This keeps a
place for date, location, trip, boat/cable park context, and future progression
history.

`activityGroupId`

Store this directly for simple feed filtering and future multi-sport support.
It duplicates Session context intentionally for query convenience.

`status`

Moment status is product-facing, not just API-facing.

- `draft`: moment exists but has no analysis request yet
- `processing`: evidence extraction or future analysis is running
- `completed`: latest primary analysis completed
- `failed`: latest primary analysis failed

Current MVP can map this from local request state plus
`GeminiEvidenceResult.status`. Future DB should persist it.

`media`

Moment owns the clip surface. Session should not own the primary video in the
long term. A Session may contain multiple Moments, each with separate media.

`timing`

For now, a Moment can be the whole selected clip. Later, Event Window Detection
can turn one raw video into multiple Moments with precise windows.

`userContext`

AI trick classification should not be treated as final truth. The user may
provide intended trick or confirm/correct the AI estimate.

`latestAnalysisResultId`

The UI usually needs the latest analysis. Keeping a pointer avoids scanning all
analysis results for common feed rendering.

## 2. Future DB Structure Proposal

Use a relational model when the project moves beyond local-only storage. The
domain has clear ownership and query patterns, and relational constraints will
help keep data explainable.

Proposed tables:

```text
users
activity_groups
sessions
moments
moment_media
analysis_results
analysis_observed_facts
analysis_artifacts
share_results
```

### `activity_groups`

```text
id
user_id
name
description
created_at
updated_at
```

Examples:

- Wakeboard
- Snowboard
- Skateboard

Current MVP can still treat Wakeboard as the only active sport.

### `sessions`

```text
id
user_id
activity_group_id
title
notes
started_at
ended_at
location_name
status
created_at
updated_at
```

Session should be a context container, not the main feed card.

### `moments`

```text
id
user_id
session_id
activity_group_id
title
notes
source
status
occurred_at
start_seconds
end_seconds
takeoff_seconds
representative_frame_seconds
intended_trick
user_confirmed_trick
latest_analysis_result_id
created_at
updated_at
```

Recommended indexes:

```text
user_id, occurred_at desc
session_id, occurred_at desc
activity_group_id, occurred_at desc
status
latest_analysis_result_id
```

### `moment_media`

```text
id
moment_id
kind
local_uri
remote_uri
thumbnail_uri
duration_ms
file_name
mime_type
file_size
created_at
updated_at
```

`kind` examples:

- `source_video`
- `thumbnail`
- `derived_clip`

Do not add production video storage until it is actually needed. This table is
a future shape, not a current requirement.

### `analysis_results`

```text
id
moment_id
session_id
activity_group_id
kind
provider
model
status
quality_mode
confidence
predicted_trick
family
needs_review
consistency_status
summary
raw_response_text
created_at
updated_at
```

Recommended `kind` values:

- `evidence_extraction`
- `coaching`
- `benchmark`

For the current Wakeboard Evidence Extraction MVP, only
`evidence_extraction` should be active.

### `analysis_observed_facts`

Use this table when observed facts need to be queried independently from raw
analysis JSON.

```text
id
analysis_result_id
fact_group
fact_key
value
confidence
evidence
created_at
```

Examples:

```text
fact_group = approachObservedFacts
fact_key = stance

fact_group = inversionObservedFacts
fact_key = boardAboveHead
```

This keeps the model explainable and supports future debugging.

### `analysis_artifacts`

Use this for debug captures, raw model outputs, sampled frames, or future
inspection files.

```text
id
analysis_result_id
kind
uri
metadata_json
created_at
```

Current evidence capture artifact behavior should continue. It should not be
replaced by a DB design until persistence is intentionally introduced.

### `share_results`

```text
id
moment_id
session_id
kind
title
image_uri
payload_json
created_at
```

Share artifacts should belong primarily to Moment, not Session, because users
share specific riding moments.

## 3. AnalysisResult Structure Proposal

AnalysisResult should become a record of one analysis run against one Moment.
It should not be the Moment itself.

Proposed shape:

```ts
export type AnalysisKind = 'evidence_extraction' | 'coaching' | 'benchmark';
export type AnalysisProvider = 'gemini' | 'openai' | 'manual';
export type AnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type AnalysisResult = {
  id: ID;
  momentId: ID;
  sessionId: ID;
  activityGroupId: ID;

  kind: AnalysisKind;
  provider: AnalysisProvider;
  model?: string;
  status: AnalysisStatus;
  qualityMode?: 'standard' | 'degraded';

  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt?: ISODateString;

  result: {
    predictedTrick?: string;
    family?: string;
    confidence?: EvidenceConfidence;
    needsReview?: boolean;
    consistencyStatus?: 'valid' | 'inconsistent' | 'needs_review';
    consistencyWarnings?: string[];
    summary?: string;
  };

  observedFacts?: {
    approachObservedFacts?: ApproachObservedFacts;
    inversionObservedFacts?: InversionObservedFacts;
    temporalWindows?: EvidenceTemporalWindows;
    evidenceWindows?: EvidenceWindow[];
    observations?: MotionObservation[];
  };

  review?: {
    userConfirmedTrick?: string;
    userCorrectionNotes?: string;
    reviewedAt?: ISODateString;
  };

  raw?: {
    rawResponseText?: string;
    rawFamilyCandidate?: string;
    safeFamilyCandidate?: string;
    taxonomyWarnings?: string[];
    gateFailures?: string[];
  };

  error?: {
    message: string;
    code?: string;
    recoverable?: boolean;
  };
};
```

### AnalysisResult Principles

- Store raw evidence separately from interpretation.
- Treat AI classification as a claim, not a fact.
- Keep `kind` explicit so evidence extraction, coaching, and benchmarks do not
  collapse into one ambiguous object.
- Keep failed analysis records. Failure is useful product and debugging data.
- Preserve raw response text and artifacts for evidence-quality diagnosis.

### Current MVP Mapping

Current `GeminiEvidenceResult` is closest to:

```text
AnalysisResult.kind = evidence_extraction
AnalysisResult.provider = gemini
AnalysisResult.observedFacts.approachObservedFacts
AnalysisResult.observedFacts.inversionObservedFacts
```

Current UI status can map as:

```text
request in flight -> Moment.status = processing
GeminiEvidenceResult.status completed -> Moment.status = completed
GeminiEvidenceResult.status failed -> Moment.status = failed
```

## 4. Session Structure Proposal

Session should remain part of the domain, but its role should change.

Current implementation:

```text
Session = visible feed item + video + analysis holder
```

Recommended future role:

```text
Session = riding context container
Moment = visible feed item
```

Proposed Session shape:

```ts
export type Session = {
  id: ID;
  activityGroupId: ID;

  title: string;
  notes?: string;

  startedAt: ISODateString;
  endedAt?: ISODateString;

  location?: {
    name?: string;
    type?: 'boat' | 'cable_park' | 'resort' | 'park' | 'street' | 'other';
  };

  context?: {
    weather?: string;
    equipment?: string[];
    ridingPartners?: string[];
    userGoals?: string[];
  };

  momentIds: ID[];
  primaryMomentId?: ID;

  createdAt: ISODateString;
  updatedAt: ISODateString;
};
```

### Session Principles

- Session should group Moments by real riding context.
- Session should not be required to own the main feed thumbnail.
- Session can provide useful progression context later.
- Session can remain lightweight until the product needs richer history.

### Migration Direction

Current local `Session.videoUri` can later migrate to:

```text
Moment.media.videoUri
```

Current local `Session.title` can initially become both:

```text
Session.title
Moment.title
```

until the app supports multiple Moments per Session.

Current `analysisResultId` should move from Session to Moment:

```text
Moment.latestAnalysisResultId
Moment.analysisResultIds
```

## Recommended Evolution Path

Do not jump directly to a full DB.

Recommended phases:

1. Keep current local-only implementation.
2. Introduce Moment type in code while still storing locally.
3. Migrate UI feed to render Moments directly.
4. Move evidence extraction state from Session-derived records to Moment-owned
   analysis records.
5. Only then introduce DB tables if the app needs cross-device persistence,
   account sync, production media storage, or sharing workflows.

## Open Questions

- Should one uploaded video create exactly one Moment in MVP, or can one source
  video later generate multiple Moments through Event Window Detection?
- Should user-confirmed trick live on Moment, AnalysisResult review, or both?
- Should failed analysis block Moment completion, or can a Moment be completed
  as content while analysis remains failed?
- How much Session context matters for the first real product experience?

## Current Recommendation

For the next implementation phase, keep the system simple:

```text
Moment = core feed item
Session = context container
AnalysisResult = evidence/coaching record attached to Moment
```

The immediate product should continue prioritizing Wakeboard evidence extraction
accuracy. DB, auth, push notifications, background queues, scoring, and
production media storage should remain out of scope until Moment behavior is
validated in the local-first MVP.

import { hasDebugValue, shortDebugId } from '../../utils/debugLog';
import type { UploadReconciliationCandidate } from './sessionMerge';

type UploadReconciliationLogPayload = Record<
  string,
  boolean | number | string | undefined
>;

type UploadTargetLogInput = {
  draftId: string;
  storagePath: string;
  uploadId: string;
};

type RemoteMomentReconciledLogInput = {
  localSessionId: string;
  matchReason: string;
  momentId: string;
  remoteSessionId: string;
};

type UploadFailureReconcileLogInput = {
  localSessionId: string;
  reason: string;
  stage: string;
  uploadId?: string;
};

export function hasRecoverableUploadTarget(
  candidate?: UploadReconciliationCandidate,
) {
  return Boolean(
    candidate?.uploadId &&
      candidate.storagePath &&
      candidate.storageProvider &&
      candidate.storageBucket,
  );
}

export function buildUploadReconciliationCandidateCreatedLog(
  candidate: UploadReconciliationCandidate,
): UploadReconciliationLogPayload {
  return {
    draftIdShort: shortDebugId(candidate.draftId),
    event: 'upload_reconciliation_candidate_created',
    fileSize: candidate.fileSize ?? undefined,
    localSessionIdShort: shortDebugId(candidate.localSessionId),
    matched: false,
    uploadIdShort: shortDebugId(candidate.uploadId),
  };
}

export function buildUploadReconciliationCandidateTargetedLog({
  draftId,
  sessionId,
  uploadTarget,
}: {
  draftId?: string;
  sessionId: string;
  uploadTarget: UploadTargetLogInput;
}): UploadReconciliationLogPayload {
  return {
    draftIdShort: shortDebugId(draftId ?? uploadTarget.draftId),
    event: 'upload_reconciliation_candidate_targeted',
    localSessionIdShort: shortDebugId(sessionId),
    matched: false,
    state: 'recoverable_orphan',
    storagePathPresent: hasDebugValue(uploadTarget.storagePath),
    uploadIdShort: shortDebugId(uploadTarget.uploadId),
  };
}

export function buildRemoteMomentReconciledLog({
  localSessionId,
  matchReason,
  momentId,
  remoteSessionId,
}: RemoteMomentReconciledLogInput): UploadReconciliationLogPayload {
  return {
    event: 'remote_moment_reconciled',
    localSessionIdShort: shortDebugId(localSessionId),
    matchReason,
    matched: true,
    momentIdShort: shortDebugId(momentId),
    remoteSessionIdShort: shortDebugId(remoteSessionId),
  };
}

export function buildRecoverableOrphanRecoveryStartedLog({
  candidate,
  reason,
}: {
  candidate: UploadReconciliationCandidate;
  reason: string;
}): UploadReconciliationLogPayload {
  return {
    event: 'recoverable_orphan_recovery_started',
    localSessionIdShort: shortDebugId(candidate.localSessionId),
    matchReason: 'recoverable_upload_target',
    reason,
    state: 'recoverable_orphan',
    storagePathPresent: hasDebugValue(candidate.storagePath),
    uploadIdShort: shortDebugId(candidate.uploadId),
  };
}

export function buildRecoverableOrphanRecoverySuccessLog({
  candidate,
  momentId,
  reason,
}: {
  candidate: UploadReconciliationCandidate;
  momentId: string;
  reason: string;
}): UploadReconciliationLogPayload {
  return {
    event: 'recoverable_orphan_recovery_success',
    localSessionIdShort: shortDebugId(candidate.localSessionId),
    matchReason: 'recoverable_upload_target',
    matched: true,
    momentIdShort: shortDebugId(momentId),
    reason,
    state: 'recoverable_orphan',
    storagePathPresent: hasDebugValue(candidate.storagePath),
    uploadIdShort: shortDebugId(candidate.uploadId),
  };
}

export function buildRecoverableOrphanRecoveryFailureLog({
  candidate,
  error,
}: {
  candidate: UploadReconciliationCandidate;
  error: unknown;
}): UploadReconciliationLogPayload {
  return {
    event: 'recoverable_orphan_recovery_failure',
    localSessionIdShort: shortDebugId(candidate.localSessionId),
    matched: false,
    reason: error instanceof Error ? error.message : 'unknown',
    state: 'recoverable_orphan',
    storagePathPresent: hasDebugValue(candidate.storagePath),
    uploadIdShort: shortDebugId(candidate.uploadId),
  };
}

export function buildRemoteMomentUnmatchedLog({
  candidate,
  sessionId,
}: {
  candidate?: UploadReconciliationCandidate;
  sessionId: string;
}): UploadReconciliationLogPayload {
  const recoverable = hasRecoverableUploadTarget(candidate);

  return {
    event: 'remote_moment_unmatched',
    localSessionIdShort: shortDebugId(sessionId),
    matchReason: recoverable
      ? 'upload_context_ttl_expired'
      : 'local_only_upload_context_ttl_expired',
    matched: false,
    state: recoverable ? 'recoverable_orphan' : 'remote_reconcile_pending',
  };
}

export function buildLocalOnlyUploadSessionExpiredLog(
  sessionId: string,
): UploadReconciliationLogPayload {
  return {
    event: 'local_only_upload_session_expired',
    localSessionIdShort: shortDebugId(sessionId),
    matchReason: 'missing_upload_recovery_context',
    matched: false,
  };
}

export function buildUploadFailureRemoteReconcileExistingLog({
  existingRemoteMomentId,
  localSessionId,
  reason,
  stage,
  uploadId,
}: UploadFailureReconcileLogInput & {
  existingRemoteMomentId: string;
}): UploadReconciliationLogPayload {
  return {
    event: 'upload_failure_remote_reconcile_existing',
    localSessionIdShort: shortDebugId(localSessionId),
    momentIdShort: shortDebugId(existingRemoteMomentId),
    reason,
    stage,
    uploadIdShort: shortDebugId(uploadId),
  };
}

export function buildUploadFailureRemoteReconcileMatchedLog({
  attempt,
  localSessionId,
  matchedMomentId,
  reason,
  stage,
  uploadId,
}: UploadFailureReconcileLogInput & {
  attempt: number;
  matchedMomentId: string;
}): UploadReconciliationLogPayload {
  return {
    attempt,
    event: 'upload_failure_remote_reconcile_matched',
    localSessionIdShort: shortDebugId(localSessionId),
    momentIdShort: shortDebugId(matchedMomentId),
    reason,
    stage,
    uploadIdShort: shortDebugId(uploadId),
  };
}

export function buildUploadFailureRemoteReconcileUnmatchedLog({
  attempt,
  localSessionId,
  reason,
  stage,
  uploadId,
}: UploadFailureReconcileLogInput & {
  attempt: number;
}): UploadReconciliationLogPayload {
  return {
    attempt,
    event: 'upload_failure_remote_reconcile_unmatched',
    localSessionIdShort: shortDebugId(localSessionId),
    reason,
    stage,
    uploadIdShort: shortDebugId(uploadId),
  };
}

export function buildUploadFailureRemoteReconcileFailedLog({
  error,
  localSessionId,
  sourceFailureReason,
  stage,
  uploadId,
}: {
  error: unknown;
  localSessionId: string;
  sourceFailureReason: string;
  stage: string;
  uploadId?: string;
}): UploadReconciliationLogPayload {
  return {
    event: 'upload_failure_remote_reconcile_failed',
    localSessionIdShort: shortDebugId(localSessionId),
    reason: error instanceof Error ? error.message : 'unknown',
    sourceFailureReason,
    stage,
    uploadIdShort: shortDebugId(uploadId),
  };
}

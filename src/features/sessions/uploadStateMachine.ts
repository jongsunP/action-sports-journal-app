export type UploadRecoveryState =
  | 'target_not_issued'
  | 'remote_reconcile_pending'
  | 'recoverable_orphan'
  | 'local_only_failure'
  | 'terminal_upload_failed';

export type UploadFailureStage =
  | 'fallback_upload'
  | 'local_video_access'
  | 'request_upload_target'
  | 'stored_moment'
  | 'upload'
  | string;

export type UploadFailureClassification = {
  shouldAttemptRemoteReconcile: boolean;
  shouldSuppressAlert: boolean;
  state: UploadRecoveryState;
  suppressReason?: string;
};

export function classifyUploadFailure({
  appState,
  hasRemoteMoment,
  isLocalVideoAccessFailure,
  stage,
  uploadId,
}: {
  appState?: string;
  hasRemoteMoment?: boolean;
  isLocalVideoAccessFailure?: boolean;
  stage: UploadFailureStage;
  uploadId?: string;
}): UploadFailureClassification {
  if (hasRemoteMoment) {
    return {
      shouldAttemptRemoteReconcile: false,
      shouldSuppressAlert: true,
      state: 'remote_reconcile_pending',
      suppressReason: 'remote_moment_exists',
    };
  }

  if (stage === 'fallback_upload') {
    return {
      shouldAttemptRemoteReconcile: true,
      shouldSuppressAlert: true,
      state: 'remote_reconcile_pending',
      suppressReason: 'fallback_recoverable_or_ambiguous',
    };
  }

  if (stage !== 'request_upload_target' && uploadId) {
    return {
      shouldAttemptRemoteReconcile: true,
      shouldSuppressAlert: true,
      state: 'recoverable_orphan',
      suppressReason: 'recoverable_upload_target',
    };
  }

  if (appState && appState !== 'active') {
    return {
      shouldAttemptRemoteReconcile: stage !== 'request_upload_target',
      shouldSuppressAlert: true,
      state: stage === 'request_upload_target'
        ? 'target_not_issued'
        : 'remote_reconcile_pending',
      suppressReason: 'app_not_active',
    };
  }

  if (isLocalVideoAccessFailure) {
    return {
      shouldAttemptRemoteReconcile: stage !== 'request_upload_target',
      shouldSuppressAlert: false,
      state: 'local_only_failure',
    };
  }

  if (stage === 'request_upload_target') {
    return {
      shouldAttemptRemoteReconcile: false,
      shouldSuppressAlert: false,
      state: 'target_not_issued',
    };
  }

  return {
    shouldAttemptRemoteReconcile: true,
    shouldSuppressAlert: false,
    state: 'terminal_upload_failed',
  };
}

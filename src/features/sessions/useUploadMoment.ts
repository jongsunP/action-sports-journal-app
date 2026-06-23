import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Alert, AppState } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  type SessionVideoAsset,
} from '../../services/ai';
import {
  createMomentFromSourceVideo,
  hasConfiguredSupabaseMoments,
  RemoteRequestError,
  type UploadedThumbnailReference,
  type VideoUploadTarget,
} from '../../services/moments';
import {
  createSessionVideoThumbnail,
  hasConfiguredVideoThumbnailEndpoint,
} from '../../services/video/createSessionVideoThumbnail';

import type { Session } from '../../types';
import type { AppTabId } from './sessionComponents';
import type { UploadReconciliationCandidate } from './sessionMerge';
import {
  finalizeUploadedDraftSource,
  finalizeUploadedDraftSourceFromTarget,
  uploadDraftSourceVideoDirectly,
} from './uploadDraftDirectUpload';
import {
  createUploadDraftFromVideo,
  type UploadDraft,
} from './uploadDraftStorage';
import {
  buildUploadProgress,
  type UploadProgressStage,
  type UploadProgressState,
} from './uploadProgress';
import { classifyUploadFailure } from './uploadStateMachine';

const MULTIPART_FALLBACK_UPLOAD_TIMEOUT_MS = 30000;

type ExtractEvidenceOptions = {
  openSheet?: boolean;
  videoOverride?: SessionVideoAsset;
  momentIdOverride?: string;
};

type UseUploadMomentParams = {
  activityGroupId?: string;
  extractEvidence: (
    session: Session,
    options?: ExtractEvidenceOptions,
  ) => Promise<void>;
  activateTab: (tabId: AppTabId) => void;
  setRemoteMomentIdForSession: (
    sessionId: string,
    remoteMomentId: string,
  ) => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setThumbnailForSession: (sessionId: string, thumbnailUri: string) => void;
  setVideoForSession: (sessionId: string, video: SessionVideoAsset) => void;
  onOptimisticUploadContextCreated?: (
    candidate: UploadReconciliationCandidate,
  ) => void;
  onOptimisticSessionCreated?: (sessionId: string) => void;
  onOptimisticSessionRejected?: (sessionId: string) => void;
  onUploadReconciliationCandidateResolved?: (sessionId: string) => void;
  onUploadReconciliationTargetResolved?: (
    sessionId: string,
    uploadTarget: VideoUploadTarget,
    draftId?: string,
  ) => void;
  shouldSuppressUploadFailureAlert?: (
    context: UploadFailureAlertContext,
  ) => Promise<boolean> | boolean;
  onUploadSuccess?: () => void;
  updateLocalMomentStatus: (
    sessionId: string,
    momentStatus: Session['momentStatus'],
  ) => void;
};

type UploadFailureAlertContext = {
  localSessionId: string;
  reason: string;
  stage: string;
  uploadId?: string;
};

type UploadFailureAlertOptions = UploadFailureAlertContext & {
  message: string;
  title: string;
};

export function useUploadMoment({
  activityGroupId,
  activateTab,
  extractEvidence,
  setRemoteMomentIdForSession,
  setSessions,
  setThumbnailForSession,
  setVideoForSession,
  onOptimisticUploadContextCreated,
  onOptimisticSessionCreated,
  onOptimisticSessionRejected,
  onUploadReconciliationCandidateResolved,
  onUploadReconciliationTargetResolved,
  shouldSuppressUploadFailureAlert,
  onUploadSuccess,
  updateLocalMomentStatus,
}: UseUploadMomentParams) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isUploadingSession, setIsUploadingSession] = useState(false);
  const isUploadingSessionRef = useRef(false);
  const uploadThumbnailRequestIdRef = useRef(0);
  const selectedVideoThumbnailUriRef = useRef<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SessionVideoAsset | null>(
    null,
  );
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const [selectedVideoThumbnailUri, setSelectedVideoThumbnailUri] = useState<
    string | null
  >(null);
  const [
    isPreparingSelectedVideoThumbnail,
    setIsPreparingSelectedVideoThumbnail,
  ] = useState(false);

  const canCreateVideoThumbnail = hasConfiguredVideoThumbnailEndpoint();
  const canUploadSession = useMemo(
    () =>
      Boolean(selectedVideo ?? uploadDraft) &&
      !isUploadingSession &&
      !isPreparingSelectedVideoThumbnail,
    [isPreparingSelectedVideoThumbnail, isUploadingSession, selectedVideo, uploadDraft],
  );

  const closeUploadSheet = () => {
    if (isUploadingSession) {
      return;
    }

    setIsComposerOpen(false);
    setSelectedVideo(null);
    selectedVideoThumbnailUriRef.current = null;
    setSelectedVideoThumbnailUri(null);
    setIsPreparingSelectedVideoThumbnail(false);
    setUploadDraft(null);
    setUploadProgress(null);
  };

  const createThumbnailForSession = async (
    sessionId: string,
    video: SessionVideoAsset,
  ) => {
    if (!canCreateVideoThumbnail) {
      return;
    }

    try {
      const imageUri = await createSessionVideoThumbnail(video, {
        allowRemoteFallback: false,
      });

      setThumbnailForSession(sessionId, imageUri);
    } catch {
      // Thumbnail generation is best-effort. The feed keeps its visual fallback.
    }
  };

  const prepareSelectedVideoThumbnail = async (
    video: SessionVideoAsset,
    draftId?: string,
  ) => {
    const requestId = uploadThumbnailRequestIdRef.current + 1;
    uploadThumbnailRequestIdRef.current = requestId;
    selectedVideoThumbnailUriRef.current = null;
    setSelectedVideoThumbnailUri(null);
    setIsPreparingSelectedVideoThumbnail(true);

    try {
      const imageUri = await createSessionVideoThumbnail(video, {
        allowRemoteFallback: false,
        timeoutMs: 1800,
      });

      if (uploadThumbnailRequestIdRef.current !== requestId) {
        return;
      }

      selectedVideoThumbnailUriRef.current = imageUri;
      setSelectedVideoThumbnailUri(imageUri);

      if (draftId) {
        setUploadDraft((currentDraft) =>
          currentDraft?.draftId === draftId
            ? {
                ...currentDraft,
                localThumbnailUri: imageUri,
                updatedAt: new Date().toISOString(),
              }
            : currentDraft,
        );
      }
    } catch (error) {
      if (uploadThumbnailRequestIdRef.current !== requestId) {
        return;
      }

      console.warn(
        'Selected video thumbnail preparation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      selectedVideoThumbnailUriRef.current = null;
      setSelectedVideoThumbnailUri(null);
    } finally {
      if (uploadThumbnailRequestIdRef.current === requestId) {
        setIsPreparingSelectedVideoThumbnail(false);
      }
    }
  };

  const handlePickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        '사진 접근 권한이 필요합니다',
        '라이딩 영상을 선택하려면 사진 보관함 접근을 허용해주세요.',
      );
      return false;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return false;
    }

    const asset = result.assets[0];

    if (!asset || asset.type !== 'video') {
      Alert.alert('영상이 필요합니다', '분석할 영상을 선택해주세요.');
      return false;
    }

    const nextVideo = {
      uri: asset.uri,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      duration: asset.duration,
    };
    const nextDraft = createUploadDraftFromVideo(nextVideo);

    setSelectedVideo(nextVideo);
    setUploadDraft(nextDraft);
    void prepareSelectedVideoThumbnail(nextVideo, nextDraft.draftId);

    return true;
  };

  const handleOpenUploadSheet = async () => {
    if (isUploadingSession) {
      return;
    }

    const didPickVideo = await handlePickVideo();

    if (didPickVideo) {
      setIsComposerOpen(true);
    }
  };

  const setUploadProgressStage = (
    stage: UploadProgressStage,
    percent?: number,
  ) => {
    setUploadProgress(buildUploadProgress(stage, percent));
  };

  const setUploadDraftStatus = (status: UploadDraft['status']) => {
    setUploadDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            status,
            updatedAt: new Date().toISOString(),
          }
        : currentDraft,
    );
  };

  const handleAddSession = () => {
    const videoForUpload = selectedVideo;

    if (
      !activityGroupId ||
      !videoForUpload ||
      isUploadingSession ||
      isPreparingSelectedVideoThumbnail ||
      isUploadingSessionRef.current
    ) {
      return;
    }

    isUploadingSessionRef.current = true;
    setIsUploadingSession(true);
    setUploadProgress(buildUploadProgress('preparing'));

    const now = new Date().toISOString();
    const nextSession: Session = {
      id: createLocalSessionId(),
      activityGroupId,
      occurredAt: now,
      videoUri: videoForUpload.uri,
      momentStatus: 'uploading',
      shareResultIds: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((current) => [nextSession, ...current]);
    onOptimisticSessionCreated?.(nextSession.id);
    onOptimisticUploadContextCreated?.({
      createdAt: now,
      draftId: uploadDraft?.draftId,
      durationMs: videoForUpload.duration,
      fileName: videoForUpload.fileName,
      fileSize: videoForUpload.fileSize,
      localSessionId: nextSession.id,
      occurredAt: nextSession.occurredAt,
      sourceVideoUri: videoForUpload.uri,
      storagePath: uploadDraft?.storagePath,
      uploadId: uploadDraft?.uploadId,
    });

    setVideoForSession(nextSession.id, videoForUpload);
    const preparedThumbnailUri =
      selectedVideoThumbnailUriRef.current ?? selectedVideoThumbnailUri;

    if (preparedThumbnailUri) {
      setThumbnailForSession(nextSession.id, preparedThumbnailUri);
    } else {
      createThumbnailForSession(nextSession.id, videoForUpload);
    }
    activateTab('video');
    void (async () => {
      let uploadStartedAt: number | undefined;
      let usedUploadFallback = false;
      let directUploadedTarget: VideoUploadTarget | undefined;
      let fallbackThumbnailReference: UploadedThumbnailReference | undefined;

      try {
        setUploadDraftStatus('uploading');

        if (!hasConfiguredSupabaseMoments()) {
          await extractEvidence(nextSession, {
            openSheet: false,
            videoOverride: videoForUpload,
          });
          setUploadDraft(null);
          setSelectedVideo(null);
          selectedVideoThumbnailUriRef.current = null;
          setSelectedVideoThumbnailUri(null);
          setIsComposerOpen(false);
          setUploadProgress(null);
          return;
        }

        uploadStartedAt = Date.now();

        console.info('[upload_timing]', {
          event: 'upload_start',
          fileSize: videoForUpload.fileSize,
          localSessionId: nextSession.id,
        });

        const handleDirectUploadTarget = (uploadTarget: VideoUploadTarget) => {
          directUploadedTarget = {
            ...directUploadedTarget,
            ...uploadTarget,
          };
          fallbackThumbnailReference =
            uploadTarget.uploadedThumbnail ?? fallbackThumbnailReference;
          onUploadReconciliationTargetResolved?.(
            nextSession.id,
            directUploadedTarget,
            uploadDraft?.draftId,
          );
        };

        let storedMoment = await createMomentFromDirectUpload({
          draft: uploadDraft,
          onDirectUploadTarget: handleDirectUploadTarget,
          onProgress: setUploadProgressStage,
          session: nextSession,
        });

        if (!storedMoment && uploadDraft && directUploadedTarget) {
          console.info('[upload_timing]', {
            draftId: uploadDraft.draftId,
            event: 'direct_finalize_retry_started',
            localSessionId: nextSession.id,
            storagePath: directUploadedTarget.storagePath,
            uploadId: directUploadedTarget.uploadId,
          });
          try {
            storedMoment = await finalizeUploadedDraftSourceFromTarget(
              uploadDraft,
              directUploadedTarget,
              nextSession,
              {
                onProgress: setUploadProgressStage,
              },
            );
            console.info('[upload_timing]', {
              draftId: uploadDraft.draftId,
              event: 'direct_finalize_retry_success',
              localSessionId: nextSession.id,
              momentId: storedMoment?.momentId,
              storagePath: directUploadedTarget.storagePath,
              uploadId: directUploadedTarget.uploadId,
            });
          } catch (error) {
            console.info('[upload_timing]', {
              draftId: uploadDraft.draftId,
              event: 'direct_finalize_retry_failure',
              localSessionId: nextSession.id,
              reason: error instanceof Error ? error.message : 'unknown',
              storagePath: directUploadedTarget.storagePath,
              uploadId: directUploadedTarget.uploadId,
            });
          }
        }

        if (!storedMoment) {
          usedUploadFallback = true;
          setUploadProgressStage('fallback_upload');
          console.info('[upload_timing]', {
            draftId: uploadDraft?.draftId,
            event: 'fallback_started',
            localSessionId: nextSession.id,
            uploadId: uploadDraft?.uploadId,
          });
          storedMoment = await withUploadTimeout(
            createMomentFromSourceVideo(nextSession, videoForUpload, {
              thumbnailStorageProvider: fallbackThumbnailReference?.storageProvider,
              thumbnailStorageBucket: fallbackThumbnailReference?.storageBucket,
              thumbnailStoragePath: fallbackThumbnailReference?.storagePath,
            }),
            MULTIPART_FALLBACK_UPLOAD_TIMEOUT_MS,
            'Multipart fallback upload timed out.',
          );
          console.info('[upload_timing]', {
            draftId: uploadDraft?.draftId,
            event: 'fallback_success',
            localSessionId: nextSession.id,
            momentId: storedMoment?.momentId,
            storagePath: storedMoment?.storagePath,
            uploadId: uploadDraft?.uploadId,
          });
        }

        if (!storedMoment) {
          console.info('[upload_timing]', {
            elapsedMs: Date.now() - uploadStartedAt,
            event: 'upload_failure',
            localSessionId: nextSession.id,
            reason: 'no_stored_moment',
          });
          setSessions((current) =>
            current.filter((session) => session.id !== nextSession.id),
          );
          onOptimisticSessionRejected?.(nextSession.id);
          onUploadReconciliationCandidateResolved?.(nextSession.id);
          setUploadDraftStatus('upload_failed');
          await showUploadFailureAlertIfActive({
            localSessionId: nextSession.id,
            message:
              '분석을 시작하려면 원본 영상을 서버에 먼저 업로드해야 합니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
            reason: 'no_stored_moment',
            shouldSuppressAlert: shouldSuppressUploadFailureAlert,
            stage: 'stored_moment',
            title: '영상 업로드에 실패했습니다',
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
          });
          return;
        }

        setRemoteMomentIdForSession(nextSession.id, storedMoment.momentId);
        onUploadReconciliationCandidateResolved?.(nextSession.id);
        setUploadProgressStage('requesting_analysis');

        const nextMomentStatus =
          storedMoment.analysisJobStatus === 'processing' ||
          storedMoment.analysisStarted
            ? 'processing'
            : 'queued';

        console.info('[upload_timing]', {
          elapsedMs: Date.now() - uploadStartedAt,
          event: 'upload_success',
          localSessionId: nextSession.id,
          momentId: storedMoment.momentId,
          nextMomentStatus,
          uploadPath: usedUploadFallback ? 'multipart_fallback' : 'direct',
        });

        updateLocalMomentStatus(nextSession.id, nextMomentStatus);
        onUploadSuccess?.();
        setUploadDraft(null);
        setSelectedVideo(null);
        selectedVideoThumbnailUriRef.current = null;
        setSelectedVideoThumbnailUri(null);
        setIsComposerOpen(false);
        setUploadProgress(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'unknown';
        const shouldWaitForFallbackSync =
          usedUploadFallback && isMultipartFallbackAmbiguousFailure(errorMessage);

        console.info('[upload_timing]', {
          elapsedMs:
            typeof uploadStartedAt === 'number'
              ? Date.now() - uploadStartedAt
              : undefined,
          event: shouldWaitForFallbackSync
            ? 'fallback_ambiguous_waiting_for_sync'
            : 'upload_failure',
          localSessionId: nextSession.id,
          reason: errorMessage,
        });

        if (shouldWaitForFallbackSync) {
          updateLocalMomentStatus(nextSession.id, 'processing');
          onUploadSuccess?.();
          setUploadDraft(null);
          setSelectedVideo(null);
          selectedVideoThumbnailUriRef.current = null;
          setSelectedVideoThumbnailUri(null);
          setIsComposerOpen(false);
          setUploadProgress(null);
          return;
        }

        setSessions((current) =>
          current.filter((session) => session.id !== nextSession.id),
        );
        onOptimisticSessionRejected?.(nextSession.id);
        onUploadReconciliationCandidateResolved?.(nextSession.id);
        setUploadDraftStatus('upload_failed');
        setUploadDraft(null);
        setSelectedVideo(null);
        selectedVideoThumbnailUriRef.current = null;
        setSelectedVideoThumbnailUri(null);
        setIsComposerOpen(false);
        setUploadProgress(null);
        console.warn(
          'Stored Moment source upload failed:',
          errorMessage,
        );
        if (isLocalVideoAccessFailure(errorMessage)) {
          await showUploadFailureAlertIfActive({
            localSessionId: nextSession.id,
            message:
              '선택한 영상 파일에 다시 접근하지 못했습니다. 영상을 다시 선택한 뒤 업로드해주세요.',
            reason: errorMessage,
            shouldSuppressAlert: shouldSuppressUploadFailureAlert,
            stage: usedUploadFallback ? 'fallback_upload' : 'local_video_access',
            title: '영상 파일을 다시 선택해 주세요',
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
          });
        } else if (isUploadTargetRateLimitFailure(error)) {
          await showUploadFailureAlertIfActive({
            localSessionId: nextSession.id,
            message:
              '연속 업로드 요청이 잠시 몰렸습니다. 잠깐 기다린 뒤 다시 업로드해주세요.',
            reason: errorMessage,
            shouldSuppressAlert: shouldSuppressUploadFailureAlert,
            stage: 'request_upload_target',
            title: '잠시 후 다시 시도해주세요',
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
          });
        } else {
          await showUploadFailureAlertIfActive({
            localSessionId: nextSession.id,
            message:
              '업로드가 완료되지 않아 분석을 시작하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
            reason: errorMessage,
            shouldSuppressAlert: shouldSuppressUploadFailureAlert,
            stage: usedUploadFallback ? 'fallback_upload' : 'upload',
            title: '영상 업로드에 실패했습니다',
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
          });
        }
      } finally {
        isUploadingSessionRef.current = false;
        setIsUploadingSession(false);
        setUploadProgress((currentProgress) =>
          currentProgress?.stage === 'requesting_analysis'
            ? null
            : currentProgress,
        );
      }
    })();
  };

  return {
    canUploadSession,
    closeUploadSheet,
    handleAddSession,
    handleOpenUploadSheet,
    handlePickVideo,
    isComposerOpen,
    isPreparingSelectedVideoThumbnail,
    isUploadingSession,
    selectedVideo,
    uploadDraft,
    uploadProgress,
  };
}

async function showUploadFailureAlertIfActive({
  localSessionId,
  message,
  reason,
  shouldSuppressAlert,
  stage,
  title,
  uploadId,
}: UploadFailureAlertOptions & {
  shouldSuppressAlert?: UseUploadMomentParams['shouldSuppressUploadFailureAlert'];
}) {
  const remoteReconcileClassification = classifyUploadFailure({
    stage,
    uploadId,
  });
  const shouldSuppress = remoteReconcileClassification.shouldAttemptRemoteReconcile
    ? await shouldSuppressAlert?.({
        localSessionId,
        reason,
        stage,
        uploadId,
      })
    : false;

  if (shouldSuppress) {
    const classification = classifyUploadFailure({
      hasRemoteMoment: true,
      stage,
      uploadId,
    });
    console.info('[upload_timing]', {
      event: 'upload_failure_alert_suppressed',
      localSessionId,
      reason,
      stage,
      state: classification.state,
      suppressReason: classification.suppressReason,
      uploadId,
    });
    return;
  }

  const classification = classifyUploadFailure({
    appState: AppState.currentState,
    isLocalVideoAccessFailure: isLocalVideoAccessFailure(reason),
    stage,
    uploadId,
  });

  if (classification.shouldSuppressAlert) {
    console.info('[upload_timing]', {
      appState: classification.suppressReason === 'app_not_active'
        ? AppState.currentState
        : undefined,
      event: 'upload_failure_alert_suppressed',
      localSessionId,
      reason,
      stage,
      state: classification.state,
      suppressReason: classification.suppressReason,
      uploadId,
    });
    return;
  }

  console.info('[upload_timing]', {
    event: 'upload_failure_alert_presented',
    localSessionId,
    reason,
    stage,
    state: classification.state,
    uploadId,
  });
  Alert.alert(title, message);
}

function isLocalVideoAccessFailure(message: string) {
  return (
    message.includes('source video for signed upload') ||
    message.includes('signed upload file body') ||
    message.includes('Signed upload file body is empty') ||
    message.includes('Multipart fallback upload timed out')
  );
}

async function createMomentFromDirectUpload({
  draft,
  onDirectUploadTarget,
  onProgress,
  session,
}: {
  draft: UploadDraft | null;
  onDirectUploadTarget?: (uploadTarget: VideoUploadTarget) => void;
  onProgress: (stage: UploadProgressStage, percent?: number) => void;
  session: Session;
}) {
  if (!draft) {
    console.info('[upload_timing]', {
      event: 'direct_upload_skipped',
      fallback_will_run: true,
      localSessionId: session.id,
      reason: 'no_draft',
      stage: 'draft',
    });
    return undefined;
  }

  let uploadTarget: Awaited<
    ReturnType<typeof uploadDraftSourceVideoDirectly>
  >;

  try {
    uploadTarget = await uploadDraftSourceVideoDirectly(draft, {
      localSessionId: session.id,
      onUploadTargetCreated: onDirectUploadTarget,
      onProgress,
    });

    if (!uploadTarget) {
      console.info('[upload_timing]', {
        draftId: draft.draftId,
        event: 'direct_upload_skipped',
        fallback_will_run: true,
        localSessionId: session.id,
        reason: 'no_upload_target',
        stage: 'upload_target',
      });
      return undefined;
    }

    const uploadedDraft: UploadDraft = {
      ...draft,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
      uploadId: uploadTarget.uploadId,
      storageProvider: uploadTarget.provider,
      storageBucket: uploadTarget.bucket,
      storagePath: uploadTarget.storagePath,
      thumbnailTarget: uploadTarget.thumbnailTarget,
      uploadedThumbnail: uploadTarget.uploadedThumbnail,
    };
    onDirectUploadTarget?.(uploadTarget);

    const storedMoment = await finalizeUploadedDraftSource(uploadedDraft, session, {
      onProgress,
    });

    if (!storedMoment) {
      console.info('[upload_timing]', {
        draftId: draft.draftId,
        event: 'direct_finalize_empty_result',
        fallback_will_run: true,
        localSessionId: session.id,
        stage: 'finalize',
        storagePath: uploadTarget.storagePath,
        uploadId: uploadTarget.uploadId,
      });
    }

    return storedMoment;
  } catch (error) {
    if (isUploadTargetRateLimitFailure(error)) {
      console.info('[upload_timing]', {
        draftId: draft.draftId,
        event: 'upload_target_rate_limited',
        fallback_will_run: false,
        localSessionId: session.id,
        reason: error instanceof Error ? error.message : 'unknown',
        stage: 'request_upload_target',
      });
      throw error;
    }

    console.info('[upload_timing]', {
      draftId: draft.draftId,
      event: 'direct_upload_failure',
      fallback_will_run: true,
      localSessionId: session.id,
      stage: uploadTarget ? 'finalize_or_response' : 'direct_upload',
      reason: error instanceof Error ? error.message : 'unknown',
      storagePath: uploadTarget?.storagePath,
      uploadId: uploadTarget?.uploadId ?? draft.uploadId,
      videoUriScheme: draft.localVideoUri.split(':', 1)[0],
    });
    console.warn(
      'Direct upload finalize path failed; falling back to multipart upload:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return undefined;
  }
}

function isUploadTargetRateLimitFailure(error: unknown) {
  return error instanceof RemoteRequestError && error.status === 429;
}

function withUploadTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then(resolve, reject)
      .finally(() => {
        clearTimeout(timeout);
      });
  });
}

function isMultipartFallbackAmbiguousFailure(errorMessage: string) {
  return errorMessage === 'Multipart fallback upload timed out.';
}

function createLocalSessionId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  const randomHex = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);

  return [
    `${randomHex()}${randomHex()}`,
    randomHex(),
    `4${randomHex().slice(1)}`,
    `${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex().slice(1)}`,
    `${randomHex()}${randomHex()}${randomHex()}`,
  ].join('-');
}

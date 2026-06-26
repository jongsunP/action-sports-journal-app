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
const MAX_UPLOAD_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_UPLOAD_VIDEO_MB = Math.round(MAX_UPLOAD_VIDEO_BYTES / 1024 / 1024);
const MAX_UPLOAD_VIDEO_DURATION_MS = 15_000;
const MAX_UPLOAD_VIDEO_DURATION_SECONDS = Math.round(
  MAX_UPLOAD_VIDEO_DURATION_MS / 1000,
);
const ALLOWED_UPLOAD_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/mov',
]);
const ENABLE_ANALYSIS_PUSH_NOTIFICATIONS =
  process.env.EXPO_PUBLIC_ENABLE_ANALYSIS_PUSH_NOTIFICATIONS === 'true';

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
  const uploadFlowGenerationRef = useRef(0);
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

  const resetUploadFlow = () => {
    uploadFlowGenerationRef.current += 1;
    isUploadingSessionRef.current = false;
    setIsUploadingSession(false);
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

    const validationAlert = getUploadPolicyAlertForVideo({
      duration: asset.duration,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      uri: asset.uri,
    });

    if (validationAlert) {
      Alert.alert(validationAlert.title, validationAlert.message);
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

    const uploadFlowGeneration = uploadFlowGenerationRef.current;
    const didPickVideo = await handlePickVideo();

    if (
      didPickVideo &&
      uploadFlowGenerationRef.current === uploadFlowGeneration
    ) {
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
    ensureAnalysisPushRegistrationForUpload();

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
      let directFailureReason: string | undefined;
      let directFailureStage: string | undefined;
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
            directFailureStage = 'finalize_retry';
            directFailureReason =
              error instanceof Error ? error.message : 'unknown';
            console.info('[upload_timing]', {
              draftId: uploadDraft.draftId,
              event: 'direct_finalize_retry_failure',
              localSessionId: nextSession.id,
              reason: directFailureReason,
              storagePath: directUploadedTarget.storagePath,
              uploadId: directUploadedTarget.uploadId,
            });
          }
        }

        if (!storedMoment) {
          usedUploadFallback = true;
          directFailureStage =
            directFailureStage ??
            (directUploadedTarget ? 'finalize_or_response' : 'direct_upload');
          directFailureReason =
            directFailureReason ??
            (directUploadedTarget
              ? 'direct path did not return a stored moment'
              : 'direct upload target was not created or direct upload failed');
          console.info('[upload_timing]', {
            directFailureReason,
            directFailureStage,
            draftId: uploadDraft?.draftId,
            event: 'upload_path_decided',
            localSessionId: nextSession.id,
            path: 'multipart_fallback',
            storagePath: directUploadedTarget?.storagePath,
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
          });
          setUploadProgressStage('fallback_upload');
          console.info('[upload_timing]', {
            directFailureReason,
            directFailureStage,
            draftId: uploadDraft?.draftId,
            event: 'fallback_started',
            localSessionId: nextSession.id,
            storagePath: directUploadedTarget?.storagePath,
            uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
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
        const uploadPath = usedUploadFallback ? 'multipart_fallback' : 'direct';

        console.info('[upload_timing]', {
          directFailureReason,
          directFailureStage,
          draftId: uploadDraft?.draftId,
          event: 'upload_path_decided',
          localSessionId: nextSession.id,
          path: uploadPath,
          storagePath: directUploadedTarget?.storagePath ?? storedMoment.storagePath,
          uploadId: directUploadedTarget?.uploadId ?? uploadDraft?.uploadId,
        });

        console.info('[upload_timing]', {
          directStoragePath: directUploadedTarget?.storagePath,
          directUploadId: directUploadedTarget?.uploadId,
          elapsedMs: Date.now() - uploadStartedAt,
          event: 'upload_success',
          fallbackReason: directFailureReason,
          localSessionId: nextSession.id,
          momentId: storedMoment.momentId,
          nextMomentStatus,
          uploadPath,
          usedFallback: usedUploadFallback,
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
        } else if (isUploadPolicyFailure(error)) {
          const policyCopy = getUploadPolicyFailureCopy(error);
          await showUploadFailureAlertIfActive({
            localSessionId: nextSession.id,
            message: policyCopy.message,
            reason: errorMessage,
            shouldSuppressAlert: shouldSuppressUploadFailureAlert,
            stage: usedUploadFallback ? 'fallback_upload' : 'upload_policy',
            title: policyCopy.title,
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
    resetUploadFlow,
    uploadDraft,
    uploadProgress,
  };
}

function ensureAnalysisPushRegistrationForUpload() {
  if (!ENABLE_ANALYSIS_PUSH_NOTIFICATIONS) {
    return;
  }

  import('../../services/notifications/registerAnalysisPushNotifications')
    .then(({ registerForAnalysisPushNotifications }) =>
      registerForAnalysisPushNotifications({ source: 'upload_start' }),
    )
    .then((result) => {
      console.info('[push_registration]', {
        event: 'analysis_push_registration_upload_ensure_result',
        reason: result.reason,
        registered: result.registered,
        source: 'upload_start',
        status: result.status,
      });
    })
    .catch((error) => {
      console.warn(
        'Upload-start push notification registration failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    });
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
    if (isUploadTargetRateLimitFailure(error) || isUploadPolicyFailure(error)) {
      console.info('[upload_timing]', {
        draftId: draft.draftId,
        event: isUploadTargetRateLimitFailure(error)
          ? 'upload_target_rate_limited'
          : 'upload_policy_rejected',
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

function isUploadPolicyFailure(error: unknown) {
  return (
    error instanceof RemoteRequestError &&
    (error.code === 'too_large' ||
      error.code === 'too_long' ||
      error.code === 'unsupported_type' ||
      error.code === 'empty_file' ||
      error.code === 'invalid_duration')
  );
}

function getUploadPolicyFailureCopy(error: unknown) {
  const code = error instanceof RemoteRequestError ? error.code : undefined;

  switch (code) {
    case 'too_large':
      return {
        message: `현재 업로드는 ${MAX_UPLOAD_VIDEO_MB}MB 이하 클립만 지원합니다. 더 짧거나 작은 영상을 선택해주세요.`,
        title: '영상 용량이 너무 큽니다',
      };
    case 'too_long':
      return {
        message: `현재 업로드는 ${MAX_UPLOAD_VIDEO_DURATION_SECONDS}초 이하 클립만 지원합니다. 더 짧은 클립을 선택해주세요.`,
        title: '영상이 너무 깁니다',
      };
    case 'unsupported_type':
      return {
        message:
          '현재는 MP4 또는 MOV 계열 영상만 업로드할 수 있습니다. 다른 영상 파일을 선택해주세요.',
        title: '지원하지 않는 영상 형식입니다',
      };
    case 'empty_file':
      return {
        message:
          '선택한 영상 파일 크기를 확인할 수 없습니다. 영상을 다시 선택해주세요.',
        title: '영상 파일을 확인할 수 없습니다',
      };
    case 'invalid_duration':
      return {
        message:
          '선택한 영상 길이를 확인할 수 없습니다. 영상을 다시 선택해주세요.',
        title: '영상 길이를 확인할 수 없습니다',
      };
    default:
      return {
        message:
          '선택한 영상이 현재 업로드 기준에 맞지 않습니다. 다른 영상을 선택해주세요.',
        title: '영상을 업로드할 수 없습니다',
      };
  }
}

function getUploadPolicyAlertForVideo({
  duration,
  fileSize,
  mimeType,
  uri,
}: {
  duration?: number | null;
  fileSize?: number | null;
  mimeType?: string | null;
  uri?: string | null;
}) {
  if (!uri) {
    return {
      message: '선택한 영상 파일 경로를 확인할 수 없습니다. 영상을 다시 선택해주세요.',
      title: '영상 파일을 확인할 수 없습니다',
    };
  }

  if (!mimeType || !ALLOWED_UPLOAD_VIDEO_MIME_TYPES.has(mimeType)) {
    return getUploadPolicyFailureCopy(
      new RemoteRequestError('unsupported video type', 400, {
        code: 'unsupported_type',
      }),
    );
  }

  if (
    typeof fileSize !== 'number' ||
    !Number.isFinite(fileSize) ||
    fileSize <= 0
  ) {
    return getUploadPolicyFailureCopy(
      new RemoteRequestError('empty file', 400, { code: 'empty_file' }),
    );
  }

  if (fileSize > MAX_UPLOAD_VIDEO_BYTES) {
    return getUploadPolicyFailureCopy(
      new RemoteRequestError('video too large', 413, { code: 'too_large' }),
    );
  }

  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return getUploadPolicyFailureCopy(
      new RemoteRequestError('invalid duration', 400, {
        code: 'invalid_duration',
      }),
    );
  }

  if (duration > MAX_UPLOAD_VIDEO_DURATION_MS) {
    return getUploadPolicyFailureCopy(
      new RemoteRequestError('video too long', 400, { code: 'too_long' }),
    );
  }

  return null;
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

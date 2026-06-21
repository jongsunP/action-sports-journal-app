import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  type SessionVideoAsset,
} from '../../services/ai';
import {
  createMomentFromSourceVideo,
  hasConfiguredSupabaseMoments,
} from '../../services/moments';
import {
  createSessionVideoThumbnail,
  hasConfiguredVideoThumbnailEndpoint,
} from '../../services/video/createSessionVideoThumbnail';

import type { Session } from '../../types';
import type { AppTabId } from './sessionComponents';
import {
  finalizeUploadedDraftSource,
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
  setActiveTab: (tabId: AppTabId) => void;
  setRemoteMomentIdForSession: (
    sessionId: string,
    remoteMomentId: string,
  ) => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setThumbnailForSession: (sessionId: string, thumbnailUri: string) => void;
  setVideoForSession: (sessionId: string, video: SessionVideoAsset) => void;
  updateLocalMomentStatus: (
    sessionId: string,
    momentStatus: Session['momentStatus'],
  ) => void;
};

export function useUploadMoment({
  activityGroupId,
  extractEvidence,
  setActiveTab,
  setRemoteMomentIdForSession,
  setSessions,
  setThumbnailForSession,
  setVideoForSession,
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
      const imageUri = await createSessionVideoThumbnail(video);

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

    setVideoForSession(nextSession.id, videoForUpload);
    const preparedThumbnailUri =
      selectedVideoThumbnailUriRef.current ?? selectedVideoThumbnailUri;

    if (preparedThumbnailUri) {
      setThumbnailForSession(nextSession.id, preparedThumbnailUri);
    } else {
      createThumbnailForSession(nextSession.id, videoForUpload);
    }
    setActiveTab('video');
    void (async () => {
      let uploadStartedAt: number | undefined;
      let usedUploadFallback = false;

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

        let storedMoment = await createMomentFromDirectUpload({
          draft: uploadDraft,
          onProgress: setUploadProgressStage,
          session: nextSession,
        });

        if (!storedMoment) {
          usedUploadFallback = true;
          setUploadProgressStage('fallback_upload');
          storedMoment = await withUploadTimeout(
            createMomentFromSourceVideo(nextSession, videoForUpload),
            MULTIPART_FALLBACK_UPLOAD_TIMEOUT_MS,
            'Multipart fallback upload timed out.',
          );
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
          setUploadDraftStatus('upload_failed');
          Alert.alert(
            '영상 업로드에 실패했습니다',
            '분석을 시작하려면 원본 영상을 서버에 먼저 업로드해야 합니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
          );
          return;
        }

        setRemoteMomentIdForSession(nextSession.id, storedMoment.momentId);
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
        setUploadDraft(null);
        setSelectedVideo(null);
        selectedVideoThumbnailUriRef.current = null;
        setSelectedVideoThumbnailUri(null);
        setIsComposerOpen(false);
        setUploadProgress(null);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'unknown';
        console.info('[upload_timing]', {
          elapsedMs:
            typeof uploadStartedAt === 'number'
              ? Date.now() - uploadStartedAt
              : undefined,
          event: 'upload_failure',
          localSessionId: nextSession.id,
          reason: errorMessage,
        });
        setSessions((current) =>
          current.filter((session) => session.id !== nextSession.id),
        );
        setUploadDraftStatus('upload_failed');
        console.warn(
          'Stored Moment source upload failed:',
          errorMessage,
        );
        if (isLocalVideoAccessFailure(errorMessage)) {
          Alert.alert(
            '영상 파일을 다시 선택해 주세요',
            '선택한 영상 파일에 다시 접근하지 못했습니다. 영상을 다시 선택한 뒤 업로드해주세요.',
          );
        } else {
          Alert.alert(
            '영상 업로드에 실패했습니다',
            '업로드가 완료되지 않아 분석을 시작하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
          );
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
  onProgress,
  session,
}: {
  draft: UploadDraft | null;
  onProgress: (stage: UploadProgressStage, percent?: number) => void;
  session: Session;
}) {
  if (!draft) {
    return undefined;
  }

  try {
    const uploadTarget = await uploadDraftSourceVideoDirectly(draft, {
      onProgress,
    });

    if (!uploadTarget) {
      console.info('[upload_timing]', {
        draftId: draft.draftId,
        event: 'direct_upload_skipped',
        localSessionId: session.id,
        reason: 'no_upload_target',
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
    };

    return await finalizeUploadedDraftSource(uploadedDraft, session, {
      onProgress,
    });
  } catch (error) {
    console.info('[upload_timing]', {
      draftId: draft.draftId,
      event: 'direct_upload_failure',
      localSessionId: session.id,
      reason: error instanceof Error ? error.message : 'unknown',
      videoUriScheme: draft.localVideoUri.split(':', 1)[0],
    });
    console.warn(
      'Direct upload finalize path failed; falling back to multipart upload:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return undefined;
  }
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

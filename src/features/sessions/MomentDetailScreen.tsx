import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getMomentStatus } from './momentStatus';
import { MomentDetailContent } from './MomentDetailContent';
import {
  getUserFacingDetailVideo,
  getVideoAssetFromSession,
} from './sessionFormatters';
import { useMomentDetailRuntimeState } from './momentDetailRuntimeStore';
import {
  getMomentDetail,
  type MomentDetailFetchDiagnostics,
} from '../../services/moments';

import type { RootStackParamList } from '../../navigation/types';
import type { GeminiEvidenceResult } from '../../types';

type MomentDetailScreenProps = NativeStackScreenProps<
  RootStackParamList,
  'MomentDetail'
>;

export function MomentDetailScreen({
  navigation,
  route,
}: MomentDetailScreenProps) {
  const runtimeState = useMomentDetailRuntimeState();
  const { sessionId } = route.params;
  const session = useMemo(
    () => runtimeState.sessions.find((item) => item.id === sessionId),
    [runtimeState.sessions, sessionId],
  );
  const remoteMomentId = runtimeState.remoteMomentIdsBySessionId[sessionId];
  const [detailEvidence, setDetailEvidence] = useState<
    GeminiEvidenceResult | undefined
  >();
  const [detailDiagnostics, setDetailDiagnostics] =
    useState<MomentDetailFetchDiagnostics | null>(null);

  useEffect(() => {
    if (runtimeState.isReady && !session && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, runtimeState.isReady, session]);

  useEffect(() => {
    let isActive = true;

    setDetailEvidence(undefined);
    setDetailDiagnostics(null);

    if (!remoteMomentId) {
      return () => {
        isActive = false;
      };
    }

    getMomentDetail(remoteMomentId)
      .then((result) => {
        if (!isActive) {
          return;
        }

        setDetailDiagnostics(result.diagnostics);

        if (result.moment?.evidence) {
          setDetailEvidence({
            ...result.moment.evidence,
            sessionId,
          });
        }
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Moment detail load failed.';
        console.warn('[moment_detail_load_failed]', {
          message,
          momentId: remoteMomentId,
        });
      });

    return () => {
      isActive = false;
    };
  }, [remoteMomentId, sessionId]);

  if (!runtimeState.isReady) {
    return (
      <SafeAreaView style={runtimeState.styles.detailModalContainer}>
        <View style={runtimeState.styles.bootLoadingContent}>
          <Text style={runtimeState.styles.bootLoadingTitle}>
            기록을 불러오는 중입니다
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return null;
  }

  const evidence =
    detailEvidence ?? runtimeState.geminiEvidenceBySessionId[session.id];
  const availableVideo =
    runtimeState.videosBySessionId[session.id] ?? getVideoAssetFromSession(session);
  const momentStatus = getMomentStatus({
    evidence,
    isProcessing: Boolean(runtimeState.extractingEvidenceBySessionId[session.id]),
    sessionStatus: session.momentStatus,
  });
  const thumbnailUri = runtimeState.thumbnailsBySessionId[session.id];
  const video = getUserFacingDetailVideo({
    momentStatus,
    thumbnailUri,
    video: availableVideo,
  });

  return (
    <MomentDetailContent
      canRequestGeminiEvidence={runtimeState.canRequestGeminiEvidence}
      debugEndpoint={runtimeState.debugEndpoint}
      detailDiagnostics={detailDiagnostics}
      evidence={evidence}
      isDeleting={Boolean(runtimeState.deletingSessionIds[session.id])}
      isLoading={Boolean(runtimeState.extractingEvidenceBySessionId[session.id])}
      momentStatus={momentStatus}
      onClose={() => navigation.goBack()}
      onDelete={() => runtimeState.handleDeleteSession(session)}
      onRetry={() =>
        runtimeState.handleExtractEvidence(session, { openSheet: true })
      }
      session={session}
      styles={runtimeState.styles}
      thumbnailUri={thumbnailUri}
      video={video}
    />
  );
}

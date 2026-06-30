import { useEffect, useMemo } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { getMomentStatus } from './momentStatus';
import { MomentDetailContent } from './MomentDetailContent';
import {
  getUserFacingDetailVideo,
  getVideoAssetFromSession,
} from './sessionFormatters';
import { useMomentDetailRuntimeState } from './momentDetailRuntimeStore';

import type { RootStackParamList } from '../../navigation/types';

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

  useEffect(() => {
    if (runtimeState.isReady && !session && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [navigation, runtimeState.isReady, session]);

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

  const evidence = runtimeState.geminiEvidenceBySessionId[session.id];
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

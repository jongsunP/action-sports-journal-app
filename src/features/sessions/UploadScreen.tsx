import { useEffect } from 'react';
import { SafeAreaView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UploadContent } from './UploadContent';
import { useUploadRuntimeState } from './uploadRuntimeStore';

import type { RootStackParamList } from '../../navigation/types';

type UploadScreenProps = NativeStackScreenProps<RootStackParamList, 'Upload'>;

export function UploadScreen({ navigation }: UploadScreenProps) {
  const runtimeState = useUploadRuntimeState();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!runtimeState.isReady) {
        return;
      }

      if (runtimeState.isSubmitting) {
        event.preventDefault();
        return;
      }

      if (runtimeState.isOpen) {
        runtimeState.onClose();
      }
    });

    return unsubscribe;
  }, [
    navigation,
    runtimeState.isOpen,
    runtimeState.isReady,
    runtimeState.isSubmitting,
    runtimeState.onClose,
  ]);

  useEffect(() => {
    if (
      runtimeState.isReady &&
      !runtimeState.isOpen &&
      navigation.canGoBack()
    ) {
      navigation.goBack();
    }
  }, [navigation, runtimeState.isOpen, runtimeState.isReady]);

  if (!runtimeState.isReady) {
    return (
      <SafeAreaView style={runtimeState.styles.uploadSheetBackdrop}>
        <View style={runtimeState.styles.bootLoadingContent}>
          <Text style={runtimeState.styles.bootLoadingTitle}>
            업로드 화면을 준비하고 있습니다
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <UploadContent
      canUploadSession={runtimeState.canUploadSession}
      formatVideoMeta={runtimeState.formatVideoMeta}
      isPreparingThumbnail={runtimeState.isPreparingThumbnail}
      isSubmitting={runtimeState.isSubmitting}
      onClose={runtimeState.onClose}
      onPickVideo={runtimeState.onPickVideo}
      onSubmit={runtimeState.onSubmit}
      selectedVideo={runtimeState.selectedVideo}
      styles={runtimeState.styles}
      uploadDraft={runtimeState.uploadDraft}
      uploadProgress={runtimeState.uploadProgress}
    />
  );
}

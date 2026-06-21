import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { deleteMoment } from '../../services/moments';

import type { Session } from '../../types';

type UseDeleteMomentParams = {
  remoteMomentIdsBySessionId: Record<string, string>;
  removeSessionLocally: (sessionId: string) => void;
};

export function useDeleteMoment({
  remoteMomentIdsBySessionId,
  removeSessionLocally,
}: UseDeleteMomentParams) {
  const [deletingSessionIds, setDeletingSessionIds] = useState<
    Record<string, boolean>
  >({});

  const handleDeleteSession = useCallback(
    (session: Session) => {
      if (deletingSessionIds[session.id]) {
        return;
      }

      Alert.alert('영상을 삭제할까요?', '이 영상과 연결된 리뷰 결과가 함께 삭제됩니다.', [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            const remoteMomentId = remoteMomentIdsBySessionId[session.id];

            setDeletingSessionIds((current) => ({
              ...current,
              [session.id]: true,
            }));

            if (!remoteMomentId) {
              removeSessionLocally(session.id);
              setDeletingSessionIds((current) => {
                const next = { ...current };
                delete next[session.id];
                return next;
              });
              return;
            }

            deleteMoment(remoteMomentId)
              .then(() => {
                removeSessionLocally(session.id);
              })
              .catch((error) => {
                console.warn(
                  'Remote moment delete failed:',
                  error instanceof Error ? error.message : 'Unknown error',
                );
                Alert.alert(
                  '삭제에 실패했습니다',
                  '서버 기록을 삭제하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
                );
              })
              .finally(() => {
                setDeletingSessionIds((current) => {
                  const next = { ...current };
                  delete next[session.id];
                  return next;
                });
              });
          },
        },
      ]);
    },
    [deletingSessionIds, remoteMomentIdsBySessionId, removeSessionLocally],
  );

  return {
    deletingSessionIds,
    handleDeleteSession,
  };
}

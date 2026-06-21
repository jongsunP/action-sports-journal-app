import { Modal } from 'react-native';

import {
  MomentDetailContent,
  type MomentDetailContentProps,
} from './MomentDetailContent';

export function MomentDetailModal(props: MomentDetailContentProps) {
  const { onClose, session } = props;

  if (!session) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      visible={Boolean(session)}
    >
      <MomentDetailContent {...props} />
    </Modal>
  );
}

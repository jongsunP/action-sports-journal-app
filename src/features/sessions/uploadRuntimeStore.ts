import { useSyncExternalStore } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { UploadDraft } from './uploadDraftStorage';

type HomeScreenStyles = Record<string, any>;

export type UploadRuntimeState = {
  canUploadSession: boolean;
  formatVideoMeta: (video: SessionVideoAsset) => string;
  isOpen: boolean;
  isPreparingThumbnail: boolean;
  isReady: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onPickVideo: () => void;
  onSubmit: () => void;
  selectedVideo: SessionVideoAsset | null;
  styles: HomeScreenStyles;
  uploadDraft: UploadDraft | null;
};

const emptyStyles: HomeScreenStyles = {};

let currentState: UploadRuntimeState = {
  canUploadSession: false,
  formatVideoMeta: () => '',
  isOpen: false,
  isPreparingThumbnail: false,
  isReady: false,
  isSubmitting: false,
  onClose: () => {},
  onPickVideo: () => {},
  onSubmit: () => {},
  selectedVideo: null,
  styles: emptyStyles,
  uploadDraft: null,
};

const listeners = new Set<() => void>();

export function setUploadRuntimeState(nextState: UploadRuntimeState) {
  currentState = nextState;
  listeners.forEach((listener) => listener());
}

export function useUploadRuntimeState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentState;
}

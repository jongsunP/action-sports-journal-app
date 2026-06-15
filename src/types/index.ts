export type ID = string;
export type ISODateString = string;

export type ActivityGroup = {
  id: ID;
  name: string;
  description?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type MomentStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type Session = {
  id: ID;
  activityGroupId: ID;
  title: string;
  notes?: string;
  occurredAt: ISODateString;
  videoUri?: string;
  momentStatus?: MomentStatus;
  analysisResultId?: ID;
  shareResultIds: ID[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type AnalysisStatus = 'idle' | 'running' | 'completed' | 'failed';

export type HighlightScene = {
  id: ID;
  timestampLabel: string;
  title: string;
  description: string;
  imageUri?: string;
};

export type AnalysisConfidence = {
  level: 'high' | 'medium' | 'low';
  reason?: string;
};

export type CoachingObservation = {
  label: string;
  detail: string;
  confidence?: AnalysisConfidence['level'];
};

export type AnalysisSelfCritique = {
  limitations?: string[];
  whatWouldImproveAnalysis?: string[];
};

export type EvidenceConfidence = 'high' | 'medium' | 'low';

export type EvidenceFact = {
  value: string;
  confidence: EvidenceConfidence;
  evidence: string;
};

export type ObservedBoolean = true | false | 'unknown';

export type InversionObservedFacts = {
  bodyInverted: ObservedBoolean;
  boardAboveHead: ObservedBoolean;
  rollAxisObserved: ObservedBoolean;
  flipAxisObserved: ObservedBoolean;
  inversionDuration: {
    seconds: number | null;
    confidence: EvidenceConfidence;
    evidence: string;
  };
  inversionEvidenceCount: number;
  antiInversionEvidence: string[];
};

export type EvidenceTemporalWindows = {
  takeoffTimestamp: {
    timestampSeconds: number | null;
    confidence: EvidenceConfidence;
    evidence: string;
  };
  finalApproachWindow: {
    startSeconds: number;
    endSeconds: number;
    confidence: EvidenceConfidence;
    reasonWindowWasChosen: string;
  };
  ignoredSetupWindows: Array<{
    startSeconds: number;
    endSeconds: number;
    reason: string;
  }>;
  approachWindowConfidence: EvidenceConfidence;
};

export type ApproachObservedFacts = {
  stance: EvidenceFact;
  leadFoot: EvidenceFact;
  boardDirection: EvidenceFact;
  wakeCrossingPath: {
    startPosition: string;
    takeoffPosition: string;
    landingPosition: string;
    direction: string;
    confidence: EvidenceConfidence;
    evidence: string;
  };
  edgeDirectionEvidence: EvidenceFact;
  handlePosition: EvidenceFact;
  bodyOrientation: EvidenceFact;
};

export type ApproachDecision = {
  value: 'heelside' | 'toeside' | 'switch' | 'unknown';
  confidence: EvidenceConfidence;
  derivedFrom: string[];
  reasoning: string[];
  rejectedAlternatives: Array<{
    value: 'heelside' | 'toeside' | 'switch';
    reason: string;
  }>;
  uncertainty: string[];
};

export type AttemptedTrickEvidence = {
  name: string;
  confidence: EvidenceConfidence;
  evidence: string;
};

export type TrickCandidateEvidence = {
  name: string;
  confidence: EvidenceConfidence;
  evidence?: string;
};

export type EvidenceWindow = {
  startSeconds: number;
  endSeconds: number;
  label: string;
  evidence: string;
  confidence: EvidenceConfidence;
};

export type MotionObservation = {
  timestampLabel: string;
  label: string;
  detail: string;
  confidence: EvidenceConfidence;
};

export type GeminiEvidenceResult = {
  id: ID;
  sessionId: ID;
  status: AnalysisStatus;
  provider: 'gemini';
  model?: string;
  qualityMode?: 'standard' | 'degraded';
  recoveredFromPartial?: boolean;
  requiresUserConfirmation?: boolean;
  consistencyStatus?: 'valid' | 'inconsistent' | 'needs_review';
  consistencyWarnings?: string[];
  rawFamilyCandidate?: string;
  safeFamilyCandidate?: string;
  taxonomyWarnings?: string[];
  gateFailures?: string[];
  rawResponseText?: string;
  primaryCandidate: TrickCandidateEvidence;
  alternativeCandidates: TrickCandidateEvidence[];
  family: EvidenceFact;
  temporalWindows?: EvidenceTemporalWindows;
  rawApproachType?: EvidenceFact;
  approachObservedFacts?: ApproachObservedFacts;
  inversionObservedFacts?: InversionObservedFacts;
  approachDecision?: ApproachDecision;
  approachWarnings?: string[];
  approachType: EvidenceFact;
  rotationType: EvidenceFact;
  landingOutcome: EvidenceFact;
  confidence: EvidenceConfidence;
  evidence: string;
  evidenceWindows: EvidenceWindow[];
  observations: MotionObservation[];
  uncertainty: {
    level: EvidenceConfidence;
    reasons: string[];
  };
  createdAt: ISODateString;
};

export type AnalysisResult = {
  id: ID;
  sessionId: ID;
  status: AnalysisStatus;
  summary: string;
  rawResponseText?: string;
  humanReadableAnalysis?: string;
  detectedTrick?: string;
  confidence?: AnalysisConfidence;
  highlights: string[];
  highlightScenes?: HighlightScene[];
  strengths?: string[];
  improvements?: string[];
  coachingObservations?: CoachingObservation[];
  observations?: CoachingObservation[];
  patternRecognition?: CoachingObservation[];
  inferences?: CoachingObservation[];
  selfCritique?: AnalysisSelfCritique;
  suggestions: string[];
  createdAt: ISODateString;
};

export type ShareResult = {
  id: ID;
  sessionId: ID;
  kind: 'growth-card' | 'highlight-card';
  title: string;
  imageUri?: string;
  createdAt: ISODateString;
};

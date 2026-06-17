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

export type PopObservedFacts = {
  popType: string | null;
  timing: string | null;
  intensity: string | null;
  evidenceText: string | null;
  confidence: EvidenceConfidence;
  antiEvidence: string[];
};

export type PopValidationResult = {
  before: PopObservedFacts;
  after: PopObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentPhysicalEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

export type RotationObservedFacts = {
  rotationAxis: string | null;
  rotationDirection: string | null;
  inversionDetected: ObservedBoolean;
  spinDegrees: string | null;
  handlePassObserved: ObservedBoolean;
  evidenceText: string | null;
  confidence: EvidenceConfidence;
  antiEvidence: string[];
};

export type RotationValidationResult = {
  before: RotationObservedFacts;
  after: RotationObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentRotationEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

export type GrabObservedFacts = {
  grabDetected: ObservedBoolean;
  contactVisible: ObservedBoolean;
  grabbingHand: string | null;
  grabbedBoardZone: string | null;
  grabTiming: string | null;
  grabDuration: string | null;
  evidenceText: string | null;
  confidence: EvidenceConfidence;
  antiEvidence: string[];
};

export type GrabValidationResult = {
  before: GrabObservedFacts;
  after: GrabObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentGrabEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
};

export type LandingObservedFacts = {
  landingVisible: ObservedBoolean;
  landingOutcome: string | null;
  boardContact: string | null;
  edgeOnLanding: string | null;
  handlePosition: string | null;
  balanceRecovery: string | null;
  evidenceText: string | null;
  confidence: EvidenceConfidence;
  antiEvidence: string[];
};

export type LandingValidationResult = {
  before: LandingObservedFacts;
  after: LandingObservedFacts;
  adjusted: boolean;
  needsReview: boolean;
  independentLandingEvidenceCount: number;
  rulesApplied: string[];
  rejectedHighConfidenceReasons: string[];
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

export type ApproachSide = 'heelside' | 'toeside' | 'switch' | 'unknown' | 'ambiguous';

export type DirectionFrame = 'boat' | 'camera' | 'rider' | 'unknown';

export type ApproachEvidenceSignal = {
  field: string;
  supports: Exclude<ApproachSide, 'ambiguous'>;
  strength: 'primary' | 'supporting' | 'weak';
  confidence: EvidenceConfidence;
  evidence: string;
  timestampSeconds?: number | null;
};

export type ApproachObservedFactsV2 = {
  stance: EvidenceFact;
  leadFoot: EvidenceFact;
  boardDirection: EvidenceFact & {
    frameOfReference: DirectionFrame;
    noseDirection?: string;
    travelDirection?: string;
  };
  wakeCrossingPath: ApproachObservedFacts['wakeCrossingPath'] & {
    frameOfReference: DirectionFrame;
  };
  edgeDirectionEvidence: EvidenceFact & {
    loadedEdge: 'toe_edge' | 'heel_edge' | 'unknown';
  };
  handlePosition: EvidenceFact;
  bodyOrientation: EvidenceFact;
  signals: ApproachEvidenceSignal[];
  conflictSummary: {
    hasConflict: boolean;
    toesideSignals: number;
    heelsideSignals: number;
    switchSignals: number;
    conflictFields: string[];
    reason: string;
  };
};

export type ApproachDecisionV2 = {
  value: ApproachSide;
  confidence: EvidenceConfidence;
  primaryEvidence: string[];
  supportingEvidence: string[];
  conflictingEvidence: string[];
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
  approachObservedFactsV2?: ApproachObservedFactsV2;
  popObservedFacts?: PopObservedFacts;
  popValidation?: PopValidationResult;
  rotationObservedFacts?: RotationObservedFacts;
  rotationValidation?: RotationValidationResult;
  grabObservedFacts?: GrabObservedFacts;
  grabValidation?: GrabValidationResult;
  landingObservedFacts?: LandingObservedFacts;
  landingValidation?: LandingValidationResult;
  inversionObservedFacts?: InversionObservedFacts;
  approachDecision?: ApproachDecision;
  approachDecisionV2?: ApproachDecisionV2;
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

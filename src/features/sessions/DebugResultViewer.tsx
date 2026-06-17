import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  EdgeLoadValidationResult,
  GeminiEvidenceResult,
  GrabValidationResult,
  LandingValidationResult,
  PopValidationResult,
  RotationValidationResult,
} from '../../types';
import {
  compactDebugRows,
  formatConfidence,
  formatDebugList,
  formatDebugValue,
  stringifyDebugJson,
  type DebugRow,
} from './debugResultFormatting';

type ValidationResult =
  | EdgeLoadValidationResult
  | PopValidationResult
  | RotationValidationResult
  | GrabValidationResult
  | LandingValidationResult;

export function DebugResultViewer({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setIsExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.headerButton,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <View>
          <Text style={styles.eyebrow}>Internal Debug</Text>
          <Text style={styles.title}>ObservedFacts / Knowledge pipeline</Text>
        </View>
        <Text style={styles.toggle}>{isExpanded ? 'Hide' : 'Show'}</Text>
      </Pressable>

      {isExpanded ? (
        <View style={styles.body}>
          <DebugSection title="Result Header">
            <DebugRows
              rows={compactDebugRows([
                ['id', evidence.id],
                ['sessionId', evidence.sessionId],
                ['status', evidence.status],
                ['provider', evidence.provider],
                ['model', evidence.model],
                ['qualityMode', evidence.qualityMode],
                ['createdAt', evidence.createdAt],
                ['requiresUserConfirmation', evidence.requiresUserConfirmation],
                ['recoveredFromPartial', evidence.recoveredFromPartial],
                ['consistencyStatus', evidence.consistencyStatus],
              ])}
            />
          </DebugSection>

          <DebugSection title="Top-Level Classification">
            <DebugRows
              rows={compactDebugRows([
                ['primaryCandidate', evidence.primaryCandidate.name],
                ['primaryConfidence', evidence.primaryCandidate.confidence],
                ['family', evidence.family.value],
                ['approach', evidence.approachType.value],
                ['rotation', evidence.rotationType.value],
                ['landing', evidence.landingOutcome.value],
                ['confidence', evidence.confidence],
                ['rawFamilyCandidate', evidence.rawFamilyCandidate],
                ['safeFamilyCandidate', evidence.safeFamilyCandidate],
                ['taxonomyWarnings', formatDebugList(evidence.taxonomyWarnings)],
                ['gateFailures', formatDebugList(evidence.gateFailures)],
                [
                  'consistencyWarnings',
                  formatDebugList(evidence.consistencyWarnings),
                ],
              ])}
            />
          </DebugSection>

          <TemporalWindowsSection evidence={evidence} />
          <ObservedFactsSection evidence={evidence} />
          <ValidationSummary evidence={evidence} />
          <KnowledgeInsightsSection evidence={evidence} />
          <CoachingInsightContextSection evidence={evidence} />
          <RawJsonSection evidence={evidence} />
        </View>
      ) : null}
    </View>
  );
}

function TemporalWindowsSection({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const windows = evidence.temporalWindows;

  if (!windows && evidence.evidenceWindows.length === 0) {
    return null;
  }

  return (
    <DebugSection title="Temporal Windows">
      {windows ? (
        <DebugRows
          rows={compactDebugRows([
            [
              'takeoffTimestamp',
              windows.takeoffTimestamp.timestampSeconds === null
                ? 'unknown'
                : `${windows.takeoffTimestamp.timestampSeconds}s`,
            ],
            ['takeoffConfidence', windows.takeoffTimestamp.confidence],
            [
              'finalApproachWindow',
              `${windows.finalApproachWindow.startSeconds}s-${windows.finalApproachWindow.endSeconds}s`,
            ],
            ['finalApproachConfidence', windows.finalApproachWindow.confidence],
            ['approachWindowConfidence', windows.approachWindowConfidence],
            [
              'ignoredSetupWindows',
              windows.ignoredSetupWindows
                .map((window) => `${window.startSeconds}s-${window.endSeconds}s`)
                .join(', ') || 'none',
            ],
          ])}
        />
      ) : null}
      {evidence.evidenceWindows.length > 0 ? (
        <View style={styles.subBlock}>
          <Text style={styles.subTitle}>evidenceWindows</Text>
          {evidence.evidenceWindows.map((window) => (
            <Text
              key={`${window.startSeconds}-${window.endSeconds}-${window.label}`}
              style={styles.monoText}
            >
              {window.startSeconds.toFixed(1)}s-{window.endSeconds.toFixed(1)}s ·{' '}
              {window.label} · {window.confidence}
            </Text>
          ))}
        </View>
      ) : null}
    </DebugSection>
  );
}

function ObservedFactsSection({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  return (
    <DebugSection title="ObservedFacts">
      {evidence.approachObservedFactsV2 ? (
        <JsonBlock
          title="ApproachObservedFactsV2"
          value={evidence.approachObservedFactsV2}
        />
      ) : evidence.approachObservedFacts ? (
        <JsonBlock
          title="ApproachObservedFacts"
          value={evidence.approachObservedFacts}
        />
      ) : (
        <EmptyLine label="Approach" />
      )}
      <JsonBlock title="EdgeLoadObservedFacts" value={evidence.edgeLoadObservedFacts} />
      <JsonBlock title="PopObservedFacts" value={evidence.popObservedFacts} />
      <JsonBlock
        title="RotationObservedFacts"
        value={evidence.rotationObservedFacts}
      />
      <JsonBlock title="LandingObservedFacts" value={evidence.landingObservedFacts} />
      <JsonBlock title="GrabObservedFacts" value={evidence.grabObservedFacts} />
      <JsonBlock
        title="InversionObservedFacts"
        value={evidence.inversionObservedFacts}
      />
    </DebugSection>
  );
}

function ValidationSummary({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const validations: Array<[string, ValidationResult | undefined]> = [
    ['edgeLoadValidation', evidence.edgeLoadValidation],
    ['popValidation', evidence.popValidation],
    ['rotationValidation', evidence.rotationValidation],
    ['landingValidation', evidence.landingValidation],
    ['grabValidation', evidence.grabValidation],
  ];

  return (
    <DebugSection title="Validation Summary">
      {validations.map(([label, validation]) => (
        <ValidationCard key={label} label={label} validation={validation} />
      ))}
    </DebugSection>
  );
}

function ValidationCard({
  label,
  validation,
}: {
  label: string;
  validation?: ValidationResult;
}) {
  if (!validation) {
    return <EmptyLine label={label} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{label}</Text>
      <DebugRows
        rows={compactDebugRows([
          ['adjusted', validation.adjusted],
          ['needsReview', validation.needsReview],
          ['rulesApplied', formatDebugList(validation.rulesApplied)],
          [
            'rejectedHighConfidenceReasons',
            formatDebugList(validation.rejectedHighConfidenceReasons),
          ],
        ])}
      />
    </View>
  );
}

function KnowledgeInsightsSection({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const insights = evidence.knowledgeInsights ?? [];

  return (
    <DebugSection title="KnowledgeInsights">
      {insights.length === 0 ? (
        <EmptyLine label="knowledgeInsights" />
      ) : (
        insights.map((insight) => (
          <View key={insight.id} style={styles.card}>
            <Text style={styles.cardTitle}>{insight.ruleId}</Text>
            <DebugRows
              rows={compactDebugRows([
                ['category', insight.category],
                ['confidence', formatConfidence(insight.confidence)],
                ['severity', insight.severity],
                ['requiresReview', insight.requiresReview],
                ['coachingSafe', insight.coachingSafe],
                ['sourceFacts', formatDebugList(insight.sourceFacts)],
                ['message', insight.message],
              ])}
            />
          </View>
        ))
      )}
    </DebugSection>
  );
}

function CoachingInsightContextSection({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const contexts = evidence.coachingInsightContext ?? [];

  return (
    <DebugSection title="CoachingInsightContext">
      {contexts.length === 0 ? (
        <EmptyLine label="coachingInsightContext" />
      ) : (
        contexts.map((context, index) => (
          <View key={`${context.sourceRuleId}-${index}`} style={styles.card}>
            <Text style={styles.cardTitle}>
              {context.mode}
              {context.mode === 'internal_only' ? ' · debug only' : ''}
            </Text>
            <DebugRows
              rows={compactDebugRows([
                ['sourceRuleId', context.sourceRuleId],
                ['category', context.category],
                ['confidence', formatConfidence(context.confidence)],
                ['severity', context.severity],
                ['requiresReview', context.requiresReview],
                ['coachingSafe', context.coachingSafe],
                ['message', context.message],
              ])}
            />
          </View>
        ))
      )}
    </DebugSection>
  );
}

function RawJsonSection({
  evidence,
}: {
  evidence: GeminiEvidenceResult;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DebugSection title="Raw JSON">
      <Pressable
        accessibilityRole="button"
        onPress={() => setIsOpen((current) => !current)}
        style={({ pressed }) => [
          styles.inlineButton,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <Text style={styles.inlineButtonText}>
          {isOpen ? 'Hide raw evidence JSON' : 'Show raw evidence JSON'}
        </Text>
      </Pressable>
      {isOpen ? (
        <Text selectable style={styles.rawText}>
          {stringifyDebugJson(evidence)}
        </Text>
      ) : null}
    </DebugSection>
  );
}

function DebugSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DebugRows({ rows }: { rows: DebugRow[] }) {
  return (
    <View style={styles.rows}>
      {rows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text selectable style={styles.rowValue}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!value) {
    return <EmptyLine label={title} />;
  }

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setIsOpen((current) => !current)}
        style={({ pressed }) => [
          styles.cardHeader,
          pressed ? styles.pressed : undefined,
        ]}
      >
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardToggle}>{isOpen ? 'Hide' : 'JSON'}</Text>
      </Pressable>
      {isOpen ? (
        <Text selectable style={styles.rawText}>
          {stringifyDebugJson(value)}
        </Text>
      ) : (
        <Text style={styles.monoText} numberOfLines={3}>
          {formatDebugValue(value)}
        </Text>
      )}
    </View>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <Text style={styles.emptyText}>
      {label}: not available
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: '#334155',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    overflow: 'hidden',
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  eyebrow: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  toggle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
  },
  body: {
    backgroundColor: '#020617',
    padding: 12,
  },
  section: {
    borderTopColor: '#1e293b',
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 8,
  },
  rows: {
    rowGap: 6,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  rowLabel: {
    color: '#94a3b8',
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    width: 132,
  },
  rowValue: {
    color: '#e2e8f0',
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  subBlock: {
    marginTop: 10,
  },
  subTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  card: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    padding: 10,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#e2e8f0',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  cardToggle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
  monoText: {
    color: '#cbd5e1',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 10,
    lineHeight: 15,
    marginTop: 6,
  },
  rawText: {
    color: '#cbd5e1',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: undefined,
    }),
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
  },
  inlineButton: {
    alignSelf: 'flex-start',
    borderColor: '#334155',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineButtonText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
  },
});

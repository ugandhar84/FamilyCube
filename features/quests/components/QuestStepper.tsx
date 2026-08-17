import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';

// ── Quest progress stepper ────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDuration(a: string, b: string) {
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface StepperProps {
  claimedAt?:   string | null;
  submittedAt?: string | null;
  approvedAt?:  string | null;
  declinedAt?:  string | null;
  declineReason?: string | null;
  reviewerName?: string | null;
  accentColor:  string;
  isDark:       boolean;
  colors:       ReturnType<typeof useTheme>['colors'];
}

export function QuestStepper({ claimedAt, submittedAt, approvedAt, declinedAt, declineReason, reviewerName, accentColor, isDark, colors, isAssigned }: StepperProps & { isAssigned?: boolean }) {
  if (!isAssigned && !claimedAt && !submittedAt && !approvedAt && !declinedAt) return null;

  const finalAt = approvedAt ?? declinedAt;
  const isDeclined = !!declinedAt && !approvedAt;

  type Step = { label: string; time?: string; color: string; done: boolean };

  // When quest is assigned but not yet claimed, show a leading "Assigned" pending step
  const assignedStep: Step | null = isAssigned ? {
    label: 'Assigned',
    time:  undefined,
    color: isDark ? '#334155' : '#CBD5E1',
    done:  false,
  } : null;

  const steps: Step[] = [
    ...(assignedStep ? [assignedStep] : []),
    {
      label: 'Claimed',
      time:  claimedAt  ? fmtTime(claimedAt)  : undefined,
      color: claimedAt  ? accentColor : (isDark ? '#334155' : '#CBD5E1'),
      done:  !!claimedAt,
    },
    {
      label: 'Submitted',
      time:  submittedAt ? fmtTime(submittedAt) : undefined,
      color: submittedAt ? '#818CF8' : (isDark ? '#334155' : '#CBD5E1'),
      done:  !!submittedAt,
    },
    {
      label: isDeclined ? 'Declined' : 'Approved',
      time:  finalAt ? fmtTime(finalAt) + (reviewerName ? ` · ${reviewerName}` : '') : undefined,
      color: isDeclined ? '#EF4444' : (finalAt ? '#10B981' : (isDark ? '#334155' : '#CBD5E1')),
      done:  !!finalAt,
    },
  ];

  // durations between consecutive done steps
  const dur01 = (claimedAt && submittedAt) ? fmtDuration(claimedAt, submittedAt) : null;
  const dur12 = (submittedAt && finalAt)   ? fmtDuration(submittedAt, finalAt)   : null;
  // If assignedStep is inserted at index 0, connectors shift by one position
  const durations = assignedStep ? [null, dur01, dur12] : [dur01, dur12];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, marginBottom: 4 }}>
      {steps.map((step, i) => (
        <React.Fragment key={step.label}>
          {/* Step node */}
          <View style={{ alignItems: 'center', minWidth: 64 }}>
            {/* Dot */}
            <View style={{
              width: 10, height: 10, borderRadius: 5,
              backgroundColor: step.done ? step.color : 'transparent',
              borderWidth: 1.5,
              borderColor: step.done ? step.color : (isDark ? '#334155' : '#CBD5E1'),
              marginBottom: 4,
            }} />
            {/* Label */}
            <Text style={{ fontSize: 9, fontWeight: '700', color: step.done ? step.color : (isDark ? '#475569' : '#94A3B8'), textAlign: 'center', letterSpacing: 0.3 }}>
              {step.label}
            </Text>
            {/* Time */}
            {step.time ? (
              <Text style={{ fontSize: 9, color: step.done ? step.color : (isDark ? '#475569' : '#94A3B8'), textAlign: 'center', opacity: 0.85 }}>
                {step.time}
              </Text>
            ) : null}
          </View>

          {/* Connector + duration */}
          {i < steps.length - 1 && (
            <View style={{ flex: 1, alignItems: 'center', paddingTop: 4 }}>
              <View style={{ height: 1.5, width: '100%', backgroundColor: durations[i] ? accentColor + '50' : (isDark ? '#1E293B' : '#E2E8F0') }} />
              {durations[i] && (
                <Text style={{ fontSize: 8, color: isDark ? '#64748B' : '#94A3B8', marginTop: 2, fontStyle: 'italic' }}>
                  {durations[i]}
                </Text>
              )}
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

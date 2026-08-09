import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TYPO } from '@/constants/theme';

const STEPS = [
  { id: 'upload',   label: 'Pages received',          sub: 'Images queued for analysis',             icon: 'cloud-upload-outline'     },
  { id: 'reading',  label: 'FurAI reading document',  sub: 'Scanning all pages simultaneously',       icon: 'eye-outline'              },
  { id: 'extract',  label: 'Extracting health data',  sub: 'Finding vaccines, meds and lab results',  icon: 'flask-outline'            },
  { id: 'done',     label: 'Ready to review',         sub: 'Tap items below to save to profile',      icon: 'checkmark-circle-outline' },
];

export const ProcessingSteps = React.memo(function ProcessingSteps({ accent, colors, createdAt }: { accent: string; colors: any; createdAt: string }) {
  // Simulate step progression based on elapsed seconds
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Step 0 done immediately, step 1 after 2s, step 2 after 6s, step 3 never (AI not done yet)
  const activeStep = elapsed < 2 ? 0 : elapsed < 6 ? 1 : 2;

  return (
    <View style={{ flex: 1, padding: 24 }}>
      {/* Header */}
      <View style={{ alignItems: 'center', marginBottom: 36, marginTop: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          <Ionicons name="sparkles-outline" size={28} color={accent} />
        </View>
        <Text style={{ fontSize: TYPO.heading, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 }}>
          FurAI is analyzing
        </Text>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 6, textAlign: 'center' }}>
          Usually takes 15–30 seconds · page updates automatically
        </Text>
      </View>

      {/* Steps ladder */}
      <View style={{ gap: 0 }}>
        {STEPS.map((step, idx) => {
          const isDone    = idx < activeStep;
          const isActive  = idx === activeStep;
          const isPending = idx > activeStep;
          const isLast    = idx === STEPS.length - 1;

          const dotColor  = isDone ? '#0F6E56' : isActive ? accent : colors.border;
          const dotBg     = isDone ? '#E1F5EE' : isActive ? accent + '18' : colors.card;
          const labelColor = isPending ? colors.textTertiary : colors.textPrimary;
          const subColor   = isPending ? colors.textTertiary : colors.textSecondary;

          return (
            <View key={step.id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              {/* Spine */}
              <View style={{ width: 48, alignItems: 'center' }}>
                {/* Connector line above dot */}
                <View style={{ width: 2, height: 20, backgroundColor: idx === 0 ? 'transparent' : isDone ? '#0F6E56' : colors.border }} />
                {/* Dot */}
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: dotBg, borderWidth: 1.5, borderColor: dotColor, alignItems: 'center', justifyContent: 'center' }}>
                  {isDone
                    ? <Ionicons name="checkmark" size={18} color="#0F6E56" />
                    : isActive
                    ? <ActivityIndicator size="small" color={accent} />
                    : <Ionicons name={step.icon as any} size={16} color={colors.textTertiary} />
                  }
                </View>
                {/* Connector line below dot */}
                {!isLast && (
                  <View style={{ width: 2, flex: 1, minHeight: 20, backgroundColor: isDone ? '#0F6E56' : colors.border }} />
                )}
              </View>

              {/* Content */}
              <View style={{ flex: 1, paddingLeft: 12, paddingBottom: isLast ? 0 : 20, justifyContent: 'center', paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: TYPO.body, fontWeight: isActive ? '800' : '600', color: labelColor, letterSpacing: -0.2 }}>
                    {step.label}
                  </Text>
                  {isDone && (
                    <View style={{ backgroundColor: '#E1F5EE', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: '#0F6E56' }}>DONE</Text>
                    </View>
                  )}
                  {isActive && (
                    <View style={{ backgroundColor: accent + '18', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: TYPO.body, fontWeight: '700', color: accent }}>IN PROGRESS</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: TYPO.body, color: subColor, marginTop: 3, lineHeight: 17 }}>
                  {step.sub}
                </Text>
                {isActive && idx === 2 && elapsed > 8 && (
                  <Text style={{ fontSize: TYPO.body, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
                    Large documents take a little longer…
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Elapsed hint */}
      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <Text style={{ fontSize: TYPO.body, color: colors.textSecondary }}>
          {elapsed < 60 ? `${elapsed}s elapsed` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed`}
        </Text>
      </View>
    </View>
  );
});

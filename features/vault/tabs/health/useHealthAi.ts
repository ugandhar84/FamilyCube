/**
 * useHealthAi — the Health AI Q&A logic (askAI/shareAiToChat + their state),
 * extracted out of HealthTab.tsx so kiosk can mount a real, standalone
 * CubeAI-style card for Health the same way KioskAiChoresEngine.tsx does
 * for Chores [live-reported: "i want to move the cube ai as a separate
 * section similar to the chores"].
 *
 * This is ONLY the plain question/answer + share-to-chat flow — same real
 * `family-ai` edge function call, same fallback copy, same
 * shareAiToChat message format, all ported verbatim, not re-approximated.
 * The prescription/vaccine SCAN flow (ScanReviewSheet, camera/OCR/redaction)
 * stays entirely inside HealthTab.tsx and is NOT included here: it's a
 * camera-based feature with no kiosk-tablet equivalent, the same reasoning
 * kiosk already applies to photo-proof submission on Chores (phone-only,
 * viewing an already-submitted photo is the kiosk-side affordance instead
 * of capturing a new one).
 *
 * HealthTab.tsx itself now calls this same hook instead of holding this
 * state locally — both callers share one real implementation, not two
 * copies that could drift.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';

export function useHealthAi({ members, activeMemberId }: {
  members: FamilyMember[];
  activeMemberId?: string;
}) {
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiShared, setAiShared] = useState(false);

  const askAI = async (q?: string) => {
    const text = (q ?? aiQuery).trim();
    if (!text) return;
    setAiLoading(true);
    setAiResult('');
    setAiShared(false);
    setAiQuery('');
    try {
      const { data, error } = await supabase.functions.invoke('family-ai', {
        body: {
          action: 'health_qa',
          question: text,
          family: members.map(m => ({ name: m.name, role: m.role })),
        },
      });
      if (error || !data?.result?.answer) {
        // Fallback response
        setAiResult(
          `Health guidance for: "${text}"\n\n` +
          `• This is general information only — not medical advice.\n` +
          `• For children and seniors, consult your family doctor for personalized guidance.\n` +
          `• In an emergency, call 911 or go to the nearest ER.\n\n` +
          `Consider logging this question and the doctor's answer in your health notes.`
        );
      } else {
        setAiResult(data.result.answer);
      }
    } catch {
      setAiResult('Unable to reach Health AI right now. Please try again shortly.');
    }
    setAiLoading(false);
  };

  const shareAiToChat = () => {
    if (!aiResult) return;
    const msg = `🩺 *Health AI Response*\n\n${aiResult}\n\n⚠️ For informational use only — consult a healthcare provider for medical decisions.`;
    useChatStore.getState().sendMessage('all', activeMemberId ?? '', msg);
    setAiShared(true);
  };

  return { aiQuery, setAiQuery, aiResult, setAiResult, aiLoading, aiShared, setAiShared, askAI, shareAiToChat };
}

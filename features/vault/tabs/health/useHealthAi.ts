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
 *
 * ── Sensitive-topic gate on sharing ──────────────────────────────────────
 * [live-reported: "if the Ai is reponse is related to secual shouln't be
 * enabling with the sharewith family in the reponse"] — a Health AI answer
 * about a sensitive topic (sexual health, mental health/self-harm,
 * substance use, abuse) has no business being auto-posted to the whole
 * family chat, where every member (including kids) would see it. There is
 * no server-side classification for this — health_qa's own edge function
 * (supabase/functions/family-ai/index.ts) returns plain prose with no
 * category/flag — so this is a plain client-side keyword check against
 * both the asked question and the returned answer text. It's deliberately
 * a blunt, over-inclusive filter (a false positive just hides a share
 * button; a false negative would post something genuinely private to
 * everyone), not an attempt at real content classification.
 *
 * ── Dismiss ───────────────────────────────────────────────────────────────
 * [live-reported: "we should have clear /dismiss button to clear the ai
 * reponse"] — mobile's own HealthAiAssistant.tsx already has this (its X
 * button calls setAiResult('')+setAiShared(false)+setAiQuery('')); this
 * hook now exposes that same reset as one named `dismiss` function so
 * kiosk's new standalone widget can offer the identical affordance instead
 * of re-deriving it.
 */
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useChatStore } from '@/store/chatStore';
import type { FamilyMember } from '@/store/familyStore';

const SENSITIVE_KEYWORDS = [
  'sex', 'sexual', 'sexually', 'intercourse', 'std', 'sti', 'pregnan', 'pregnancy',
  'condom', 'contracept', 'masturbat', 'puberty', 'period', 'menstrua',
  'suicide', 'self-harm', 'self harm', 'cutting', 'overdose', 'abuse', 'assault',
  'rape', 'molest', 'drug', 'alcohol', 'addiction', 'depression', 'eating disorder',
];

function isSensitiveText(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some(kw => lower.includes(kw));
}

export function useHealthAi({ members, activeMemberId }: {
  members: FamilyMember[];
  activeMemberId?: string;
}) {
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiShared, setAiShared] = useState(false);
  // The question that produced aiResult — aiQuery itself gets cleared the
  // moment askAI fires, so the sensitivity check (which needs to see the
  // question too, not just the answer) needs its own copy.
  const [askedQuestion, setAskedQuestion] = useState('');

  const askAI = async (q?: string) => {
    const text = (q ?? aiQuery).trim();
    if (!text) return;
    setAiLoading(true);
    setAiResult('');
    setAiShared(false);
    setAiQuery('');
    setAskedQuestion(text);
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

  const dismiss = () => {
    setAiResult('');
    setAiShared(false);
    setAiQuery('');
    setAskedQuestion('');
  };

  const isSensitive = useMemo(
    () => !!aiResult && (isSensitiveText(askedQuestion) || isSensitiveText(aiResult)),
    [aiResult, askedQuestion],
  );

  return {
    aiQuery, setAiQuery, aiResult, setAiResult, aiLoading, aiShared, setAiShared,
    askAI, shareAiToChat, dismiss, isSensitive,
  };
}

/**
 * AskCubeChat — the agentic chat itself. Reachable from the floating FAB
 * mounted in app/(tabs)/_layout.tsx over every tab. Talks to the ask-cube
 * edge function (tool-calling loop against real schedule/chore data),
 * shows a proposal (create_event/create_quest) as an inline confirm card
 * — never auto-created, same rule as every other AI-assist surface in this
 * app — and supports voice input via the same useVoiceIntake capture UI
 * AddIntakeChooser already uses, transcribed on-device, sent as a normal
 * chat turn once the user stops speaking.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Sparkles, X, Send, Mic, ChevronDown, History, SquarePen, MessageCircle } from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';
import { TYPO } from '@/constants/theme';
import { askCube, AskCubeProposal, AskCubeChoreRef } from '@/lib/askCubeService';
import AppBottomSheet from '@/components/AppBottomSheet';
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation';
import { useEventStore } from '@/store/eventStore';
import { useQuestStore } from '@/store/choreAdapter';
import { useChoreStore } from '@/store/choreStore';
import { useGroceryStore } from '@/store/groceryStore';
import { useRewardStore } from '@/store/rewardStore';
import { useChatStore } from '@/store/chatStore';
import { supabase } from '@/lib/supabase';
import { checkProfanity } from '@/lib/contentModeration';
import { eventCategoryFromDomain } from '@/lib/responsibilityCategories';
import AskCubeProposalCard from '@/components/AskCubeProposalCard';
import AskCubeMessageText from '@/components/AskCubeMessageText';
import AskCubeRecipeSheet from '@/components/AskCubeRecipeSheet';
import AskCubeMealDayPicker from '@/components/AskCubeMealDayPicker';
import type { FamilyMember } from '@/store/familyStore';
import { showToast } from '@/components/AppToast';

// History sheet row timestamp — "Today 5:55 AM" / "Yesterday 5:55 AM" for the
// last two days, then a short weekday/date for anything older, matching the
// reference conversation-list style. None of lib/dates.ts's existing
// helpers cover this "Today/Yesterday + time" shape (they're all plain-date
// or 24h-window helpers), so it's a small local formatter rather than a
// wrong-fit reuse.
function formatConversationTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

type ProposalStatus = 'pending' | 'created' | 'discarded';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string; // ISO — undefined for a just-sent local message until echoed back
  // A single assistant turn can carry several proposals at once (e.g. 2-3
  // meal options to pick from) — each tracks its own status independently,
  // so picking one doesn't affect the others' cards.
  proposals?: AskCubeProposal[];
  proposalStatuses?: ProposalStatus[];
  // Chores this reply names by title — lets AskCubeMessageText turn each
  // occurrence of the title into a tap-through link to that chore on the
  // Chores tab, instead of the title just sitting there as plain text.
  chores?: AskCubeChoreRef[];
}

export default function AskCubeChat({ visible, onClose, activeMember, members }: {
  visible: boolean;
  onClose: () => void;
  activeMember: FamilyMember;
  members: FamilyMember[];
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const addEvent = useEventStore(s => s.addEvent);
  const addRecurringEvent = useEventStore(s => s.addRecurringEvent);
  const updateEvent = useEventStore(s => s.updateEvent);
  const deleteEvent = useEventStore(s => s.deleteEvent);
  const { addQuest } = useQuestStore();
  const updateChore = useChoreStore(s => s.updateChore);
  const claimPoolQuest = useChoreStore(s => s.claimPoolQuest);
  const approveChore = useChoreStore(s => s.approveChore);
  const declineChoreAssignment = useChoreStore(s => s.declineChoreAssignment);
  const submitChore = useChoreStore(s => s.submitChore);
  const cancelChore = useChoreStore(s => s.cancelChore);
  const addGroceryItem = useGroceryStore(s => s.addItem);
  const redeemReward = useRewardStore(s => s.redeemReward);
  const sendChatMessage = useChatStore(s => s.sendMessage);

  const [expandedRecipe, setExpandedRecipe] = useState<{ msgId: string; index: number } | null>(null);

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const THINKING_WORDS = ['Thinking', 'Crafting', 'Pursuing', 'Digging in', 'Piecing it together'];
  const [thinkingWord, setThinkingWord] = useState(THINKING_WORDS[0]);
  useEffect(() => {
    if (!sending) return;
    setThinkingWord(THINKING_WORDS[Math.floor(Math.random() * THINKING_WORDS.length)]);
    const interval = setInterval(() => {
      setThinkingWord(w => {
        const others = THINKING_WORDS.filter(x => x !== w);
        return others[Math.floor(Math.random() * others.length)];
      });
    }, 1400);
    return () => clearInterval(interval);
  }, [sending]);

  // send is referenced by the voice hook's onAutoStop below, so it's kept
  // in a ref that always points at the latest closure — avoids a
  // declaration-order dependency between the two.
  // A pause only enables Send (mic keeps listening, same as the family Chat
  // tab's dictation) rather than auto-firing the send — auto-send on a
  // fixed pause length reads well for a native English speaker but cuts off
  // non-native speakers, anyone composing a longer thought, or anyone with
  // a speech difference who commonly pauses past the threshold mid-sentence.
  // The user now explicitly taps Send when they're actually done talking.
  const voice = useVoiceDictation();

  // start() fails silently into state:'error' with no UI ever reading
  // voice.error — from the user's side that looks identical to the mic
  // button simply doing nothing on tap (permission denied, native module
  // unavailable, etc.). Surface it so every tap produces visible feedback.
  useEffect(() => {
    if (voice.state === 'error') {
      Alert.alert('Voice input unavailable', voice.error ?? 'Could not start the microphone.');
    }
  }, [voice.state, voice.error]);

  // Shared loader — used both to resume the latest thread on open and to
  // reopen a specific thread picked from the history sheet.
  const loadConversation = async (id: string) => {
    setConversationId(id);
    const rows = await askCube.getMessages(id);
    setMessages(rows.map(r => {
      // Legacy rows stored a single proposal object; current rows store
      // an array — normalize either shape to an array on load.
      const proposals: AskCubeProposal[] = Array.isArray(r.proposal) ? r.proposal : (r.proposal ? [r.proposal as any] : []);
      // proposal_statuses (jsonb array, per-proposal) is the real persisted
      // decision — falls back to the old single-value proposal_status
      // column (applied to every proposal in the row, matching its old
      // semantics) only for rows written before this column existed.
      const persistedStatuses = Array.isArray((r as any).proposal_statuses) ? (r as any).proposal_statuses as ProposalStatus[] : null;
      return {
        id: r.id, role: r.role as 'user' | 'assistant', content: r.content ?? '', timestamp: r.created_at,
        proposals,
        proposalStatuses: proposals.map((_, i) => persistedStatuses?.[i] ?? (r.proposal_status as ProposalStatus) ?? 'pending'),
        chores: Array.isArray((r as any).chore_refs) ? (r as any).chore_refs : undefined,
      };
    }));
    // Land on the latest message immediately — no visible scroll
    // animation on open, same as opening any normal chat app. Content
    // height isn't settled the instant setMessages flushes, so retry a
    // couple of times over the next layout passes rather than relying
    // on a single rAF landing after the ScrollView has measured.
    setShowScrollToBottom(false);
    for (const delay of [0, 50, 150]) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), delay);
    }
  };

  // Resume the most recent thread when the sheet opens, instead of always
  // starting fresh — matches the "persist to a real table" decision.
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const latest = await askCube.getLatestConversation(activeMember.id);
      if (latest) await loadConversation(latest);
    })();
  }, [visible, activeMember.id]);

  // "New chat" — omit conversationId on the next send() to start a genuinely
  // fresh thread (askCubeService.startNewConversation()'s documented
  // pattern), and clear what's currently on screen so the old thread doesn't
  // linger visually. The old conversation isn't lost — it's still reachable
  // from the history sheet below.
  const startNewChat = () => {
    setConversationId(undefined);
    setMessages([]);
    setShowScrollToBottom(false);
  };

  // History sheet — lists every past conversation for this member, most
  // recent first, so "New chat" never strands an old thread with no way
  // back to it.
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversations, setConversations] = useState<{ id: string; title: string | null; updatedAt: string }[]>([]);
  const openHistory = async () => {
    setHistoryVisible(true);
    setHistoryLoading(true);
    try {
      setConversations(await askCube.listConversations(activeMember.id));
    } finally {
      setHistoryLoading(false);
    }
  };
  const openConversationFromHistory = async (id: string) => {
    setHistoryVisible(false);
    if (id === conversationId) return; // already showing it
    await loadConversation(id);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    // Layer 1 only here — Ask Cube is a private parent<->AI chat, not a
    // shared family thread, so the "flag for other parents" layer 2 doesn't
    // apply the same way; still worth blocking obvious profanity before it
    // gets persisted or sent to the model.
    if (checkProfanity(trimmed).blocked) {
      const now = new Date().toISOString();
      setInput('');
      setMessages(prev => [...prev, { id: `local-${Date.now()}`, role: 'user', content: trimmed, timestamp: now },
        { id: `local-${Date.now()}-mod`, role: 'assistant', content: "Let's keep it kind — that message wasn't sent.", timestamp: now }]);
      return;
    }
    setInput('');
    setMessages(prev => [...prev, { id: `local-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date().toISOString() }]);
    // Was: nothing scrolled here at all — if the user had scrolled up to
    // read earlier messages, their own just-sent message landed off-screen,
    // with no scroll happening until the reply started streaming in
    // (line ~224 below) or the whole exchange finished. Scroll immediately
    // on send, same as any normal chat app, instead of waiting on the
    // network round-trip.
    setShowScrollToBottom(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    setSending(true);
    try {
      const res = await askCube.send(activeMember.id, trimmed, conversationId);
      setConversationId(res.conversationId);
      const fullText = res.answer;
      const msgId = `local-${Date.now()}-a`;
      // Client-side typewriter reveal — ask-cube returns one complete JSON
      // response (no SSE infra yet), so this simulates streaming rather than
      // reducing actual latency, which is still an improvement over the
      // answer just popping in all at once.
      const proposals = res.proposals ?? [];
      setMessages(prev => [...prev, {
        id: msgId, role: 'assistant', content: '', timestamp: new Date().toISOString(),
        proposals, proposalStatuses: proposals.map(() => 'pending' as ProposalStatus),
        chores: res.chores ?? [],
      }]);
      setSending(false);
      let i = 0;
      const step = Math.max(1, Math.ceil(fullText.length / 60));
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          i += step;
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText.slice(0, i) } : m));
          scrollRef.current?.scrollToEnd({ animated: true });
          if (i >= fullText.length) { clearInterval(interval); resolve(); }
        }, 16);
      });
    } catch (e: any) {
      setMessages(prev => [...prev, { id: `local-${Date.now()}-err`, role: 'assistant', content: "Sorry, I couldn't reach the server — try again in a moment.", timestamp: new Date().toISOString() }]);
      setSending(false);
    } finally {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };
  // Cache of existing meals, keyed by week_of, loaded on demand as the day
  // picker's calendar moves between weeks — powers the "replace existing?"
  // confirmation without a fresh query on every date tap for a week already
  // fetched. Not just "this week" any more since the picker now supports
  // any future date.
  const [weekMealsCache, setWeekMealsCache] = useState<Record<string, { day: string; type: string; title: string }[]>>({});
  const loadWeekMeals = async (weekOf: string) => {
    if (weekMealsCache[weekOf]) return;
    const { data } = await supabase.from('family_meals')
      .select('day, type, title')
      .eq('family_id', activeMember.familyId)
      .eq('week_of', weekOf);
    setWeekMealsCache(prev => ({ ...prev, [weekOf]: data ?? [] }));
  };

  const addMealToPlan = async (d: any, weekOf: string, day: string, mealType: string) => {
    // Was entirely unguarded — any failure here (RLS denial, network blip,
    // a bad column value) threw an unhandled rejection with pendingMealCreate
    // never cleared, leaving the confirm modal stuck open with no feedback
    // (user-reported: "goes silent and then frozen"). Report the failure and
    // let the caller decide what to do, instead of silently hanging.
    try {
      // Replacing an existing slot — delete it first rather than leaving two
      // rows stacked in the same day/type slot.
      const { error: delError } = await supabase.from('family_meals').delete()
        .eq('family_id', activeMember.familyId).eq('week_of', weekOf)
        .eq('day', day).eq('type', mealType.toLowerCase());
      if (delError) throw delError;
      const { error: insError } = await supabase.from('family_meals').insert({
        id: `${activeMember.familyId}-${weekOf}-${day}-askcube-${Date.now()}`,
        family_id: activeMember.familyId, week_of: weekOf, day,
        title: d.title, type: mealType.toLowerCase(), chef_id: d.chefId ?? null,
        ingredients: d.ingredients ?? [], emoji: d.emoji ?? null, image_url: d.imageUrl ?? null, prep_minutes: d.prepMinutes ?? null,
        dietary_tags: [], prep_steps: d.prepSteps ?? [], ai_generated: true,
      });
      if (insError) throw insError;
      // Was DB-write-only — weekMealsCache (this component's own local
      // "does this slot already have a meal?" lookup, read by
      // AskCubeMealDayPicker's existingMealTitle above) never learned about
      // the meal just added, so adding a second meal to the SAME week in the
      // same AskCube session wouldn't see it and could offer to silently
      // double-book/replace a slot that (from this cache's stale view) still
      // looked empty. There's no store or realtime subscription for
      // family_meals anywhere in the app to catch this some other way.
      setWeekMealsCache(prev => {
        const existing = (prev[weekOf] ?? []).filter(m => !(m.day === day && m.type === mealType.toLowerCase()));
        return { ...prev, [weekOf]: [...existing, { day, type: mealType.toLowerCase(), title: d.title }] };
      });
      return true;
    } catch (e: any) {
      console.warn('[AskCubeChat] addMealToPlan failed', e?.message ?? e);
      return false;
    }
  };

  // Meal creation is a two-step flow: tapping Create/Add opens the day/meal
  // picker (pendingMealCreate) instead of inserting immediately, so "tonight
  // dinner" always gets confirmed against a real day rather than trusting
  // whatever the model guessed.
  const [pendingMealCreate, setPendingMealCreate] = useState<{ msgId: string; index: number; proposal: AskCubeProposal } | null>(null);

  // Shares as a structured, read-only card (systemEvent) that ChatScreen.tsx
  // renders specially — not a formatted text blob — so the family sees the
  // same rich meal card (photo/emoji, prep time, ingredients) in Chat that
  // they saw here, instead of a wall of plain text.
  const shareMealToChat = (d: any) => {
    sendChatMessage(
      'all', activeMember.id, `Shared a meal: ${d.title}`,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { type: 'shared_card', payload: { kind: 'meal', data: d } },
    );
  };

  const markProposalCreated = (msgId: string, index: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.proposalStatuses) return m;
      const next = [...m.proposalStatuses];
      next[index] = 'created';
      // Fire-and-forget persist — without this the decision only ever lived
      // in local component state and silently reset to "pending" the next
      // time this conversation was reopened (user-reported).
      askCube.setProposalStatus(msgId, next).catch(() => {});
      return { ...m, proposalStatuses: next };
    }));
  };

  // The reminder chip on a proposal card was previously read-only display —
  // whatever lead time the AI picked (often "On time"/0, since the prompt
  // deliberately doesn't invent one unasked) had no way to be adjusted
  // before confirming, so getting a 15/30-min reminder meant discarding and
  // re-typing a more specific request. Lets the user tap a lead-time chip
  // to edit the still-pending proposal's own data in place.
  const updateProposalReminder = (msgId: string, index: number, leadMinutes: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.proposals) return m;
      const nextProposals = m.proposals.map((p, i) => {
        if (i !== index) return p;
        // update_event/update_chore proposals carry their field changes
        // nested under `changes` (matching the exact partial patch that
        // will be sent to updateEvent/updateChore on confirm) rather than
        // top-level — editing the picker here has to write into that same
        // nested shape so createProposal's `updateEvent(id, d.changes)` /
        // `updateChore(id, d.changes)` actually picks up the edit.
        if (p.kind === 'update_event' || p.kind === 'update_chore') {
          return { ...p, data: { ...p.data, changes: { ...p.data.changes, alertCall: true, alertCallLeadMinutes: leadMinutes } } };
        }
        return { ...p, data: { ...p.data, alertCall: true, alertCallLeadMinutes: leadMinutes } };
      });
      // Persist immediately — without this, an in-place edit (reminder,
      // store, or date/time below) only ever lived in local component
      // state and silently reverted to the AI's original draft the next
      // time this conversation reopened (user-reported, same class of gap
      // as proposal_status before it got the same treatment).
      askCube.setProposalData(msgId, nextProposals).catch(() => {});
      return { ...m, proposals: nextProposals };
    }));
  };

  // Lets the user pick/type a store for a still-pending grocery proposal —
  // same in-place-edit pattern as updateProposalReminder above. Sets one
  // store for the whole batch of proposed items (d.store), which addItem
  // above falls back to per-item when an individual item has none of its own.
  const updateProposalStore = (msgId: string, index: number, store: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.proposals) return m;
      const nextProposals = m.proposals.map((p, i) => i === index ? { ...p, data: { ...p.data, store } } : p);
      askCube.setProposalData(msgId, nextProposals).catch(() => {});
      return { ...m, proposals: nextProposals };
    }));
  };

  // Lets the user adjust a proposal's date/time directly via the native
  // picker (see AskCubeProposalCard's DateTimeEditRow) instead of discarding
  // and re-asking Cube in plain English — same in-place-edit + persist
  // pattern as the reminder/store editors above. Writes into the field
  // names each proposal kind actually expects on confirm: quest uses
  // top-level dueDate/dueTime, update_chore the same pair nested under
  // `changes`, event/update_event use date/time (top-level or nested).
  const updateProposalDateTime = (msgId: string, index: number, next: { date: string; time?: string }) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.proposals) return m;
      const nextProposals = m.proposals.map((p, i) => {
        if (i !== index) return p;
        if (p.kind === 'update_chore') {
          return { ...p, data: { ...p.data, changes: { ...p.data.changes, dueDate: next.date, dueTime: next.time } } };
        }
        if (p.kind === 'update_event') {
          return { ...p, data: { ...p.data, changes: { ...p.data.changes, date: next.date, time: next.time } } };
        }
        if (p.kind === 'quest') {
          return { ...p, data: { ...p.data, dueDate: next.date, dueTime: next.time } };
        }
        if (p.kind === 'event') {
          const [h, m2] = (next.time ?? '09:00').split(':').map(Number);
          const startAt = new Date(`${next.date}T00:00:00`);
          startAt.setHours(h, m2, 0, 0);
          return { ...p, data: { ...p.data, startAt: startAt.toISOString() } };
        }
        return p;
      });
      askCube.setProposalData(msgId, nextProposals).catch(() => {});
      return { ...m, proposals: nextProposals };
    }));
  };

  const createProposal = async (msgId: string, index: number, proposal: AskCubeProposal) => {
    if (proposal.kind === 'meal') {
      setPendingMealCreate({ msgId, index, proposal });
      return;
    }
    const d = proposal.data;
    if (proposal.kind === 'event') {
      // ask-cube's own prompt tells the model to return startAt with no
      // trailing "Z"/UTC offset (a plain local wall-clock string) so
      // `new Date(...)` parses it in THIS device's own timezone via
      // getHours()/getMinutes() below — but a model deviation that still
      // includes one would get silently reinterpreted at the wrong hour
      // (live-reported: an event set for 11:22 PM landed an hour early on
      // the synced calendar). Stripping any trailing Z/offset here is a
      // defensive backstop so a prompt slip can't reproduce that bug.
      const startAtLocal = d.startAt ? d.startAt.replace(/(Z|[+-]\d{2}:?\d{2})$/, '') : undefined;
      const dt = startAtLocal ? new Date(startAtLocal) : new Date();
      const time = d.startAt ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : undefined;
      const base = {
        title: d.title, type: 'event' as const, category: eventCategoryFromDomain(d.category) ?? d.category ?? 'Other',
        allDay: !d.startAt, memberId: d.memberId ?? undefined, notes: d.notes ?? undefined,
        approvalPending: false, conflict: false,
        // Only ever set by the edge function when the user explicitly asked
        // for a reminder (ask-cube/index.ts's system prompt) — mirrors the
        // manual EventFormModal's own opt-in alertCall toggle exactly.
        alertCall: d.alertCall ?? false, alertCallLeadMinutes: d.alertCallLeadMinutes ?? undefined,
      };
      const eventDate = dt.toISOString().slice(0, 10);
      // Same live-reported duplicate-creation gap EventFormModal's own
      // submit() just got this check added for — Ask Cube proposing "add
      // this ride" is an equally real way to end up creating a second copy
      // of something that already exists (the user asking the AI about an
      // existing ride, not realizing it's not new). Best-effort, fails
      // open — a check failure must never block a real create.
      if (time && activeMember?.familyId) {
        try {
          const { data: dupe } = await supabase.rpc('check_likely_duplicate_event', {
            p_family_id: activeMember.familyId, p_title: base.title, p_start_time: time, p_date: eventDate,
          });
          const match = Array.isArray(dupe) ? dupe[0] : dupe;
          if (match) {
            const proceed = await new Promise<boolean>(resolve => {
              Alert.alert(
                'Possible duplicate',
                `"${match.title}" already exists on ${match.date}${match.is_series ? ' (a recurring series)' : ''} at this same time. Create this one anyway?`,
                [
                  { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Create anyway', style: 'destructive', onPress: () => resolve(true) },
                ],
              );
            });
            if (!proceed) return;
          }
        } catch (e: any) {
          console.warn('[AskCubeChat] check_likely_duplicate_event failed (proceeding):', e?.message);
        }
      }
      if (d.recurrenceRule?.frequency) {
        // "every Thursday"-style requests previously had nowhere to go —
        // propose_event had no recurrence field, so they silently became a
        // single one-off event. addRecurringEvent materializes the real
        // series the same way the manual Add Event form's own repeat
        // toggle does.
        addRecurringEvent({ ...base, date: eventDate, time }, d.recurrenceRule);
      } else {
        addEvent({ ...base, date: eventDate, time });
      }
    } else if (proposal.kind === 'quest') {
      addQuest({
        title: d.title, category: 'Other', priority: 'medium',
        coins: d.memberId && members.find(m => m.id === d.memberId)?.role === 'parent' ? 0 : (d.coins ?? 20),
        xpReward: 15, isPool: !d.memberId, isDaily: false,
        recurrence: d.recurrenceRule?.frequency ?? 'once', status: 'todo',
        assignedToIds: d.memberId ? [d.memberId] : [], isAdultTask: false,
        dueDate: d.dueDate ?? undefined, dueTime: d.dueTime ?? undefined, photoRequired: d.photoRequired ?? false,
        createdById: activeMember.id,
        alertCall: d.alertCall ?? false, alertCallLeadMinutes: d.alertCallLeadMinutes ?? undefined,
      });
    } else if (proposal.kind === 'grocery') {
      for (const it of (d.items ?? [])) {
        await addGroceryItem({
          familyId: activeMember.familyId!, name: it.name, quantity: it.quantity ?? undefined,
          category: it.category ?? 'Other', addedBy: activeMember.id, aiGenerated: true,
          storePreference: it.store ?? d.store ?? undefined,
        });
      }
    } else if (proposal.kind === 'redemption') {
      // redeemReward (store/rewardStore.ts) owns the real eligibility/
      // balance re-check and coin deduction — propose_redemption already
      // verified both server-side so the card the user saw was accurate,
      // but the actual mutation only ever happens through the same store
      // function every other redemption in the app uses, not a bespoke
      // write here. redeemReward is now a real atomic RPC call (closes a
      // double-redeem race found in this session's coin-economy audit) and
      // can genuinely fail server-side even after propose_redemption's own
      // check passed moments earlier (e.g. someone else claimed the last
      // stock in between) — must actually check the result now rather than
      // assume success and mark the card "created" regardless.
      const redeemed = await redeemReward(d.rewardId, d.memberId);
      if (!redeemed) {
        setMessages(prev => [...prev, { id: `local-${Date.now()}-redeemerr`, role: 'assistant',
          content: "Sorry, that reward couldn't be redeemed — it may be out of stock or already at its limit. Please check the Store tab.", timestamp: new Date().toISOString() }]);
        return;
      }
    } else if (proposal.kind === 'update_event') {
      // Targeted patch onto the EXISTING event the edge function already
      // resolved server-side (propose_update) — never a new row, and only
      // the fields actually proposed as changed (d.changes), same "only the
      // fields the caller intended" discipline updateEvent's own
      // partial-patch path (toRowPartial) documents. Never spread the whole
      // proposal — that would risk overwriting fields the user never asked
      // to touch with the found record's OTHER unrelated current values.
      updateEvent(d.eventId, d.changes ?? {});
    } else if (proposal.kind === 'update_chore') {
      // Same discipline for chores — updateChore's own DB patch builder
      // (store/choreStore.ts) already only writes columns present in the
      // updates object via `in` checks, so passing exactly d.changes here
      // (nothing more) keeps every untouched field on the real row intact.
      updateChore(d.choreId, d.changes ?? {});
    } else if (proposal.kind === 'chore_action') {
      // Each branch calls the exact same store action the corresponding
      // manual UI control does (Claim button, Approve/Decline in
      // ChoreReviewSection, the Quests tab's "Mark done" for a no-photo
      // chore, Cancel) — propose_chore_action already re-validated the
      // chore's current status server-side, so this mirrors createProposal's
      // other branches in trusting that check rather than re-deriving it.
      if (d.action === 'claim') claimPoolQuest(d.choreId, activeMember.id);
      else if (d.action === 'approve') approveChore(d.choreId, activeMember.id);
      else if (d.action === 'decline') declineChoreAssignment(d.choreId, activeMember.id, d.reason ?? 'Declined via Ask Cube');
      else if (d.action === 'complete') submitChore(d.choreId);
      else if (d.action === 'cancel') cancelChore(d.choreId, activeMember.id);
    } else if (proposal.kind === 'cancel_event') {
      // Same soft-delete every manual "Delete event" control in the app
      // uses (Calendar tab's own delete action) — propose_cancel_event
      // already resolved the exact event server-side, so this just applies
      // the same deleteEvent(id) the rest of the app already trusts.
      deleteEvent(d.eventId);
    }
    // Every branch above is a real DB write once confirmed — same "any
    // update to the DB gets a toast" rule every manual create/edit/delete
    // flow in the app follows now. Proposal cards already flip to a
    // visual "created" state, but that's easy to miss scrolled off-screen
    // in a chat thread; the toast is the same confirmation signal
    // everywhere else in the app already gives.
    const chorActionToast: Record<string, string> = {
      claim: 'Chore claimed', approve: 'Chore approved', decline: 'Chore declined',
      complete: 'Chore marked done', cancel: 'Chore cancelled',
    };
    // 'meal' is excluded here — createProposal returns early for it (see
    // top of this function) and its own success toast fires from
    // AskCubeMealDayPicker's onConfirm below instead, once addMealToPlan
    // actually succeeds.
    const toastByKind: Record<Exclude<AskCubeProposal['kind'], 'meal'>, string> = {
      event: 'Event created', quest: 'Chore created', grocery: 'Added to grocery list',
      redemption: 'Reward redeemed',
      update_event: 'Event updated', update_chore: 'Chore updated',
      chore_action: chorActionToast[d.action] ?? 'Done',
      cancel_event: 'Event cancelled',
    };
    showToast(toastByKind[proposal.kind] ?? 'Done');
    markProposalCreated(msgId, index);
  };

  const discardProposal = (msgId: string, index: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.proposalStatuses) return m;
      const next = [...m.proposalStatuses];
      next[index] = 'discarded';
      askCube.setProposalStatus(msgId, next).catch(() => {});
      return { ...m, proposalStatuses: next };
    }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            height: '85%', paddingTop: 12 }}>

            <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, backgroundColor: colors.border }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12,
              borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.primary + '18',
                alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Sparkles size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>Ask Cube</Text>
                <Text style={{ fontSize: TYPO.label, color: colors.textSecondary }}>Ask about the family's schedule or chores</Text>
              </View>
              <Pressable onPress={openHistory} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : colors.surface, marginRight: 8 }}>
                <History size={17} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={startNewChat} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                disabled={messages.length === 0 && !conversationId}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? '#1E293B' : colors.surface, marginRight: 8,
                  opacity: (messages.length === 0 && !conversationId) ? 0.4 : 1 }}>
                <SquarePen size={17} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : colors.surface }}>
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ flex: 1 }}>
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }}
              keyboardShouldPersistTaps="handled"
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
                // Was 120 — on a phone-sized viewport that's easily "still
                // basically at the bottom," so scrolling up even a little to
                // reread something never actually surfaced the button. A
                // much smaller threshold (just enough to ignore floating-
                // point/bounce noise right at the bottom) matches normal
                // chat-app behavior: any real scroll-up shows the button.
                setShowScrollToBottom(distanceFromBottom > 40);
              }}
              scrollEventThrottle={100}>
              {messages.length === 0 && !sending && (
                <View style={{ alignItems: 'center', paddingVertical: 30, gap: 8 }}>
                  <Sparkles size={28} color={colors.textTertiary} />
                  <Text style={{ fontSize: TYPO.caption, color: colors.textTertiary, textAlign: 'center', maxWidth: 260 }}>
                    Try "what's going on this week?" or "has anyone done the trash?"
                  </Text>
                </View>
              )}
              {messages.map(m => (
                <View key={m.id} style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <View style={{ maxWidth: m.role === 'user' ? '85%' : '92%', borderRadius: 16,
                    paddingHorizontal: 14, paddingVertical: m.role === 'user' ? 10 : 13,
                    backgroundColor: m.role === 'user' ? colors.primary : colors.card,
                    borderWidth: m.role === 'user' ? 0 : 1, borderColor: colors.border,
                    borderBottomRightRadius: m.role === 'user' ? 4 : 16,
                    borderBottomLeftRadius: m.role === 'user' ? 16 : 4 }}>
                    {m.role === 'user' ? (
                      <Text style={{ fontSize: TYPO.body, color: '#fff', lineHeight: 22 }}>{m.content}</Text>
                    ) : (
                      <AskCubeMessageText
                        content={m.content} color={colors.textPrimary} urgentColor={colors.danger} soonColor={colors.amber}
                        chores={m.chores} linkColor={colors.primary}
                        onChorePress={(choreId) => {
                          onClose();
                          router.push({ pathname: '/(tabs)/quests', params: { questId: choreId } } as any);
                        }}
                      />
                    )}
                  </View>
                  {m.timestamp && (
                    <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2, marginHorizontal: 4 }}>
                      {new Date(m.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  )}

                  {m.proposals?.length ? (() => {
                    // 2+ meal options render as a 2-per-row grid (compact
                    // cards) instead of stacked full-width — picking between
                    // several dinner ideas shouldn't mean scrolling through
                    // a wall of tall cards.
                    const isMealGrid = m.proposals.length > 1 && m.proposals.every(p => p.kind === 'meal');
                    return (
                      <View style={{ width: '100%', flexDirection: isMealGrid ? 'row' : 'column', flexWrap: isMealGrid ? 'wrap' : 'nowrap', gap: isMealGrid ? 8 : 4 }}>
                        {m.proposals.map((p, i) => {
                          const status = m.proposalStatuses?.[i] ?? 'pending';
                          // Both terminal states (created/discarded) keep
                          // rendering the full real card — grayed and
                          // non-interactive for discarded, a green checkmark
                          // for created — instead of collapsing to a bare
                          // text line, which lost all the detail the user was
                          // just reviewing and read as the item disappearing
                          // outright rather than a recorded decision
                          // (user-reported for the 'created' case originally;
                          // the same complaint applies to 'discarded').
                          return (
                            <View key={i} style={isMealGrid ? { width: '48%' } : undefined}>
                              <AskCubeProposalCard
                                proposal={p}
                                members={members}
                                compact={isMealGrid}
                                added={status === 'created'}
                                discarded={status === 'discarded'}
                                onDiscard={() => discardProposal(m.id, i)}
                                onCreate={() => createProposal(m.id, i, p)}
                                onExpand={p.kind === 'meal' ? () => setExpandedRecipe({ msgId: m.id, index: i }) : undefined}
                                onChangeReminder={
                                  ['event', 'quest', 'update_event', 'update_chore'].includes(p.kind)
                                    ? (leadMinutes: number) => updateProposalReminder(m.id, i, leadMinutes)
                                    : undefined
                                }
                                onChangeStore={
                                  p.kind === 'grocery'
                                    ? (store: string) => updateProposalStore(m.id, i, store)
                                    : undefined
                                }
                                onChangeDateTime={
                                  ['event', 'quest', 'update_event', 'update_chore'].includes(p.kind)
                                    ? (next: { date: string; time?: string }) => updateProposalDateTime(m.id, i, next)
                                    : undefined
                                }
                              />
                            </View>
                          );
                        })}
                      </View>
                    );
                  })() : null}
                </View>
              ))}
              {sending && (
                <View style={{ alignItems: 'flex-start' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16,
                    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface }}>
                    <Sparkles size={13} color={colors.primary} />
                    <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>{thinkingWord}…</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {showScrollToBottom && (
              <Pressable
                onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
                style={{ position: 'absolute', bottom: 12, alignSelf: 'center',
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                  shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
                <ChevronDown size={14} color="#fff" />
                <Text style={{ fontSize: TYPO.label, fontWeight: '700', color: '#fff' }}>Latest</Text>
              </Pressable>
            )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16,
              paddingTop: 10, paddingBottom: Math.max(16, insets.bottom + 8), borderTopWidth: 1, borderTopColor: colors.border }}>
              <Pressable
                onPress={async () => {
                  // Single mic control feeds the text box directly — while
                  // listening, the box shows the live transcript; a pause
                  // enables Send (silenceReady below) but the mic keeps
                  // listening until the user taps the mic again to stop, or
                  // taps Send to stop-and-send in one step.
                  // Tapping mic-to-STOP (as opposed to Send-to-stop-and-send)
                  // previously discarded the transcript entirely — the box
                  // fell back to `input`, which nothing had ever set, so the
                  // just-dictated text visibly vanished. Now it lands in
                  // `input`, editable with the keyboard, exactly like typing
                  // it — the user decides from there whether to edit and
                  // send or clear it.
                  if (voice.state === 'listening') {
                    const transcript = voice.liveTranscript;
                    await voice.stop();
                    if (transcript.trim()) setInput(transcript);
                    return;
                  }
                  await voice.start();
                }}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: voice.state === 'listening' ? colors.danger + '20' : colors.surface }}>
                {voice.state === 'listening'
                  ? <ActivityIndicator size="small" color={colors.danger} />
                  : <Mic size={18} color={colors.textSecondary} />}
              </Pressable>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <TextInput
                  value={voice.state === 'listening' ? (voice.liveTranscript || 'Listening…') : input}
                  onChangeText={setInput}
                  placeholder="Ask Cube anything…"
                  placeholderTextColor={colors.placeholder}
                  editable={voice.state !== 'listening'}
                  style={{ fontSize: TYPO.body,
                    color: voice.state === 'listening' && !voice.liveTranscript ? colors.textTertiary : colors.textPrimary,
                    backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1,
                    borderColor: voice.state === 'listening' ? colors.danger + '60' : colors.borderMed,
                    paddingHorizontal: 16, paddingVertical: 10, paddingRight: input && voice.state !== 'listening' ? 36 : 16 }}
                  onSubmitEditing={() => send(input)}
                  returnKeyType="send"
                />
                {/* Clear-in-one-tap — a dictated (or typed) message the user
                    decides not to send shouldn't need manual backspacing. */}
                {!!input && voice.state !== 'listening' && (
                  <Pressable onPress={() => setInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ position: 'absolute', right: 10, width: 20, height: 20, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center', backgroundColor: colors.border }}>
                    <X size={12} color={colors.textSecondary} />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={async () => {
                  if (voice.state === 'listening') {
                    const transcript = voice.liveTranscript;
                    await voice.stop();
                    if (transcript.trim()) send(transcript);
                    return;
                  }
                  send(input);
                }}
                disabled={voice.state === 'listening' ? !(voice.silenceReady && voice.liveTranscript.trim()) : (!input.trim() || sending)}
                style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: (voice.state === 'listening' ? voice.silenceReady && voice.liveTranscript.trim() : input.trim() && !sending) ? colors.primary : colors.border }}>
                <Send size={16} color={(voice.state === 'listening' ? voice.silenceReady && voice.liveTranscript.trim() : input.trim() && !sending) ? '#fff' : colors.textTertiary} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {(() => {
        const msg = expandedRecipe ? messages.find(m => m.id === expandedRecipe.msgId) : null;
        const p = msg?.proposals?.[expandedRecipe?.index ?? -1];
        const d = p?.data;
        const status = msg?.proposalStatuses?.[expandedRecipe?.index ?? -1] ?? 'pending';
        return (
          <AskCubeRecipeSheet
            visible={!!expandedRecipe && !!d}
            data={d ? { title: d.title, day: d.day, mealType: d.mealType, emoji: d.emoji, imageUrl: d.imageUrl, prepMinutes: d.prepMinutes, ingredients: d.ingredients, prepSteps: d.prepSteps } : null}
            chefName={d?.chefId ? members.find(m => m.id === d.chefId)?.name : undefined}
            added={status === 'created'}
            onClose={() => setExpandedRecipe(null)}
            onAdd={async () => {
              if (!expandedRecipe || !d) return;
              await createProposal(expandedRecipe.msgId, expandedRecipe.index, p!);
              setExpandedRecipe(null); // day picker takes over from here
            }}
            onShare={() => { if (d) shareMealToChat(d); }}
          />
        );
      })()}

      <AppBottomSheet
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        title="Chat history"
        subtitle={conversations.length ? `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}` : undefined}
        accentColor={colors.primary}
        maxHeight="75%"
      >
        {historyLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
            <MessageCircle size={28} color={colors.textTertiary} />
            <Text style={{ fontSize: TYPO.caption, fontWeight: '700', color: colors.textSecondary }}>No past conversations yet</Text>
            <Text style={{ fontSize: TYPO.micro, color: colors.textTertiary }}>Start chatting with Cube and it'll show up here</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {conversations.map(c => {
              const isActive = c.id === conversationId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => openConversationFromHistory(c.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
                    backgroundColor: isActive ? colors.primary + '12' : colors.surface,
                    borderWidth: isActive ? 1 : 0, borderColor: colors.primary + '40' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary + '18',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={15} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: TYPO.body, fontWeight: '700', color: colors.textPrimary }}>
                      {c.title?.trim() || 'New chat'}
                    </Text>
                    <Text style={{ fontSize: TYPO.label, color: colors.textTertiary, marginTop: 2 }}>
                      {formatConversationTimestamp(c.updatedAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </AppBottomSheet>

      <AskCubeMealDayPicker
        visible={!!pendingMealCreate}
        initialDay={pendingMealCreate?.proposal.data.day}
        initialMealType={pendingMealCreate?.proposal.data.mealType}
        existingMealTitle={(weekOf, day, mealType) => {
          const cached = weekMealsCache[weekOf];
          if (!cached) { loadWeekMeals(weekOf); return null; }
          return cached.find(m => m.day === day && m.type === mealType.toLowerCase())?.title ?? null;
        }}
        onCancel={() => setPendingMealCreate(null)}
        onConfirm={async (weekOf, day, mealType) => {
          if (!pendingMealCreate) return;
          const { msgId, index, proposal } = pendingMealCreate;
          const ok = await addMealToPlan(proposal.data, weekOf, day, mealType);
          // Always close the modal and clear pending state regardless of
          // outcome — this is what was previously missing on failure,
          // leaving the confirm sheet stuck open with no way forward.
          setPendingMealCreate(null);
          if (ok) {
            showToast('Meal added');
            markProposalCreated(msgId, index);
          } else {
            setMessages(prev => [...prev, { id: `local-${Date.now()}-mealerr`, role: 'assistant',
              content: "Sorry, that meal couldn't be added — try again in a moment.", timestamp: new Date().toISOString() }]);
          }
        }}
      />
    </Modal>
  );
}

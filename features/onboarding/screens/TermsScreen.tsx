import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/lib/ThemeContext';
import BackButton from '@/components/BackButton';
import { useAuthStore } from '@/store/authStore';
import { showAlert } from '@/components/AppAlert';
import { TYPO } from '@/constants/theme';

// Exported so Profile's read-only "Terms & Privacy" link (features/profile)
// can reuse the same real legal copy instead of inventing new text — this
// screen's own onboarding accept-flow (checkbox + CTA + back-to-onboarding
// button below) isn't reusable as-is for a signed-in user just wanting to
// re-read the terms.
export const TERMS_CONTENT = `FAMILY CUBE — TERMS OF SERVICE, PRIVACY POLICY & AI DISCLOSURE

Last updated: August 2026 | Version 2.0

THESE TERMS GOVERN YOUR ENTIRE LEGAL RELATIONSHIP WITH PEOPLEONTECH LLC. THEY INCLUDE MANDATORY ARBITRATION (§14), CLASS ACTION WAIVER (§14.4), AND LIMITATIONS OF LIABILITY (§11). READ EVERY SECTION BEFORE USING THIS APP.

BY TAPPING "ACCEPT & CONTINUE", CREATING AN ACCOUNT, OR ACCESSING ANY PART OF THE SERVICE, YOU REPRESENT THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE LEGALLY BOUND BY THESE TERMS IN THEIR ENTIRETY. IF YOU DO NOT AGREE, DO NOT USE THIS APP.


1. WHAT FAMILY CUBE IS

1.1 The Service. Family Cube ("Service", "App") is a family organization app. It lets members of a household share a private "family" space to coordinate chores and rewards ("Chores"), a shared calendar and event scheduling, group and direct messaging ("Chat"), real-time family location sharing ("FindFam"), a coin-based reward store, a photo memories feed, and an AI assistant ("Ask Fam") that can answer questions and help create/manage the above from natural-language requests.

1.2 Not a general social network. Family Cube is designed for private use within one self-organized family group. It has no public feed, no stranger-matching, and no discovery of other users outside a family the account holder creates or is invited into.


2. PARTIES, ACCEPTANCE & ELIGIBILITY

2.1 Agreement. These Terms of Service ("Terms") are a binding legal contract between you ("User", "you") and PeopleOnTech LLC, a Delaware limited liability company ("Company", "we", "us"). "Family Cube" is our brand name for the Service.

2.2 Electronic acceptance. Tapping "Accept & Continue," creating an account, or using any part of the Service constitutes full, unconditional acceptance of these Terms. Electronic acceptance carries the same legal force as a handwritten signature.

2.3 Account holder eligibility. The person who creates a family and manages its settings ("Account Holder", typically a parent or guardian) must be at least 18 years old and have full legal capacity to enter into binding contracts.

2.4 Family member accounts, including minors. An Account Holder may create or approve additional profiles within their family for other household members, including children. A parent or legal guardian who adds a child's profile: (a) is providing verifiable parental consent for that child's use of the Service, as required by the Children's Online Privacy Protection Act ("COPPA") and comparable laws; (b) is responsible for supervising that child's use of the Service; and (c) may view, manage, and delete that child's profile and data at any time from the App. A child's profile and data are visible only within that child's own family, never publicly or to any other family.

2.5 Authority. You warrant that all information you provide is truthful, accurate, and current, and that you have the authority to add and consent on behalf of any minor profile you create.

2.6 Rejection. If you disagree with any provision, stop using the Service immediately and delete the App. Continued use is acceptance of the then-current Terms.


3. CHANGES TO TERMS AND SERVICE

3.1 We may amend these Terms, the Service, or any feature at any time, effective upon posting in the App. Material changes will be presented for re-acceptance the next time you open the App. We may, but are not obligated to, provide advance notice beyond that.

3.2 We may modify, suspend, or discontinue any feature (including features available on free or paid tiers), change pricing, or restrict access, subject to §9 (Subscriptions) for paid-tier commitments already in effect.

3.3 The version displayed in the App always governs.


4. YOUR CONTENT AND DATA

4.1 Ownership. You (and your family) retain ownership of the content you submit — messages, photos, event details, chore/quest text, and similar ("User Content"). We do not claim ownership of it.

4.2 Licence to operate the Service. You grant PeopleOnTech LLC a limited, non-exclusive licence to store, process, transmit, and display your User Content solely as necessary to provide the Service to you and the other members of your family (e.g., delivering a chat message, showing a calendar event to family members, rendering a photo in the Memories feed). This licence ends when the content or your account is deleted, subject to §7.6 (backup retention).

4.3 No use of your content to train third-party AI models without consent. We do not send your identifiable family data to a third-party AI provider for model-training purposes. See §6.7 for how Ask Fam processes what you send it.

4.4 User Content standards. You are responsible for content you or your family members submit. You must not submit content that is unlawful, infringes another person's rights, or that you do not have the right to share (e.g., a photo of someone outside your family without their consent, where consent is legally required).

4.5 App ownership. The App itself — its code, design, graphics, trademarks, and logos — is the property of PeopleOnTech LLC or its licensors. You receive a limited, personal, non-transferable licence to use the App on a device you own or control; you may not reverse-engineer, decompile, resell, or use it for any commercial purpose without our written consent.


5. LOCATION SHARING (FINDFAM)

5.1 Opt-in and scope. Family location sharing is only active for a family member whose profile has enabled it (directly, or via parental configuration for a minor's profile). Location is shared only with members of that same family — never with any other family, the public, or advertisers.

5.2 Accuracy and reliability. Location data depends on device GPS, network conditions, and OS-level background permissions, and may be delayed, inaccurate, or unavailable at times. Family Cube's location features are a convenience tool, not a guaranteed real-time tracking or emergency-response system, and must not be relied upon as the sole means of locating a family member in an emergency — call local emergency services directly for any genuine emergency.

5.3 Turning it off. Any family member (or, for a minor's profile, their parent/guardian) may disable location sharing for that profile at any time in Settings.


6. CHAT, CALLS, AND NOTIFICATIONS

6.1 Private to your family. Chat, voice/video attachments, and call-style reminders in the App are visible only within your own family's account, subject to each member's role-based permissions inside the App (e.g., a parent may have oversight of a child's activity within the family).

6.2 Call-style reminders. The App may use call-alert style notifications (including via CallKit-style native call UI) to deliver time-sensitive reminders (e.g., pickup or medication reminders) you or another family member configured. These are app-generated alerts, not real telephone calls, and are not routed through emergency services.

6.3 Content responsibility. Each family member is responsible for what they post in Chat. We do not pre-screen messages; automated content-safety checks may flag certain content for a parent's visibility, but this is a best-effort safety aid, not a guarantee that no inappropriate content will ever appear.


7. DATA, PRIVACY, AND SECURITY

7.1 Data we collect. We collect and process: account credentials and profile information for each family member; family organizational data you enter (events, chores/quests, chat messages, coin balances, reward redemptions, photos, and notes); location data if you enable FindFam; device identifiers and anonymised usage analytics; and subscription/payment status. Payment card data is processed exclusively by Apple or Google — we never process or store it.

7.2 How we use your data. To operate, personalise, secure, and improve the Service; to deliver notifications and reminders you or your family configured; to process subscriptions and send receipts; to generate anonymised analytics; and to comply with legal obligations.

7.3 Aggregate data. We may use de-identified, aggregated data derived from Service usage (e.g., "average number of chores completed per week") for analytics, research, and product development. This data cannot reasonably be used to re-identify you or your family.

7.4 Data sharing. We do not sell your personal data. We share data only: with Supabase (our database/infrastructure and authentication provider); with third-party AI providers as described in §6.7 (Ask Fam), scoped to what's needed to generate a response; with Apple, Google, or RevenueCat for subscription processing; with a successor entity in any merger or acquisition (§7.5); and where required by law or valid legal process.

7.5 Business transfers. In any merger, acquisition, or sale of assets, your data may be transferred to the successor entity, who will remain bound to protect it under materially equivalent terms.

7.6 Security. We use industry-standard technical measures including encryption in transit and access-controlled databases at rest, and per-device end-to-end encryption for chat message content where the feature is enabled. No security measure is infallible; we cannot guarantee the Service will never experience unauthorised access. You are responsible for keeping your login credentials and device PIN/biometric lock secure.

7.7 Retention and deletion. Data is retained while your account is active. Upon account deletion, personal data is removed from active systems within 30 days; encrypted residual copies may persist in backup systems for up to 90 days before permanent deletion. A parent may delete a child's profile and its data from within the App at any time.

7.8 Your rights. You may access, correct, or delete your personal data, and your family's data, directly within the App (Settings → Profile / Family). California residents may have additional rights under the CCPA/CPRA. For any other data request, contact us through the App's support channel.

7.9 International users. The Service is operated from the United States. By using the Service you consent to your data being processed in the United States and in any country where our service providers (e.g., Supabase, our AI providers) operate.

7.10 Children's privacy (COPPA). We do not knowingly allow a child under 13 to create their own independent account outside a family a parent or guardian has set up and consented to. A parent/guardian creating a child's profile is providing the verifiable consent COPPA requires, and may review, edit, or delete that child's data at any time. If you believe a child's data was collected without appropriate parental consent, contact us through the App's support channel and we will investigate and delete it promptly.


8. ASK FAM (AI ASSISTANT)

8.1 Nature of the feature. Ask Fam is an AI-powered assistant that can answer questions and help create or manage chores, events, and other in-app items from natural-language requests. It is powered by a third-party large language model.

8.2 Not professional advice. Ask Fam is a convenience and organizational tool. It does not provide medical, legal, financial, or safety-critical advice, and nothing it generates should be treated as such. For any medical, legal, or emergency matter, consult an appropriate licensed professional or contact emergency services directly.

8.3 Accuracy. Like any AI system, Ask Fam can occasionally produce inaccurate, incomplete, or nonsensical responses ("hallucinations"). Review anything Ask Fam creates or suggests (e.g., a scheduled event, an assigned chore) before relying on it.

8.4 Data sent to the AI provider. When you use Ask Fam, the text of your request and relevant context needed to answer it (such as your family's upcoming events or chore list) is sent to our third-party AI provider to generate a response. We configure this integration so that data is used only to generate your response, not to train the provider's general-purpose models. The provider's own terms govern their handling of data in transit to and processing by their systems.

8.5 Beta features. Some AI-assisted features may be labelled beta or experimental, may have a higher error rate, and may be changed or withdrawn without notice.


9. SUBSCRIPTIONS, BILLING, REFUNDS

9.1 Subscription plans. Family Cube offers three tiers: Free (no charge), Pro, and Ultimate. Pro and Ultimate are paid subscriptions billed through the Apple App Store or Google Play Store. All purchases are governed by those platforms' own terms and refund policies. Plan features, usage limits, and pricing are described in the App.

9.2 Platform billing. All paid subscriptions are billed and managed exclusively through the Apple App Store or Google Play Store.

9.3 Auto-renewal. Subscriptions automatically renew at the then-current price unless cancelled through your device's app store settings at least 24 hours before the end of the current billing period. You may manage and cancel subscriptions through your App Store or Google Play account settings. PeopleOnTech LLC cannot cancel subscriptions or process refunds directly — that's handled by Apple/Google per their own policies.

9.4 Refunds. Refunds are handled by Apple or Google per their standard policies for in-app purchases; we do not separately process refunds outside those platforms.

9.5 Price and feature changes. We may change subscription pricing or the features/limits included in a tier going forward; changes take effect at your next renewal, and continued use after a price change constitutes acceptance of the new price. If you don't accept a change, you may cancel before the next renewal.

9.6 Service continuity. We aim for reliable uptime but do not guarantee uninterrupted service; scheduled or unscheduled downtime does not by itself entitle you to a refund or credit.


10. PROHIBITED CONDUCT

You must not: use the Service for any unlawful purpose; harass, threaten, or endanger another user, including another family member; attempt unauthorised access to any account or our systems; probe or test system vulnerabilities; interfere with or disrupt the Service; use automated tools to scrape or access the Service; reverse-engineer the App; resell or redistribute the Service; or introduce malicious code. Violation of this section may result in suspension or termination of your account.


11. DISCLAIMER OF WARRANTIES AND LIMITATION OF LIABILITY

11.1 "As is." THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, TIMELY, OR ERROR-FREE.

11.2 Limitation of liability. TO THE MAXIMUM EXTENT PERMITTED BY LAW, PEOPLEONTECH LLC IS NOT LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS COMBINED WILL NOT EXCEED THE GREATER OF (A) THE SUBSCRIPTION FEES YOU PAID US DIRECTLY (NOT THROUGH APPLE/GOOGLE) IN THE THREE MONTHS BEFORE THE CLAIM AROSE, OR (B) TEN US DOLLARS (USD $10.00).

11.3 Jurisdictional savings. Some jurisdictions do not allow certain exclusions or limitations of liability (e.g., for death, personal injury, or fraud). In those jurisdictions, our liability is limited to the minimum extent required by mandatory law; all other limitations in this Section remain in force.


12. INDEMNIFICATION

You agree to indemnify and hold harmless PeopleOnTech LLC from third-party claims arising from: your breach of these Terms; your violation of any law; or content you submitted that violates another person's rights. We will notify you of any such claim and you agree to cooperate in its defense.


13. ACCOUNT SUSPENSION & TERMINATION

13.1 By us. We may suspend or terminate an account for a clear violation of these Terms (e.g., harassment, unlawful use, security abuse). We will make reasonable efforts to notify the Account Holder of the reason, except where notice would itself create a safety or security risk.

13.2 By you. You may delete your account, or a family member's profile, via Settings at any time. §7.7 governs how quickly data is removed.

13.3 Survival. Provisions that by their nature should survive termination (including §§4.2–4.5, 7, 11, 12, 14) continue to apply after your account is closed.


14. GOVERNING LAW, ARBITRATION & CLASS WAIVER

14.1 Governing law. These Terms are governed by the laws of the State of Delaware, USA, excluding conflict-of-laws rules.

14.2 Informal resolution first. Before initiating arbitration or litigation, send written notice to us through the App's support channel describing the dispute and the relief you're seeking. We will attempt to resolve it informally within 45 days.

14.3 Arbitration. If informal resolution fails, disputes will be resolved by binding arbitration administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules, except where prohibited by mandatory law, or except that either party may bring an individual claim in small-claims court instead if it qualifies.

14.4 Class action waiver. To the extent permitted by law, disputes must be brought individually, not as a plaintiff or class member in any class, consolidated, or representative action. If this class-action waiver is found unenforceable as to a particular claim, that claim (only) may proceed in court rather than arbitration, and the rest of this Section remains in force for all other claims.

14.5 Injunctive relief. Nothing here prevents either party from seeking injunctive relief in court to prevent imminent irreparable harm (e.g., to protect intellectual property or respond to a security incident).


15. GENERAL PROVISIONS

15.1 Entire agreement. These Terms are the entire agreement between you and PeopleOnTech LLC regarding the Service.

15.2 Severability. If a provision is found invalid, it will be modified to the minimum extent necessary to make it valid, and the rest of the Terms remain in force.

15.3 No waiver. Our failure to enforce a right doesn't waive it.

15.4 Assignment. You may not assign these Terms without our written consent. We may assign or transfer our rights and obligations, including as part of a merger, acquisition, or sale of assets.

15.5 Force majeure. We're not liable for delays or failures caused by events beyond our reasonable control (e.g., natural disasters, internet infrastructure failures, third-party service outages).

15.6 Third-party services. The Service may integrate with third-party platforms (e.g., Apple, Google, our AI and infrastructure providers). We're not responsible for those third parties' own content, availability, or conduct; your use of them is governed by their own terms.

15.7 Headings. Section headings are for convenience only.

15.8 Contact. Questions about these Terms can be sent through the App's support channel.


© 2026 PeopleOnTech LLC. All rights reserved. Family Cube is a trademark of PeopleOnTech LLC.`;

export default function TermsScreen() {
  const { colors, isDark } = useTheme();
  const { acceptTermsOnly } = useAuthStore();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!accepted || loading) return;
    setLoading(true);
    try {
      // acceptTermsOnly (not acceptTerms) — this is the mid-flow terms
      // acceptance, BEFORE the user has created or joined a family.
      // acceptTerms() also stamps onboarding_completed: true, which was
      // wrong here: signing out anywhere between this screen and
      // CompleteProfileScreen's real completeOnboarding() call, then
      // signing back in, made _layout.tsx's routing see
      // onboarding_completed=true with zero family members and route
      // straight to /(tabs) — which immediately bounced back to
      // /onboarding once (tabs)/_layout.tsx's own family-check effect
      // found no members, producing a confusing blank-screen-then-
      // tutorial flash (reported live). acceptTermsOnly leaves
      // onboarding_completed false until CompleteProfileScreen's
      // completeOnboarding() actually runs at the true end of the flow.
      await acceptTermsOnly();
      router.replace('/onboarding/family-choice');
    } catch (e: any) {
      // Was a silent no-op catch — a failed write (RLS denial, network
      // error) left the user staring at an unresponsive Accept button
      // with no explanation, and terms_accepted never actually got set,
      // so the next app launch routed straight back to /onboarding even
      // though the user believed they'd already completed it (reported:
      // "completed onboarding multiple times, still asking").
      console.error('[TermsScreen] acceptTermsOnly failed:', e?.message, e);
      showAlert('Something went wrong', e?.message ?? 'Could not save your acceptance. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>

        {/* Back */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <BackButton onPress={() => router.replace('/onboarding')} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconBadge, { backgroundColor: isDark ? '#1E1535' : '#EDE9FC' }]}>
            <Ionicons name="document-text-outline" size={24} color="#7C5CBF" />
          </View>
          <Text style={[s.title, { color: colors.textPrimary }]}>Terms & Conditions</Text>
          <Text style={[s.sub, { color: colors.textSecondary }]}>
            Please read and accept our terms before continuing.
          </Text>
        </View>

        {/* Scrollable content */}
        <View style={[s.card, { backgroundColor: isDark ? '#1A1230' : '#F9F7FF', borderColor: isDark ? '#2D2450' : '#E2D9FA' }]}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[s.content, { color: colors.textSecondary }]}>{TERMS_CONTENT}</Text>
          </ScrollView>
        </View>

        {/* Accept checkbox */}
        <TouchableOpacity
          style={s.checkRow}
          onPress={() => setAccepted(!accepted)}
          activeOpacity={0.7}
        >
          <View style={[
            s.checkbox,
            {
              borderColor: accepted ? colors.primary : (isDark ? '#4A3D70' : '#C4B8F0'),
              backgroundColor: accepted ? colors.primary : 'transparent',
            },
          ]}>
            {accepted && <Ionicons name="checkmark" size={14} color="white" />}
          </View>
          <Text style={[s.checkLabel, { color: colors.textPrimary }]}>
            I have read and agree to the{' '}
            <Text style={{ color: colors.primaryText ?? colors.primary, fontWeight: '600' }}>Terms & Conditions</Text>
          </Text>
        </TouchableOpacity>

        {/* CTA */}
        <TouchableOpacity
          style={[s.btn, { backgroundColor: accepted ? colors.primary : (isDark ? '#2D2450' : '#D9CEFF'), opacity: loading ? 0.7 : 1 }]}
          onPress={handleAccept}
          disabled={!accepted || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={[s.btnTxt, { color: accepted ? 'white' : (isDark ? '#5A4D80' : '#9370E0') }]}>
                Accept & Continue
              </Text>
          }
        </TouchableOpacity>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: 'center', paddingTop: 16, paddingBottom: 16, gap: 8 },
  iconBadge: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: TYPO.title, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: TYPO.body, textAlign: 'center', lineHeight: 20 },
  card: { flex: 1, borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  scroll: { flex: 1 },
  scrollContent: { padding: 18 },
  content: { fontSize: TYPO.body, lineHeight: 21 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontSize: TYPO.body, lineHeight: 20 },
  btn: { paddingVertical: 16, borderRadius: 18, alignItems: 'center', marginBottom: 8 },
  btnTxt: { fontSize: TYPO.subheading, fontWeight: '700', letterSpacing: 0.2 },
});

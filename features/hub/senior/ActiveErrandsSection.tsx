import { View, Text, Pressable } from 'react-native';
import { ShoppingCart, CheckCircle2, Camera, Clock, X } from 'lucide-react-native';
import { BRAND } from '@/components/FamilyCubeLogo';
import { GP } from './seniorTheme';
import type { ChoreTask } from '@/store/choreStore';

// My active errands (GP claimed, in progress) — buy supplies, then submit
// receipt for reimbursement.
//
// Scenario 4.2/4.6 — "Done · Submit Receipt" always opened the receipt
// modal, whose Send button was disabled until a photo or amount was
// entered ("At least a photo or amount is required") — there was no way to
// mark a plain errand (no money involved) done at all without attaching
// receipt data it doesn't have. "Just Done — No Receipt" is the missing
// no-money path: it calls submitGPErrandReceipt with no receipt fields,
// which now auto-completes and pays out instantly instead of routing to
// pending_approval (see choreStore.ts's submitGPErrandReceipt).
export function ActiveErrandsSection({ errands, onOpenReceiptModal, onMarkDoneNoReceipt, colors, isDark }: {
  errands: ChoreTask[];
  onOpenReceiptModal: (choreId: string) => void;
  onMarkDoneNoReceipt: (choreId: string) => void;
  colors: any; isDark: boolean;
}) {
  if (errands.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ShoppingCart size={14} color={BRAND.teal} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: BRAND.teal,
          textTransform: 'uppercase', letterSpacing: 0.8 }}>My Active Errands</Text>
      </View>
      {errands.map(c => (
        <View key={c.id} style={{ borderRadius: 16, borderWidth: 1.5,
          borderColor: BRAND.teal + '40',
          backgroundColor: isDark ? BRAND.teal + '10' : '#ECFDF5',
          overflow: 'hidden' }}>
          <View style={{ backgroundColor: BRAND.teal, paddingHorizontal: 14, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={16} color="#fff" />
            <Text style={{ flex: 1, fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
              {c.title}
            </Text>
            <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>In Progress</Text>
            </View>
          </View>
          {c.description ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{c.description}</Text>
            </View>
          ) : null}
          <View style={{ margin: 12, gap: 8 }}>
            <Pressable
              onPress={() => onOpenReceiptModal(c.id)}
              style={{ backgroundColor: BRAND.teal, borderRadius: 12,
                paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
                justifyContent: 'center', gap: 8 }}>
              <CheckCircle2 size={16} color="#fff" />
              <Text style={{ fontSize: GP.body, fontWeight: '900', color: '#fff' }}>
                Done · Submit Receipt
              </Text>
              <Camera size={16} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => onMarkDoneNoReceipt(c.id)}
              style={{ borderRadius: 12, paddingVertical: 11, alignItems: 'center',
                borderWidth: 1.5, borderColor: BRAND.teal + '50' }}>
              <Text style={{ fontSize: GP.sub, fontWeight: '800', color: BRAND.teal }}>
                Just Done — No Receipt Needed
              </Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

// Scenario 1.6 — an offer this GP made ("I'll Handle It") that's still
// waiting on a parent to Accept/Decline. Same visual shell as the errands
// above (amber instead of teal — "waiting," not "in progress yet") with a
// single Withdraw action, since the GP can retract before the parent acts.
export function PendingOffersSection({ offers, onWithdraw, colors, isDark }: {
  offers: ChoreTask[];
  onWithdraw: (choreId: string) => void;
  colors: any; isDark: boolean;
}) {
  if (offers.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Clock size={14} color={BRAND.amber} />
        <Text style={{ fontSize: GP.sub, fontWeight: '800', color: BRAND.amber,
          textTransform: 'uppercase', letterSpacing: 0.8 }}>My Offers — Waiting on Parent</Text>
      </View>
      {offers.map(c => (
        <View key={c.id} style={{ borderRadius: 16, borderWidth: 1.5,
          borderColor: BRAND.amber + '40',
          backgroundColor: isDark ? BRAND.amber + '10' : '#FFFBEB',
          overflow: 'hidden' }}>
          <View style={{ backgroundColor: BRAND.amber, paddingHorizontal: 14, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#fff" />
            <Text style={{ flex: 1, fontSize: GP.sub, fontWeight: '900', color: '#fff' }}>
              {c.title}
            </Text>
            <View style={{ backgroundColor: '#fff3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: GP.tiny, fontWeight: '800', color: '#fff' }}>Offer Sent</Text>
            </View>
          </View>
          {c.description ? (
            <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              <Text style={{ fontSize: GP.sub, color: colors.textSecondary }}>{c.description}</Text>
            </View>
          ) : null}
          <View style={{ paddingHorizontal: 14, paddingTop: 8 }}>
            <Text style={{ fontSize: GP.tiny, color: colors.textSecondary }}>
              Waiting on a parent to accept before you can start.
            </Text>
          </View>
          <Pressable
            onPress={() => onWithdraw(c.id)}
            style={{ margin: 12, backgroundColor: 'transparent', borderRadius: 12,
              borderWidth: 1.5, borderColor: colors.danger + '50',
              paddingVertical: 11, alignItems: 'center', flexDirection: 'row',
              justifyContent: 'center', gap: 6 }}>
            <X size={14} color={colors.danger} />
            <Text style={{ fontSize: GP.body, fontWeight: '800', color: colors.danger }}>
              Withdraw Offer
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

# FamilyCubeApp Conventions

Architecture principles and UI/UX patterns learned from this project. Adhering to these ensures consistency, predictability, and maintainability across features.

---

## 1. Architecture Principles

### Component Organization

**Rule: New components always go inside their own module's `components/` subfolder — never directly in a screen file or at the top level.**

- Each feature (e.g., `/features/hub/`) has a `/components/` subdirectory
- Modals, cards, sheets, and helper components live here
- The screen file (`HubScreen.tsx`, `KidView.tsx`) imports and composes them
- Example structure:
  ```
  features/hub/
    ├── HubScreen.tsx           (main screen, composes views)
    ├── KidView.tsx             (kid-facing view, composes sub-components)
    ├── ParentView.tsx
    ├── components/
    │   ├── KidModals.tsx       (GroceryModal, SuppliesModal, AskModal)
    │   ├── HelpDispatchQueue.tsx
    │   └── hubComponents.tsx   (smaller presentational pieces)
  ```

### Modal Shell Pattern (EventFormModal Equivalent)

**All modals follow this exact structure:**

```
Modal > KeyboardAvoidingView > 
  (flex: 1 backdrop View with flex:1 dismiss TouchableOpacity above) >
    sheet View >
      fixed header (outside ScrollView) >
      ScrollView (keyboardShouldPersistTaps="always") >
        form fields + suggestion chips (always visible)
```

**Critical details:**
1. **Dismissible backdrop**: The entire flex:1 area above the sheet is a `TouchableOpacity` with `activeOpacity={1}` and `onPress={dismiss}`
2. **Fixed header**: Never inside ScrollView. Stays in place while content scrolls. Contains title, close button, and optional secondary text.
3. **Suggestions always visible**: Never gate suggestions on `onFocus`/`onBlur` state. They must persist so `onPress` fires before `onBlur` hides them.
4. **KeyboardAvoidingView**: Wraps the whole structure with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`

**Example** (from KidModals.tsx):
```tsx
<Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <View style={f.backdrop}>
      {/* Tap above sheet to dismiss */}
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={dismiss} />
      
      <View style={[f.sheet, { backgroundColor: colors.card }]}>
        {/* Handle bar */}
        <View style={[f.handle, { backgroundColor: colors.border }]} />
        
        {/* Fixed header — outside ScrollView */}
        <View style={f.header}>
          <View style={{ flex: 1 }}>
            <Text style={[f.title, { color: colors.textPrimary }]}>Title</Text>
          </View>
          <TouchableOpacity onPress={dismiss}>
            <Text>✕</Text>
          </TouchableOpacity>
        </View>
        
        {/* Scrollable form */}
        <ScrollView keyboardShouldPersistTaps="always">
          {/* Input fields */}
          <TextInput ... />
          
          {/* Suggestions — ALWAYS visible, never gated */}
          {suggestions.length > 0 && (
            <ScrollView horizontal keyboardShouldPersistTaps="always">
              {suggestions.map(s => (
                <TouchableOpacity key={s} onPress={() => handleSelect(s)}>
                  {/* suggestion chip */}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </ScrollView>
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>
```

### Suggestion Chips

**Rules for suggestion/quick-pick chips:**

1. **Always use TouchableOpacity, never Pressable** — Pressable with `delayLongPress` can interfere with keyboard dismissal
2. **Both ScrollViews need `keyboardShouldPersistTaps="always"`** — Vertical AND horizontal
3. **Never gate on focus state** — Suggestions exist whether input is focused or blurred
4. **Selection logic inside onPress** — When user taps a chip, the TextInput's `onBlur` may fire after or before `onPress`. Always ensure `onPress` happens first by using direct state update, not relying on TextInput state

**Example** (from KidModals.tsx GroceryModal):
```tsx
<ScrollView 
  horizontal 
  showsHorizontalScrollIndicator={false} 
  keyboardShouldPersistTaps="always"  // ← Critical
>
  <View style={{ flexDirection: 'row', gap: 7 }}>
    {nameSuggestions.map(s => (
      <TouchableOpacity  // ← Never Pressable
        key={s.name} 
        onPress={() => { setName(s.name); setCat(s.category); }}  // ← Direct state update
        style={[f.pill, { backgroundColor: ... }]}
      >
        <Text>{s.emoji}</Text>
        <Text>{s.name}</Text>
      </TouchableOpacity>
    ))}
  </View>
</ScrollView>
```

### Theme & Color Management

**Rule: Components get `useTheme()` internally — no colors or isDark props passed from parent.**

- Every component that needs colors calls `const { colors, isDark } = useTheme()` directly
- Parent screens do NOT pass `colors` or `isDark` as props
- Exception: Leaf components that are too small (e.g., icon helpers) can receive a single `color` prop for flexibility

**Example**:
```tsx
// GOOD: Component fetches its own theme
export function KidModals({ visible, onClose, active }: Props) {
  const { colors, isDark } = useTheme();  // ← Fetch here
  // ...
}

// BAD: Don't do this
<KidModals visible={...} colors={colors} isDark={isDark} />
```

### Encoding Helpers

**Rule: Encoding/decoding helpers live in the modal file and are re-exported from the parent view.**

When a request type needs custom serialization (e.g., grocery items as JSON strings):

1. Define the prefix constant and encoder/decoder functions in the **modal file** (e.g., `KidModals.tsx`)
2. Export them from the modal file
3. Import and re-export them from the parent view (e.g., `KidView.tsx`)
4. Import from the view in screens that need them (e.g., `HelpDispatchQueue.tsx`)

**Example**:
```tsx
// KidModals.tsx
export const GROCERY_PREFIX = 'GROCERY_REQUEST:';
export const SUPPLIES_PREFIX = 'SUPPLIES_REQUEST:';

export function encodeGroceryRequest(p: { name, qty, category, notes }) {
  return `${GROCERY_PREFIX}${JSON.stringify(p)}`;
}
export function decodeGroceryRequest(detail: string): { ... } | null {
  if (!detail.startsWith(GROCERY_PREFIX)) return null;
  try { return JSON.parse(detail.slice(GROCERY_PREFIX.length)); } catch { return null; }
}

// KidView.tsx — re-export
export { GROCERY_PREFIX, SUPPLIES_PREFIX, encodeGroceryRequest, decodeGroceryRequest } from './KidModals';

// HelpDispatchQueue.tsx — import from view
import { GROCERY_PREFIX, decodeGroceryRequest } from './KidView';
```

### Request Flow

**Kid sends → Parent approves path:**

1. **Kid initiates** via `kidRequestStore.sendRequest()` with:
   - `type`: 'delegation', 'tutor', 'ride', 'permission', 'question', 'medication', etc.
   - `fromMemberId`: active kid's ID
   - `urgency`: 'normal', 'soon', 'urgent'
   - `detail`: request description (may be encoded for structured types like grocery)
   - `status`: 'pending' (default) or 'approved' if parent pre-approves

2. **Parent sees** pending requests in `HelpDispatchQueue.tsx` card with three states:
   - **Pending**: Parent can decline, self-assign, or assign to another helper
   - **Assigned (Approved)**: Parent can reassign or mark complete
   - **Completed**: Shows last 3 for history

3. **Approval side-effects** (in `HelpDispatchQueue.tsx`):
   - Grocery/supplies requests auto-add items to `groceryStore` on approval
   - Delegation requests trigger store state updates
   - Coins/rewards are processed on completion

**Important**: All request logic flows through `kidRequestStore` actions, not direct UI state.

---

## 2. Button Actions Per Role and Request Type

### Overview by Request Type

| Request Type | Who Sends | Who Approves | Storage | Reward |
|---|---|---|---|---|
| `delegation` | Kid (grocery/supplies) | Parent | groceryStore | Optional coins |
| `tutor` | Kid or Parent | Parent/AI | kidRequestStore | Coins (10-50) |
| `ride` | Kid | Parent | kidRequestStore | None |
| `question` | Kid | Parent (notification only) | kidRequestStore | None |
| `permission` | Kid | Parent (notification only) | kidRequestStore | None |
| `checkin` | Kid | Parent (notification only) | kidRequestStore | None |
| `medication` | Kid | Parent (urgent) | kidRequestStore | None |
| `cheer` | Kid/Parent | Parent | kidRequestStore | Coins (15) |
| `emergency` | Kid | Parent (urgent) | kidRequestStore | None |

---

## 2.1 Kid View Actions

**File: `/features/hub/KidView.tsx`**

### Hero Card (Upper Section)

Quick-access buttons for common check-ins and requests.

| Button | Action | Function | Result |
|---|---|---|---|
| **I'm Home** 🏠 | Tap | `sendCheckin('home')` | Sends notification to parent: "I'm home! 🏠" |
| **I'm Ready** 🎒 | Tap | `sendCheckin('ready', eventTitle)` | Sends notification: "I'm ready for pickup!" (includes event name if confirmed ride) |
| **Running Late** 🏃 | Tap | `sendCheckin('late', eventTitle)` | Sends notification: "Running late for [event]" with urgency 'soon' |
| **Grocery** 🛒 | Tap | `setGroceryModal(true)` | Opens GroceryModal (see below) |

**Note**: All check-ins use `sendRequest({ type: 'checkin', ... })` and send broadcast chat message to family.

---

### Tab Pills (4 Tabs)

#### Tab: Quests 🏆

Displays active, review, and declined quests. Pool quests (bounty) at bottom.

| Element | Action | Function | Result |
|---|---|---|---|
| **Pool Quest Card** | Tap button | `claimQuest(questId, kidId)` | Claims quest, quest status → 'claimed', becomes "my" quest |
| **Claimed Quest** | Tap button | `submitQuest(questId)` | Starts quest (status → 'in_progress'), button changes to "Mark Done" |
| **In-Progress Quest** | Tap button | `submitQuest(questId)` | Submits for parent review (status → 'pending_approval'); if photo required, captures before submit |
| **Pending Review** | — | — | Shows as "pending" badge with coin amount; no action available |
| **Declined Quest** | Tap "Try Again" | `reopenQuest(questId, kidId)` | Resets status → 'todo', kid can resubmit |
| **"Open Family Chat"** | Tap | Navigate to chat screen | Direct to family chat channel |

**Ride/Pickup Status** (appears in this tab):
- **Confirmed ride banner** (green): Shows driver name, event, countdown timer
- **Ride Late Alert** (red): If confirmed ride time passed, shows "Driver hasn't arrived" button → `sendDriverLate(event)` → sends urgent notification + broadcast chat message
- **Pending ride** (amber): Shows "Waiting: [event]" with "Parent confirming..." text
- **Declined ride** (red): Shows "Ride declined: [event]" with "Tap to nudge" → `nudgeParent()` → sends urgent 'ride' request to get new driver

#### Tab: Schedule 📅

Calendar view of today's and upcoming events.

| Element | Action | Function | Result |
|---|---|---|---|
| **Today's Event Row** | Tap | Navigate to full calendar | Opens calendar detail screen |
| **Driver Late Alert** (red button on event) | Tap | `sendDriverLate(event)` | Same as hero card late alert |
| **Full Calendar Link** | Tap | Navigate to calendar screen | Opens full calendar view |
| **Upcoming Events List** | Tap event | Navigate to calendar | Shows next 3-5 events |
| **Quick Links (Quests / Grocery / Chat / Store)** | Tap | Navigation or sheet open | Jump to that feature |

#### Tab: Piggy Bank 🐷

Shows earned coins, cash conversion rate, and goal progress.

| Element | Action | Function | Result |
|---|---|---|---|
| **Coin Total Display** | — | Display only | Shows main coins + GP bonus (if any) |
| **"Almost There" Progress Cards** | Tap | Navigate to store | Shows rewards almost affordable; tap to go to store |
| **Stats (Done Today, Streak, Level)** | — | Display only | Shows today's completed quests, fire streak, current level |
| **Cash-Out Info** | — | Display only | "10 coins = $1.00 real allowance" + "Ask at Friday Family Dinner" |

#### Tab: Rewards 🎁

Shows affordable and soon-affordable rewards.

| Element | Action | Function | Result |
|---|---|---|---|
| **Affordabe Reward Card** | Tap "Redeem" button | Alert confirm → `redeemReward(rewardId, kidId)` | Deducts coins, processes redemption in store |
| **"Almost There" Reward Card** | — | Display only | Shows progress bar and "Need X more 🪙" |
| **"All Rewards" Link** | Tap | Navigate to store | Opens full rewards screen |
| **Empty State** | Tap "Go do Quests" | Set kidTab → 'quests' | Switch to quests tab |

---

### Ask Parent Bar (Below Tabs)

Quick-access request modals for common ask types.

| Button | Icon | Modal | Request Type | Sends Via |
|---|---|---|---|---|
| **Permission** 🔓 | Purple | AskModal | 'permission' | `sendRequest({ type: 'permission', ... })` |
| **Question** ❓ | Purple | AskModal | 'question' | `sendRequest({ type: 'question', ... })` |
| **Supplies** 📚 | Indigo | SuppliesModal | 'delegation' | `sendRequest({ type: 'delegation', detail: SUPPLIES_PREFIX... })` |
| **Grocery** 🛒 | Teal | GroceryModal | 'delegation' | `sendRequest({ type: 'delegation', detail: GROCERY_PREFIX... })` |
| **Meds** 💊 | Red | AskModal | 'medication' | `sendRequest({ type: 'medication', urgency: 'urgent', ... })` |

---

## 2.2 Modal Actions (Kid-Initiated Requests)

**File: `/features/hub/KidModals.tsx`**

All modals live here. They share the same shell pattern (Modal > KAV > backdrop > sheet).

### GroceryModal 🛒

Kid requests a single grocery item for parent approval.

| Field | Input Type | Behavior |
|---|---|---|
| **Item Name** (required) | TextInput + horizontal scroll suggestions | Always shows top 20 matching items; tap chip fills field + auto-sets category |
| **Quantity** (optional) | TextInput + horizontal scroll quick-picks | Suggestions: "1", "2", "3", "6", "1 pack", "1 box", "1 bag", "1 bottle", "1 dozen", "1 lb" |
| **Category** (pre-set to Snacks, Produce, etc.) | Horizontal scroll category pills | 8 categories: Snacks, Produce, Dairy & Eggs, Pantry, Frozen, Bakery, Household, Other |
| **Note for parent** (optional) | TextInput (multiline) | e.g. "the blue pack, not red" |

**Action:**
- Tap "Send to Parent for Approval" → 
  - `sendRequest({ type: 'delegation', fromMemberId: active.id, urgency: 'normal', detail: encodeGroceryRequest({ name, qty, category, notes }) })`
  - Alert: "Request sent! 🛒 '[item]' sent to parent for approval"
  - Modal closes, fields reset

---

### SuppliesModal 📚

Kid requests multiple school supplies.

| Field | Input Type | Behavior |
|---|---|---|
| **Urgency** (Normal vs Soon) | Two buttons | Normal (📋 No Rush) or Soon (🔴 Need Soon) — affects parent notification priority |
| **Items** (minimum 1 row) | Dynamic rows: name + qty TextInputs | Per-row filtered suggestions; can add/remove rows |
| **+ Add Item button** | Dashed border button | Adds empty row to items list |
| **Note for parent** (optional) | TextInput (multiline) | e.g. "for science project due Friday" |

**Action:**
- Tap "Send to Parent" → 
  - `sendRequest({ type: 'delegation', fromMemberId: active.id, urgency, detail: SUPPLIES_PREFIX + JSON.stringify({ items: validItems, notes, urgency }) })`
  - Alert: "Sent! 📚 '[X] items' sent to parent for approval"
  - Modal closes, fields reset

---

### AskModal (Permission / Question / Medication) ❓ 🔓 💊

Three variants, same modal. Used for asking parent quick questions, permissions, or medication alerts.

| Type | Emoji | Accent Color | Urgency | Use Case |
|---|---|---|---|---|
| **permission** | 🔓 | Purple | normal | "Can I go to Jake's house?" |
| **question** | ❓ | Blue | normal | "Can you bring money for field trip?" |
| **medication** | 💊 | Red | **urgent** | "I didn't take my morning pill" |

| Field | Input | Behavior |
|---|---|---|
| **Header** | Display only | Emoji + "Ask Permission" / "Ask a Question" / "Medication Alert" |
| **Subtitle** | Display only | "[Type] — Sent directly to your parent" |
| **Message** (required) | TextInput (multiline, 4 lines) | e.g. "Can I go to Jake's house?" / "I didn't take my morning pill" |
| **Hint text** | Placeholder | Type-specific hints in placeholder |

**Action:**
- Tap "Send to Parent" → 
  - `sendRequest({ type: requestType, fromMemberId: active.id, detail: text.trim(), urgency: type === 'medication' ? 'urgent' : 'normal' })`
  - Alert: "Sent! 👋 Your parent has been notified"
  - Modal closes, field resets
  - **Medication always sends as urgent** to ensure parent sees it immediately

---

## 2.3 Parent/Senior View Actions

**File: `/features/hub/HelpDispatchQueue.tsx`**

Parent sees all pending kid requests in three states: Pending → Assigned → Completed.

### Pending Requests (Yellow Card)

Kid has just asked for help; parent must decide: decline, self-assign, or assign to helper.

#### Header Row

| Element | Display |
|---|---|
| **Requester Name** | "🙋 [Kid Name] needs help:" |
| **Request Type Badge** | e.g. "🛒 Grocery", "📚 Supplies", "❓ Question" |
| **Urgency Badge** (if urgent) | "🔴 Urgent" (red) |
| **Coin Reward** (if applicable) | "+[X] 🪙" badge (amber) |

#### Parent Action Row

Two sections: **Decline Panel** (collapsible) and **Assign Section** (visible when decline closed).

##### Decline Button & Panel

| Button | Action | Result |
|---|---|---|
| **❌ Decline Request** | Tap | Toggles decline panel open/closed |

**Decline Panel** (appears when open):
- **Preset decline reasons** (4 pills): "Kid playing with system" / "Do homework first" / "Ask again after chores" / "Parents busy right now"
- **Custom reason input** (TextInput, max 150 chars) | Tap preset to select, or type custom reason
- **Character counter** | Shows "X/150 chars"
- **Cancel button** | Closes panel without declining
- **Confirm Decline button** | Calls `declineRequest(id, activeMemberId, reason)` → status → 'declined', reason stored, parent notification sent

##### Assign Section (When Decline Closed)

| Button | Action | Function | Result |
|---|---|---|---|
| **⚡ Self-Assign ([Parent Name])** | Tap | `doSelfAssign(id)` → `assignRequest(id, activeMemberId, note)` | Assigns to self; auto-adds grocery items to list if delegation; status → 'approved' |
| **Assign Helper Dropdown + Assign Button** | Tap dropdown to select | `doAssignHelper(id, helperId)` | Opens list of adults (parents, seniors) + AI Tutor option; when selected + Assign tapped, assigns request to helper |
| **Note for Helper** (optional textarea) | Type | Shows only when assigning to someone else | Max 150 chars; displays in the assigned card for helper context |

**Note**: Grocery/supplies requests trigger `handleGroceryApproval()` → items auto-added to `groceryStore` with "Approved by [parent] · Requested by [kid]" note.

---

### Assigned / In-Progress Requests (Purple Card)

Parent has assigned the request. Helpers can see it, and parent can reassign or mark complete.

#### Display Row

| Element | Display |
|---|---|
| **Requester Name** | "🤝 [Kid Name]'s Request" |
| **Status Badge** | "In Progress" (purple) |
| **Request Detail** | "[Kid]'s request description" |
| **Parent Note** (if exists) | "📝 Note: '[parent's reason]'" (purple box) |

#### Action Row

| Element | Action | Function | Result |
|---|---|---|---|
| **✓ Mark Completed** (green button) | Tap | `doComplete(id)` → `completeRequest(id, activeMemberId)` | Only visible if: parent, assigned helper, or requester kid tapped it; status → 'completed'; coins awarded; celebratory alert |
| **Assigned Helper Display** | Show | "Assigned: [Helper Name]" (with checkmark icon) | Informational; shows who's handling it |
| **Reassign Tutor Section** (parent-only) | — | — | Only parents see this when assigned |

##### Reassign Tutor Section (Parent-Only)

Appears below assigned helper info when parent is viewing. Same pattern as initial assignment:

| Element | Action | Function | Result |
|---|---|---|---|
| **Reassign Helper Dropdown + Reassign Button** | Tap dropdown, select, tap Reassign | `doAssignHelper(id, newHelperId)` | Swaps assigned helper; status stays 'approved'; helper notified |
| **Note for New Helper** (optional) | Type (max 150 chars) | Shows only when selecting a different helper | Context for why reassigning |

---

### Completed Requests (Green Banner)

Shows last 3 completed requests for audit trail.

| Element | Display |
|---|---|
| **Checkmark Icon** | "✓" in green circle |
| **Request Summary** | "✓ [Kid Name]: '[request description]'" (green text, strikethrough) |
| **Helper Tag** | "✓ Helper: [Helper Name]" (right-aligned, green) |

---

## 2.4 Grocery Management Actions

**File: `/features/grocery/GroceryScreen.tsx`**

Collaborative grocery list and shopping runs. Two tabs: "Shopping List" and "Runs".

### Header Buttons

| Button | Icon | Action | Result |
|---|---|---|---|
| **✨ AI** | Sparkle | Tap | Toggles AI Panel (CubeAI suggestions) in/out of view |
| **🏷️ Prices** | Price tag | Tap | Calls `checkPrices()` → fetches Kroger live prices (or estimates) for all items; changes to "Prices ✓" with green check when loaded |
| **🛒 New Run** | Shopping cart | Tap | Opens CreateRunSheet to start a new shopping run |

### List Tab (Shopping List)

#### AI Panel (Collapsible, Inline)

Shows inside the scrollable list when toggled on.

| Element | Action | Function | Result |
|---|---|---|---|
| **Quick Prompts** (horizontal) | Tap | `runAiGenerate(promptText)` | e.g. "Weekly staples", "Healthy breakfast"; generates suggestions |
| **Prompt Input + Go Button** | Type + Tap Go | `runAiGenerate(userText)` | Custom prompt → AI suggestions list |
| **Suggestion Chips** | Tap chip | Toggles checkbox state | Pre-selected by default (unchecked if duplicate) |
| **Edit Icon** (pencil) on chip | Tap | Inline edit name/qty fields | Edit suggested item before adding |
| **Delete Icon** (trash) on chip | Tap | Remove from suggestions | Deletes from this suggestion set (doesn't affect store) |
| **Add [N] Items Button** (green) | Tap | `handleAdd()` → `addItem()` for each selected | Batch-adds all selected suggestions to list |

#### School Supplies Section (If Present)

Separate subsection showing items approved from kid requests (category = "School Supplies").

| Row | Action | Function | Result |
|---|---|---|---|
| **Supplies Item Checkbox** | Tap | `buyItem(itemId, activeMemberId)` | Marks item as bought (strikes through, opacity 0.45) — only if not kid |
| **Item Detail** (long-press) | Long-press | Stores selection state, enters "multi-select" mode | Selected items get checkmark overlay |

#### Grocery Items by Store (Grouped Sections)

Main list grouped by store preference (Costco, Walmart, "Any store", etc.).

| Row | Action | Function | Result |
|---|---|---|---|
| **Item Checkbox** | Tap (if selecting) | Toggles multi-select state | Enters bulk-select mode |
| **Item Row** | Tap (if not selecting) | `setDetailItem(item)` | Opens ItemDetailSheet (modal) |
| **Item Row** | Long-press | Enters multi-select mode | Selected items highlighted |
| **Price Display** (right side) | — | Shows Kroger price (green) or estimate (amber) | Informational; shows source |
| **Item Checkmark Button** (right) | Tap | `handleBuyItem(item)` → Alert confirm → `buyItem(itemId, memberId)` | Marks as bought |

#### ItemDetailSheet (Modal for Single Item)

Tapping an item opens a modal showing full details.

| Element | Action | Function | Result |
|---|---|---|---|
| **Edit Button** | Tap | `setEditingItem(item)` → open AddItemSheet | Edit this item's name, qty, category, store, notes |
| **Mark Bought Button** (green) | Tap | `handleBuyItem(item)` | Marks as bought and closes modal |
| **Delete Button** (red trash) | Tap | Confirm alert → `removeItem(itemId)` | Deletes item from list |

#### AddItemSheet (Add/Edit Modal)

Appears when user taps FAB (+) or Edit on an item.

| Field | Action | Function | Result |
|---|---|---|---|
| **Item Name** (TextInput) | Type | Autofocus when sheet opens | Required field |
| **Quantity** | Type | Optional; e.g. "2 kg" | Stored in item record |
| **Store Preference** | Type | Optional; e.g. "Costco" | Helps group items |
| **Category** (horizontal pills) | Tap pill | Toggle selection; single-select | 15 categories: Produce, Dairy, Grains, etc. |
| **Notes** | Type (multiline) | Optional; e.g. "get organic one" | Max length guidance |
| **Add to List Button** (green) | Tap | `handleSave()` → `addItem({...})` or update if editing | Creates/updates item and closes sheet |

### Runs Tab (Shopping Sessions)

Shows active, draft, and completed shopping runs.

#### RunCard (List Item)

Each shopping run is a card showing status and details.

| Element | Action | Function | Result |
|---|---|---|---|
| **Run Card** | Tap card | `setSelectedRun(run)` | Opens RunDetailSheet (live checkout modal) |
| **Trash Icon** (red, on non-active runs) | Tap | Alert confirm → `deleteRun(runId)` | Deletes draft or completed run |
| **Status Badge** | — | "DRAFT" / "LIVE" / "DONE" | Informational |
| **Active Pulse Animation** | — | Animated border pulsing | Only on active runs |

#### RunDetailSheet (Modal for Active/Draft Run)

Appears when user taps a run card. Shows items, progress bar, and live check-off.

| Sub-Tab | Content | Actions |
|---|---|---|
| **List Tab** | Items in this run | Tap item to toggle ✓ (checked/unchecked); remove item from run |
| **+ Add Tab** | Pool items not yet in run | Tap "+ Add" to add items from family list to this run |
| **🧾 Receipt Tab** | Upload & analyze receipt | Tap to pick receipt image; AI analyzes and shows line items + total |

**Header:**
- Run name, status badge, store
- Progress bar: "[X] of [Y] items"

**Item Actions (List Tab):**

| Element | Action | Function | Result |
|---|---|---|---|
| **Checkbox** | Tap | `toggleCheck(item)` → `checkRunItem()` or `uncheckRunItem()` | Marks item as picked (✓ checked, strikethrough) |
| **Remove Button** (X icon) | Tap | `removeItemFromRun(runId, itemId)` | Removes item from this run (stays in pool) |

**Bottom Actions (Draft/Active Only):**

| Button | Action | Visible When | Result |
|---|---|---|---|
| **🛒 Start Shopping** | Tap | Status is 'draft' | `startRun(runId, memberId)` → status → 'active' |
| **✅ Complete Run** | Tap | Status is 'active' AND ≥1 items checked | Alert confirm → `completeRun(runId)` → status → 'done'; modal closes |

**Receipt Analysis (Receipt Tab):**

| Element | Action | Function | Result |
|---|---|---|---|
| **Upload Receipt Button** | Tap | `pickReceipt()` → file picker | Selects image from library |
| **Receipt Preview** | — | Shows picked image | Informational |
| **Analyze Button** (shown during analysis) | — | `analyzeReceipt(base64)` → calls AI | Shows AI-extracted line items + total |
| **Upload Different Receipt** | Tap | Clears receipt, allows new pick | Replaces current receipt image |

---

## Summary of Store/Action Calls

All state changes route through specific store methods:

| Store | Key Methods |
|---|---|
| `kidRequestStore` | `sendRequest()`, `assignRequest()`, `completeRequest()`, `declineRequest()`, `cancelRequest()` |
| `groceryStore` | `addItem()`, `buyItem()`, `removeItem()`, `createRun()`, `startRun()`, `completeRun()`, `checkRunItem()`, `uncheckRunItem()`, `addItemToRun()`, `removeItemFromRun()` |
| `questStore` | `submitQuest()`, `claimQuest()`, `reopenQuest()` |
| `rewardStore` | `redeemReward()` |
| `familyStore` | `activeMemberId`, `members` (read-only for this screen) |

**No direct state manipulation**. All business logic flows through store actions.

---

## Design Patterns Summary

| Pattern | Location | Purpose |
|---|---|---|
| **Modal Shell** | KidModals.tsx, GroceryScreen.tsx | Consistent mobile sheet UX (fixed header, scrollable body) |
| **Suggestion Chips** | KidModals.tsx, GroceryScreen.tsx | Always-visible quick-picks to speed up input |
| **Encoding Helpers** | KidModals.tsx (export), KidView.tsx (re-export) | Serialize structured requests (grocery, supplies) as JSON strings |
| **Multi-Tab Layout** | KidView.tsx, GroceryScreen.tsx | Swappable content sections in tab bar |
| **Request Dispatch Flow** | HelpDispatchQueue.tsx | Three-stage pipeline: Pending → Assigned → Completed |
| **Real-Time Subscriptions** | GroceryScreen.tsx (RunDetailSheet) | Live updates to run items when other users check off items |
| **Batch Actions** | GroceryScreen.tsx (grocery list) | Multi-select mode for bulk buying/editing |
| **Location-Aware Pricing** | GroceryScreen.tsx | Fetches regional Kroger prices; falls back to estimates |

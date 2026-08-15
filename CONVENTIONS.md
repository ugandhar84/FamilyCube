# FamilyCube Conventions

## Architecture Principles

### Component Organization
- **New components must always live inside their own module's `components/` subfolder** — never inline in a screen file or at the app root level
- Components are co-located with their parent screen for easier maintenance and to encourage single-responsibility design
- Example: `features/grocery/components/ReceiptScanSheet.tsx`, `features/grocery/components/SmartRestockBanner.tsx`

### Modal Structure (EventFormModal Shell Pattern)
All modals follow this consistent structure:
```
Modal (visible, animationType="slide", transparent)
  ↓
KeyboardAvoidingView (behavior="padding" on iOS, "height" on Android)
  ↓
View (backdrop) with flex:1 dismiss area
  ↓
TouchableOpacity (flex:1 dismiss trigger area)
  ↓
View (sheet with rounded corners, maxHeight="75%")
  ├─ Handle (visual drag indicator, outside ScrollView)
  ├─ Header (fixed, outside ScrollView)
  │  ├─ Title + subtitle
  │  └─ Close button (✕)
  └─ ScrollView keyboardShouldPersistTaps="always"
     ├─ Form fields
     ├─ Suggestions/chips (always visible)
     └─ Submit button (inside ScrollView, padding to bottom)
```
- **Fixed header outside ScrollView**: ensures title/close stay visible while form scrolls
- **Submit button inside ScrollView**: positioned at bottom with proper bottom inset (Math.max(insets.bottom, 24))
- **Dismiss area above sheet**: full flex:1 TouchableOpacity for easy dismiss

### Suggestion Chips & Autocomplete Patterns
- **Always use `TouchableOpacity`** for suggestion chips — never `Pressable` (Pressable fires onBlur before onPress, clearing chips before tap registers)
- **Suggestions are ALWAYS computed and ALWAYS visible** — never gated on focus state
  - onBlur fires before onPress and will remove chips before the tap completes if suggestions are conditionally rendered
  - Keep them visible at all times; empty state is OK (just show fewer/no suggestions)
- **Both vertical and horizontal ScrollView MUST have `keyboardShouldPersistTaps="always"`** — allows tapping suggestions without keyboard dismissing first
- **Name filtering examples**:
  - Grocery: `SUPPLIES_SUGGESTIONS.filter(s => s.name.toLowerCase().includes(q) && !items.some((it, ii) => ii !== idx && it.name === s.name))`
  - Supplies: Filter by input query + exclude items already selected in other rows
  - Quick add: Show first N matches or all if fewer than N matches

### Theme Usage
- **Components call `useTheme()` internally** — never receive `colors` or `isDark` as props
- Direct hook access keeps component interfaces simple and decouples styling from props
- Exception: Screen-level wrappers may destructure theme and pass to child components that need it for styling children

### Encoding Helpers for Data
Encoding helpers live in the **modal/component file** and are **re-exported from the parent view file** so other modules can import them:
- **`GROCERY_PREFIX`** and **`SUPPLIES_PREFIX`**: magic strings for encoding request details
- **`encodeGroceryRequest()`** / **`decodeGroceryRequest()`**: convert grocery objects ↔ detail strings
- **Location**: `/features/hub/KidModals.tsx` (defined and re-exported)
- **Import elsewhere**: `import { GROCERY_PREFIX, decodeGroceryRequest } from './KidView'`
- Encoding allows flexible storage (detail field can hold any string representation)

### Request Flow
- **Kid submits**: `kidRequestStore.sendRequest({ type: 'delegation', fromMemberId: active.id, ... })`
  - Request type: `'delegation'` (grocery/supplies), `'checkin'`, `'emergency'`, `'ride'`, `'permission'`, `'question'`, `'medication'`
- **Request lands in HelpDispatchQueue** with status `'pending'` (waits for parent)
- **Parent approves/declines**:
  - Approve: `approveRequest()` or `approveItems()` (per-item approval) → moves to `'approved'`
  - Decline: `declineRequest()` → status becomes `'declined'`, reason stored
- **Approved items added to grocery store**: `addApprovedItemsToStore()` called on approval
- **Request completion**: `completeRequest()` → status becomes `'completed'`, stored in history

### Item Approval State Management (Per-Item)
For multi-item requests (grocery/supplies):
- Request can have `items: KidRequestItem[]` array
- Each item has `status: 'pending' | 'approved' | 'rejected'`
- Each item has optional `parentNote`, `approvedBy`, `approvedAt`, `rejectedBy`, `rejectedAt`
- Per-item buttons: approve (✓ OK), reject (✗ No) when status is pending
- Bulk actions: "Approve All", "Reject All" for faster parent workflow
- All items share optional comment field: `itemNote[requestId]` stores shared comment for batch

---

## Button Actions Per Role and Request Type

### KID ROLE

#### Grocery Modal (`GroceryModal`)
| Button/Action | Method | Result |
|---|---|---|
| Category chip (Snacks, Dairy, etc.) | `setGlobalCat(c)` | Updates global category for new lines; future items default to selected cat |
| "+ Add item" button | `addLine()` → append `{ ...emptyLine(), category: globalCat }` | Adds new line to items list |
| Item name input | `setName()` | Updates line name; triggers name suggestions filter |
| Name suggestion chip | `updateLine(idx, { name: s.name, emoji: s.emoji, category: s.category })` | Fills name, emoji, and category from suggestion; clears focus |
| Item qty input | `setQty()` | Updates line quantity |
| Delete button (✕) on line | `removeLine(idx)` | Removes line from list |
| Notes textarea | `setNotes()` | Adds optional note for parent (max 150 chars) |
| "Send X items to Parent" button | `sendRequest({ type: 'delegation', items: newItems, detail: encodeGroceryRequest(...), ... })` then `Alert.alert()` | Creates new grocery request OR appends to existing pending grocery request; dismisses modal; shows confirmation |

#### Supplies Modal (`SuppliesModal`)
| Button/Action | Method | Result |
|---|---|---|
| Urgency toggle (No Rush / Need Soon) | `setUrgency('normal' \| 'soon')` | Highlights selected urgency; stores in detail JSON |
| Item name input | `setItems(prev => [..., { name: v, qty: item.qty }])` | Updates item name; filters suggestions below |
| Item suggestion chip | `updateItem(idx, 'name', s.name)` | Fills item name from suggestion |
| Item qty input | `updateItem(idx, 'qty', v)` | Updates item quantity |
| "+ Add another item" button | `addRow()` → append `{ name: '', qty: '' }` | Adds new empty row |
| Delete button (✕) on row | `removeRow(idx)` | Removes row from items list |
| Notes textarea | `setNotes()` | Adds optional note for parent |
| "Send to Parent" button | `sendRequest({ type: 'delegation', detail: `${SUPPLIES_PREFIX}${JSON.stringify(...)}`, items: newItems, ... })` then `Alert.alert()` | Creates new supplies request OR appends to existing; dismisses modal; shows confirmation |

#### Ask Modal (Permission/Question/Medication) (`AskModal`)
| Button/Action | Method | Result |
|---|---|---|
| Text input | `setText()` | Enters free-text message to parent (max unbounded but placeholder suggests ~150 chars typical) |
| "Send to Parent" button | `sendRequest({ type: 'permission' \| 'question' \| 'medication', fromMemberId: active.id, detail: text.trim(), urgency: type === 'medication' ? 'urgent' : 'normal' })` then `Alert.alert('Sent! 👋', 'Your parent has been notified.')` | Sends message directly to parent; dismisses modal; shows confirmation |

#### KidView Hero Card Quick Actions
| Button/Action | Method | Result |
|---|---|---|
| "I'm Home" button (🏠) | `sendCheckin('home')` → `sendRequest({ type: 'checkin', detail: "I'm home! 🏠", ... })` then chat message then alert | Notifies all family; updates in chat; shows "🏠 I'm home!" confirmation |
| "I'm Ready" button (🎒) | `sendCheckin('ready', confirmedRide?.title)` → includes event title if ride exists | Notifies parent you're ready for pickup; context-aware with event name |
| "Running Late" button (🏃) | `sendCheckin('late', nextEvent?.title)` → includes event name if one exists | Notifies parent of delay; optional event context |
| "Grocery" button (🛒) | `setGroceryModal(true)` | Opens GroceryModal bottom sheet |

#### KidView Ask Parent Bar (ASK PARENT section)
| Button/Action | Method | Result |
|---|---|---|
| Permission button (🔓) | `setAskModal('permission')` | Opens AskModal for permission request |
| Question button (❓) | `setAskModal('question')` | Opens AskModal for question |
| Supplies button (📚) | `setSuppliesModal(true)` | Opens SuppliesModal bottom sheet |
| Grocery button (🛒) | `setGroceryModal(true)` | Opens GroceryModal bottom sheet |
| Medication button (💊) | `setAskModal('medication')` | Opens AskModal with urgent flag for medication alerts |
| "My Request History" row | `setHistoryModal(true)` | Opens KidRequestHistoryModal showing all past requests with status badges |

#### KidView Quests Tab
| Button/Action | Method | Result |
|---|---|---|
| "Alert!" button (driver late) | `sendDriverLate(confirmedRide)` → `sendRequest({ type: 'emergency', urgency: 'urgent', detail: 'My driver ... hasn't arrived yet', ... })` then chat message | Sends emergency alert to parent; marks `lateNudgeSent[eventId] = true` (deduped per event); shows confirmation |
| "Tap to nudge" card (declined ride) | `nudgeParent()` → `sendRequest({ type: 'ride', urgency: 'urgent', detail: 'Need a new driver for: ...', scheduledDate, scheduledTime, ... })` | Nudges parent to find replacement driver; includes original event details |
| "Try Again" button (declined quest) | `reopenQuest(q.id, active.id)` | Resets quest status from 'declined' back to 'todo'; clears decline note |
| "Claim Quest" button (bounty pool) | `claimQuest(q.id, active.id)` | Claims public pool quest; marks as assigned to this kid; status → 'claimed' |
| "Start Quest" button (claimed quest) | `submitQuest(q.id)` | Begins quest; status → 'in_progress'; starts timer for tracking |
| "Mark Done" or "Take Photo" button | `submitQuest(q.id)` | Submits quest for completion; if photoRequired, captures/attaches photo; status → 'pending_approval' |

#### KidRequestHistoryModal
| Button/Action | Method | Result |
|---|---|---|
| Expand/collapse request row | `toggle(req.id)` → toggles `expanded.has(req.id)` | Shows/hides per-item detail rows with approval status and parent notes |
| Delete button (✕) on pending request | Shows Alert; on confirm: `deleteRequest(req.id)` | Removes pending request from queue; is immediately gone (cancelled status) |

---

### PARENT / SENIOR ROLE

#### HelpDispatchQueue Pending Requests (Kid delegation: grocery/supplies with items[])
**Note:** Per-item approval UI only appears if: `isParentOrSenior && req.type === 'delegation' && req.items?.length > 0`

| Button/Action | Method | Result |
|---|---|---|
| "▼ review items" / "▲ collapse" toggle | `setItemExpanded(p => ({ ...p, [req.id]: !p[req.id] }))` | Expands/collapses item list for this request |
| "✓ OK" button on individual item | `approveItems(req.id, [item.id], activeMemberId, itemNote[req.id])` + `addApprovedItemsToStore(req)` | Approves single item; marks status='approved'; adds to grocery store with parent note; removes from pending approval flow |
| "✗ No" button on individual item | `rejectItems(req.id, [item.id], activeMemberId, itemNote[req.id])` | Rejects single item; marks status='rejected'; optional parent note stored in item.parentNote |
| Comment textarea (batch note) | `setItemNote(p => ({ ...p, [req.id]: v }))` (max 150 chars) | Stores shared comment for all items in batch; applies to all approve/reject actions for this request |
| "✓ Approve All" button | `approveAllItems(req.id, activeMemberId, itemNote[req.id])` + `addApprovedItemsToStore(req, allPendingItemIds)` | Approves all pending items in request; adds all to grocery store; same optional batch note |
| "✗ Reject All" button | `rejectAllItems(req.id, activeMemberId, itemNote[req.id])` | Rejects all pending items; same optional batch note |

#### HelpDispatchQueue Pending Requests (Non-multi-item: single-item delegations, ask, etc.)
**Note:** This section appears only if: `isParentOrSenior && !(req.type === 'delegation' && req.items && req.items.length > 0)`

| Button/Action | Method | Result |
|---|---|---|
| "❌ Decline Request" toggle link | `setDeclineOpen(p => ({ ...p, [req.id]: !p[req.id] }))` | Shows/hides decline reason panel |
| **Decline Reason Presets** (4 chips) | `setDeclineReason(p => ({ ...p, [req.id]: preset }))` | Highlights selected preset; populates custom reason field |
| **Custom reason textarea** | `setDeclineReason(p => ({ ...p, [req.id]: v.slice(0, 150) }))` | Allows override of preset with custom reason (max 150 chars) |
| "Cancel" button (decline panel) | `setDeclineOpen(p => ({ ...p, [req.id]: false }))` | Closes decline panel without action |
| "Confirm Decline" button | `doDecline(req.id)` → `declineRequest(id, activeMemberId, declineReason[id])` (800ms delay for UX) | Rejects entire request; stores decline reason; closes panel; status → 'declined' |
| "⚡ Self-Assign ({kidName})" button | `doSelfAssign(req.id)` → `handleGroceryApproval(req)` + `assignRequest(id, activeMemberId, assignNote[id])` (800ms delay) | Parent takes ownership; approves (if delegation, adds to grocery); status → 'approved'; assigned to self |
| Helper dropdown trigger | `setHelperOpen(p => ({ ...p, [req.id]: !p[req.id] }))` | Shows/hides helper picker menu |
| Helper dropdown option (AI Tutor / another parent / senior) | `setSelectedHelper(p => ({ ...p, [req.id]: h.id }))` then auto-close dropdown | Selects helper; enables "Assign" button |
| Optional assign note textarea | `setAssignNote(p => ({ ...p, [req.id]: v.slice(0, 150) }))` (only visible if helper !== self) | Context/instructions for assigned helper (max 150 chars) |
| "Assign" button | `doAssignHelper(req.id)` → `handleGroceryApproval(req, helperId)` + `assignRequest(id, helperId, assignNote[id])` (800ms delay) | Assigns to selected helper; approves (if delegation, adds to grocery); status → 'approved'; assigned to helper |

#### HelpDispatchQueue Assigned/In-Progress Requests
| Button/Action | Method | Result |
|---|---|---|
| "Mark Completed" button | `doComplete(req.id)` → `completeRequest(id, activeMemberId)` (800ms delay) | Marks request complete; status → 'completed'; moves to completed history (last 3 shown) |
| **Reassign section** (parents only; shown in purple box) | | |
| Reassign dropdown trigger | `setHelperOpen(p => ({ ...p, [req.id]: !p[req.id] }))` | Shows helper picker for reassignment (excludes current assignee) |
| Reassign helper option | `setSelectedHelper(p => ({ ...p, [req.id]: h.id }))` then auto-close | Selects new helper |
| "Reassign" button | `doAssignHelper(req.id)` → `assignRequest(id, newHelperId, assignNote[id])` | Transfers assignment to new helper; optional note |
| Optional reassign note textarea | `setAssignNote(p => ({ ...p, [req.id]: v.slice(0, 150) }))` (only if helper changed) | Context for new assignee |

---

### PARENT / SENIOR ROLE — GROCERY SCREEN

#### AddItemSheet (Bottom sheet modal for adding new items or editing existing items)
| Button/Action | Method | Result |
|---|---|---|
| Name input with search icon | `setName()` | Type or search item name; triggers AI filtering; clears any category override |
| Clear name (✕) button | `setName('')` | Clears input; hides suggestions |
| AI quick suggestions (horizontal scroll, Pressable chips) | `setName(s.name)` + `setCat(s.cat)` | Auto-fills name and category from suggestion; persists category for future items |
| Quantity input (📦) | `setQty()` | Type quantity (2 kg, 1 doz, etc.) — freeform text |
| Store preference input (🏪) | `setStore()` | Type preferred store or leave empty |
| Category chips (horizontal scroll) | `setCat(cat === c ? '' : c)` | Toggle-select one category; affects AI suggestions below |
| Notes textarea | `setNotes()` | Optional shopper notes (e.g., "organic only", "from Patel's") |
| "+ Add to List" button (or "✅ Save Changes" if editing) | `handleSave()` → `addItem()` or `supabase.from('grocery_items').update()` | Saves to DB; resets form; closes sheet; if editing, updates existing item in-place |

#### CreateRunSheet (Bottom sheet for creating a new shopping run)
| Button/Action | Method | Result |
|---|---|---|
| Store name input | `setStore()` | Type store name; auto-focus |
| Store suggestions (Pressable chips) | `setStore(s)` | Selects store from preset list (Costco, Walmart, etc.) |
| Run name input (optional) | `setName()` | Type optional run name (e.g., "Diwali party groceries"); defaults to "{store} run" if empty |
| "Create Run" button | `createRun({ familyId, name, store, createdBy, shopperId })` then `onCreated(run)` | Creates run in status='draft'; returns run object; triggers parent to open RunDetailSheet |

#### RunDetailSheet (Full run management: items, check-off, receipt, actions)
| Button/Action | Method | Result |
|---|---|---|
| **Tabs** (items / add / receipt) | `setTab('items' \| 'add' \| 'receipt')` | Switches between item list, add items, and receipt upload |
| **Items Tab — Item rows** | | |
| Item checkbox / row press | `toggleCheck(ri)` → `checkRunItem() / uncheckRunItem()` | Toggles item checked status; updates live across family; shows loading spinner |
| "↩️ Return" button (checked or done items) | `createReturnQuest(m.id, [ri])` → shows Alert to pick assignee → `addQuest()` | Creates a "Return item" quest for chosen family member; stores item details; auto-dedupes if multiple marked for return |
| "Not here" button (unchecked items) | `markNotFound(ri)` → toggles `notFoundIds.has(ri.itemId)` | Marks item unavailable at store; grays out; "Not found here — stays on list" label; unchecks checkbox |
| "Undo" button (marked not-found) | `markNotFound(ri)` (toggle off) | Clears "not found" flag; item re-enables for checking |
| "Remove" button (✕ icon, active runs only) | `removeItemFromRun(run.id, ri.itemId)` | Removes item from this run entirely; does NOT add back to pool |
| **Add Tab — Pending items** | | |
| "+ Add" button on pending item | `handleAddToRun(item.id)` → `addItemToRun()` + reload → `setTab('items')` | Adds item to run; refreshes item list; switches back to items tab |
| **Receipt Tab** | | |
| Dashed upload area or "Upload Receipt" button | `pickReceipt()` → `ImagePicker.launchImageLibraryAsync()` → `analyzeReceipt(base64)` → calls `family-ai` function | Picks photo from library; analyzes with AI; extracts line items and total; displays results |
| "Upload different receipt" button | `setReceiptUri(null)` + `setReceiptAnalysis(null)` | Clears receipt and analysis; re-enables upload button |
| **Action Buttons** (status-dependent) | | |
| "🛒 Start Shopping" button (draft status) | `startRun(run.id, memberId)` | Changes status to 'active'; enables check-off workflow |
| "🏪 Switch Store" button (active runs only) | `handleSwitchStore()` → shows Alert with past stores or input prompt → `supabase.from('grocery_runs').update({ store })` | Mid-run store switch; preserves checked items and progress; updates run.store |
| "🤝 Hand Off" button (active runs only) | `handleHandOff()` → shows Alert to pick assignee → `supabase.from('grocery_runs').update({ shopper_id: m.id })` | Transfers run to another family member; retains all progress; updates shopper_id |
| ⚠️ "Not found summary" warning | (Display only) | Shows count of items marked "not found"; informs user they'll stay on list |
| "✅ Done — X bought" button (active, checkedCount > 0) | `handleComplete()` → shows Alert → `removeItemFromRun()` for each notFoundIds item → `completeRun(run.id)` | Marks checked items as bought; keeps "not found" items on list for next run; status → 'done'; closes sheet |

---

### GroceryScreen Main List (Item Cards + Run Cards)

#### Item Cards (rendered in FlatList, "List" tab)
| Button/Action | Method | Result |
|---|---|---|
| Item card press (single) | `onPress()` (no-op in view mode) | Can expand for details (not implemented in view mode, reserved for future) |
| Item card long-press | `onLongPress()` → `setSelecting(true)` + auto-select item | Enters multi-select mode; highlights pressed item |
| Long-press again to exit | Exit multi-select flow | Returns to normal single-tap mode |
| Item checkbox (view mode) | `onBuy()` → toggles `isBought` | Marks item purchased; grays out; strike-through text; icon becomes green check |
| Item edit button (long-press in selecting mode, or context menu) | Shows sheet to edit name, qty, category, store, notes | (Edit flow similar to AddItemSheet) |
| Item delete button (long-press + selecting mode) | `onDelete()` → shows Alert → deletes from DB | Removes item from grocery list permanently |
| Bulk select (multi-select mode) | Tap items to toggle checkboxes | Select multiple items for batch actions |
| Bulk delete (after selecting) | Shows Alert → batch deletes | Removes all selected items |
| Bulk mark bought | Marks all selected as isBought=true | Quick bulk operation for items grabbed in same trip |

#### Run Cards (rendered in ScrollView, "Runs" tab)
| Button/Action | Method | Result |
|---|---|---|
| Run card press | `onPress()` → opens RunDetailSheet | Loads run detail; shows items, check-off UI, actions |
| Trash button (inactive runs only) | `onDelete()` → shows Alert → deletes run from DB | Removes draft/done runs; active runs cannot be deleted |
| **Badge states** | | |
| 🛒 LIVE (active) | Run status='active'; shows active pulse border | Actively shopping; can check off items |
| ✅ DONE (completed) | Run status='done' | Shopping complete; items checked; view-only |
| DRAFT | Run status='draft' (default) | Pending shopping; items selected; ready to start |

---

## Data Structures & Encoding Reference

### GroceryItem
```typescript
{
  id: string;
  familyId: string;
  name: string;
  quantity?: string;         // "2 kg", "1 doz", etc.
  category?: string;          // "Produce", "Dairy", "Frozen", etc.
  storePreference?: string;   // "Costco", "Whole Foods", etc.
  notes?: string;             // Shopper notes
  isBought: boolean;
  addedBy: string;            // Member ID
  createdAt: string;          // ISO string
  aiGenerated?: boolean;      // True if from AI suggestion
}
```

### GroceryRun & GroceryRunItem
```typescript
GroceryRun {
  id: string;
  familyId: string;
  name: string;               // Run name or "{store} run"
  store: string;              // "Costco", "Walmart", etc.
  status: 'draft' | 'active' | 'done';
  createdBy: string;          // Member ID
  shopperId: string;          // Current shopper (can hand off)
  createdAt: string;
  plannedAt?: string;         // Optional planned date
}

GroceryRunItem {
  itemId: string;
  runId: string;
  checkedInRun: boolean;
  checkedBy?: string;         // Member who checked it off
  checkedAt?: string;         // Timestamp when checked
  item?: GroceryItem;         // Full item data (joined)
}
```

### KidRequest (multi-item format)
```typescript
{
  id: string;
  type: 'delegation' | 'checkin' | 'emergency' | 'ride' | 'permission' | 'question' | 'medication';
  fromMemberId: string;       // Kid who requested
  status: 'pending' | 'approved' | 'declined' | 'completed' | 'cancelled' | 'partial';
  detail: string;             // Encoded detail or plain text
  items?: KidRequestItem[];   // Multi-item (grocery/supplies)
  urgency: 'normal' | 'soon' | 'urgent' | 'emergency';
  rewardCoins?: number;
  parentNote?: string;        // Parent's note on entire request
  respondedBy?: string;       // Member ID who approved/declined
  assignedHelper?: string;    // Assigned to parent/tutor/senior
  requestedAt: string;        // ISO timestamp
}

KidRequestItem {
  id: string;
  name: string;
  qty: string;
  category: string;
  emoji?: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;        // Kid ID
  parentNote?: string;        // Per-item note from parent
  approvedBy?: string;        // Member ID who approved
  approvedAt?: string;        // ISO timestamp
  rejectedBy?: string;        // Member ID who rejected
  rejectedAt?: string;        // ISO timestamp
}
```

### Encoding Examples
```typescript
// Grocery encoding
const detail = encodeGroceryRequest({
  name: 'Milk, Bread, Eggs',
  qty: '',
  category: 'Multi',
  notes: 'Get the organic ones'
});
// Result: 'GROCERY_REQUEST:{"name":"Milk, Bread, Eggs","qty":"","category":"Multi","notes":"Get the organic ones"}'

// Supplies encoding
const detail = `${SUPPLIES_PREFIX}${JSON.stringify({
  items: [
    { name: 'Pencils', qty: '1 box' },
    { name: 'Notebooks', qty: '2' }
  ],
  notes: 'For school',
  urgency: 'soon'
})}`;
// Result: 'SUPPLIES_REQUEST:{"items":[...],"notes":"For school","urgency":"soon"}'
```

---

## State Management Patterns

### Request Dispatch (KidRequestStore)
- `sendRequest()`: Kid submits request → status='pending' → lands in HelpDispatchQueue
- `approveRequest()`: Parent approves entire request → status='approved'
- `declineRequest()`: Parent declines → status='declined' + reason
- `approveItems()`: Parent approves individual items in multi-item request → item.status='approved'
- `rejectItems()`: Parent rejects individual items → item.status='rejected'
- `assignRequest()`: Parent assigns to self or helper → assignedHelper=memberId
- `completeRequest()`: Request is done → status='completed'
- `appendItems()`: Append new items to existing pending grocery/supplies request (instead of creating new request)
- `deleteRequest()`: Kid removes pending request → status='cancelled'

### Grocery Store (GroceryStore)
- `addItem()`: Add item to family grocery list
- `checkRunItem()`: Mark item as purchased in run
- `uncheckRunItem()`: Unmark item in run
- `addItemToRun()`: Add pending item to active run
- `removeItemFromRun()`: Remove item from run (stays on master list unless explicitly deleted)
- `createRun()`: Create new shopping run (status='draft')
- `startRun()`: Begin shopping (status='active')
- `completeRun()`: Finish run (status='done')
- `loadRunDetail()`: Load run with joined item data and real-time subscriptions

---

## Styling & Visual Conventions

### Color System (via BRAND object)
- **`BRAND.purple`** — Primary action (assign, confirm, start, etc.)
- **`BRAND.teal`** — Secondary/grocery (add items, supplies)
- **`BRAND.amber`** — Warnings, urgency, "need soon"
- **`#10B981`** (green) — Success, approval, completion
- **`#EF4444`** (red) — Danger, decline, rejection

### Rounded Corners
- **Small modals, buttons, chips**: `borderRadius: 10–14`
- **Cards, sheets, panels**: `borderRadius: 16–24`
- **Bottom sheet**: `borderTopLeftRadius: 24, borderTopRightRadius: 24`

### Spacing
- **Card padding**: `14–16px` (horizontal), `12–14px` (vertical)
- **Sheet padding**: `20px` (horizontal)
- **Gap between elements**: `6–10px` (tight), `12–14px` (standard)
- **Bottom sheet maxHeight**: `75%` for modals, `90%` for detail sheets

### Text Hierarchy (via TYPO constants)
- **Title**: `fontSize: 17–18, fontWeight: '900'`
- **Body**: `fontSize: 13–14, fontWeight: '600–700'`
- **Label**: `fontSize: 10–12, fontWeight: '700–800'`
- **Micro**: `fontSize: 9–10` (secondary info, metadata)

---

## Testing & Debugging Tips

### Common Patterns to Test
1. **Suggestion chips**: Ensure they stay visible and tappable even with keyboard open
   - Test: type in grocery name → suggestions appear → tap one → fills correctly
2. **Multi-item approval**: Test bulk approve/reject + per-item mixed states
   - Test: Approve 2, reject 1, approve 1 → check grocery store reflects correct items
3. **Hand-off & reassign**: Verify shopper/helper IDs update correctly
4. **Run state transitions**: Draft → Active → Done (should not allow reverse transitions)
5. **Encoding/decoding**: Verify detail strings survive round-trips through DB

### Debug Logging
- Check Redux store snapshots in dev tools
- Log `kidRequestStore` state before/after approve/decline
- Monitor Supabase real-time subscription events (run_items changes)
- Test offline mode: grocery list should remain visible; run check-offs will sync on reconnect


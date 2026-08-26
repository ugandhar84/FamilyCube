import WidgetKit
import SwiftUI

// MARK: - Shared Data Model
//
// Role-based payload — a parent gets a household summary, a kid/teen/
// senior gets their own quest/coin/streak snapshot. Matches
// modules/widget-data/src/index.ts's WidgetParentSummary/
// WidgetMemberSummary exactly (field names, "kind" discriminator).

struct WidgetEvent: Codable {
    var title: String
    var time: String
}

struct WidgetParentSummary: Codable {
    var familyName: String
    var memberCount: Int
    var pendingApprovals: Int
    var eventsToday: Int
    var unreadMessages: Int
    var nextEventTitle: String?
    var nextEventTime: String?
    var upcomingEvents: [WidgetEvent]?
}

struct WidgetMemberSummary: Codable {
    var memberName: String
    var memberEmoji: String
    // Kid/teen only — a grandparent never earns coins or builds a streak
    // (always 0 in the DB, no UI anywhere treats it as their own stat), so
    // the JS side omits these for role 'senior' entirely rather than
    // sending misleading zeros.
    var pendingQuests: Int?
    var coins: Int?
    var streak: Int?
    // Senior only — today's active, not-yet-taken medication count
    // (family_medications table, same source Vault/Health reads/writes).
    var medsPending: Int?
    var nextEventTitle: String?
    var nextEventTime: String?
    var upcomingEvents: [WidgetEvent]?
}

enum WidgetSummary {
    case parent(WidgetParentSummary)
    case member(WidgetMemberSummary)
}

struct WidgetPayload: Codable {
    var enabled: Bool
    var kind: String?            // "parent" | "member" — discriminator written alongside summary
    var parentSummary: WidgetParentSummary?
    var memberSummary: WidgetMemberSummary?
    var lastSyncedAt: String?

    static let appGroup = "group.com.familycube.ios"
    static let fileName = "widget_data.json"

    var summary: WidgetSummary? {
        if kind == "parent", let p = parentSummary { return .parent(p) }
        if kind == "member", let m = memberSummary { return .member(m) }
        return nil
    }

    static func load() -> WidgetPayload? {
        guard
            let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: appGroup),
            let data = try? Data(contentsOf: containerURL.appendingPathComponent(fileName)),
            let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data),
            payload.enabled
        else {
            return nil
        }
        return payload
    }
}

// MARK: - Timeline

struct FamilyCubeEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
}

struct FamilyCubeProvider: TimelineProvider {
    func placeholder(in context: Context) -> FamilyCubeEntry {
        FamilyCubeEntry(date: Date(), payload: WidgetPayload(
            enabled: true, kind: "member",
            parentSummary: nil,
            memberSummary: WidgetMemberSummary(memberName: "Leo", memberEmoji: "🧒", pendingQuests: 3, coins: 120, streak: 7, medsPending: nil, nextEventTitle: nil, nextEventTime: nil),
            lastSyncedAt: nil
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (FamilyCubeEntry) -> Void) {
        completion(FamilyCubeEntry(date: Date(), payload: WidgetPayload.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FamilyCubeEntry>) -> Void) {
        let entry = FamilyCubeEntry(date: Date(), payload: WidgetPayload.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Shared visual language

// Matches constants/colors.ts's lightColors exactly (colors.accent/teal/amber)
// — these were hand-approximated placeholders before and didn't track the
// app's real Kinfolk palette after it moved off the original louder
// purple/teal/pink set.
private let brandAccent = Color(red: 0.588, green: 0.525, blue: 0.710)  // colors.accent  #9686B5
private let brandTeal   = Color(red: 0.412, green: 0.573, blue: 0.486)  // colors.teal    #69927C — parent role accent
private let brandAmber  = Color(red: 0.788, green: 0.588, blue: 0.310)  // colors.amber   #C9964F — kid role accent

private struct StatColumn: View {
    let value: String
    let label: String
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(value).font(.title2).bold().foregroundColor(.white)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption).foregroundColor(.white.opacity(0.75)).lineLimit(1)
        }
    }
}

// MARK: - Agenda list (medium widget's "UP NEXT" column)
//
// iOS Calendar's own widget fills its space with actual upcoming events
// rather than leaving whitespace next to a single headline stat — this
// mirrors that: a real 2-3 row agenda, each event getting its own line
// with a leading time chip, instead of one cramped "next event" caption.

private struct AgendaRow: View {
    let event: WidgetEvent

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            Circle()
                .fill(.white.opacity(0.85))
                .frame(width: 5, height: 5)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 0) {
                Text(event.title).font(.system(size: 12, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                Text(event.time).font(.system(size: 10)).foregroundColor(.white.opacity(0.7)).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

private struct AgendaColumn: View {
    let events: [WidgetEvent]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("UP NEXT").font(.system(size: 10, weight: .bold)).foregroundColor(.white.opacity(0.65))
            if events.isEmpty {
                Spacer()
                VStack(alignment: .leading, spacing: 2) {
                    Image(systemName: "tray").font(.caption).foregroundColor(.white.opacity(0.8))
                    Text("Nothing scheduled").font(.system(size: 11)).foregroundColor(.white.opacity(0.7))
                }
                Spacer()
            } else {
                ForEach(Array(events.prefix(3).enumerated()), id: \.offset) { _, event in
                    AgendaRow(event: event)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

// MARK: - Empty / signed-out state

private struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "house.fill").font(.title2).foregroundColor(.white)
            Text("Open Family Cube").font(.caption).bold().foregroundColor(.white.opacity(0.9))
        }
        // .containerBackground(for: .widget) is required on iOS 17+ (this
        // app's own deployment target) — a widget that only paints its
        // background via a plain Color inside ZStack, with no
        // containerBackground modifier, is exactly the class of bug
        // WidgetKit introduced this API to prevent: the system can decline
        // to render the widget's content at all (shows blank), most
        // reliably reproduced on Lock Screen/StandBy but not limited to
        // it. All three views below had this same gap.
        .containerBackground(brandAccent, for: .widget)
    }
}

// MARK: - Parent widget view (household summary)

private struct ParentWidgetView: View {
    let data: WidgetParentSummary
    @Environment(\.widgetFamily) var family

    @ViewBuilder private func header(showUnreadBadge: Bool) -> some View {
        HStack {
            Text(data.familyName).font(.subheadline).bold().foregroundColor(.white).lineLimit(1)
            Spacer(minLength: 4)
            if showUnreadBadge, data.unreadMessages > 0 {
                Text("\(data.unreadMessages)")
                    .font(.caption2).bold().foregroundColor(brandTeal)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Circle().fill(.white))
            }
        }
    }

    // Pending approvals is the ONE number a parent actually glances at
    // this widget for — always leads. A bare "0" with a truncated caption
    // underneath reads as broken, not as "all caught up" — so 0 gets its
    // own reassuring state. On small, the checkmark state is compact
    // (icon + label on one row) instead of a big stacked block, since
    // "all caught up" has nothing further to say and the freed vertical
    // space is better spent on other info below (see secondaryRow).
    @ViewBuilder private func pendingBlock(compact: Bool) -> some View {
        if data.pendingApprovals == 0 {
            if compact {
                // Plain checkmark glyph, not .circle.fill — that variant
                // renders as a solid white disc with the background color
                // punched through for the check, which looked like a
                // stray system badge next to plain white icons/text
                // everywhere else on the tile (live-reported). minimumScale
                // + lineLimit(1) stop "All caught up" from wrapping to two
                // lines in the small widget's narrow width, which had
                // silently eaten back all the vertical space this compact
                // row was supposed to free up.
                HStack(spacing: 5) {
                    Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundColor(.white)
                    Text("All clear").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Image(systemName: "checkmark").font(.system(size: 20, weight: .bold)).foregroundColor(.white)
                    Text("All clear").font(.caption).bold().foregroundColor(.white.opacity(0.9))
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(data.pendingApprovals)").font(.system(size: 34, weight: .bold)).foregroundColor(.white)
                Text(data.pendingApprovals == 1 ? "needs your review" : "need your review")
                    .font(.caption).foregroundColor(.white.opacity(0.8))
            }
        }
    }

    // Small widget's second line when all caught up — unread messages and
    // today's event count are both already flowing into this payload
    // (unreadMessages was previously only a tiny header badge, eventsToday
    // was thrown away entirely in the 0-pending branch) — more useful than
    // a static "up next" line that has nothing to show most of the time.
    @ViewBuilder private func miniStat(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(.system(size: 10)).foregroundColor(.white.opacity(0.85))
            Text(text).font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.9)).lineLimit(1)
        }
    }

    @ViewBuilder private var secondaryRow: some View {
        HStack(spacing: 10) {
            if data.unreadMessages > 0 { miniStat("bubble.left.fill", "\(data.unreadMessages) unread") }
            if data.eventsToday > 0 { miniStat("calendar", "\(data.eventsToday) events") }
        }
    }

    var body: some View {
        if family == .systemMedium {
            // Two columns fill the medium widget's full width instead of
            // stacking everything down the left with dead space on the
            // right: left is the household glance, right is a real agenda
            // list — the same "fill the space with actual upcoming items"
            // approach iOS Calendar's own widget takes, rather than one
            // buried "next event" caption.
            //
            // Left column was: header, then loose Spacers around one big
            // vertical checkmark block, then a single lone stat at the
            // bottom — same wasted-space problem the small widget had.
            // Caught-up now uses the compact checkmark row (matches small),
            // and secondaryRow (unread + today's count) replaces the lone
            // "Events today" StatColumn so the freed room shows both
            // numbers instead of one.
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    header(showUnreadBadge: false)
                    Spacer(minLength: 8)
                    pendingBlock(compact: data.pendingApprovals == 0)
                    Spacer(minLength: 8)
                    secondaryRow
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider().background(.white.opacity(0.3))

                AgendaColumn(events: data.upcomingEvents ?? [])
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .containerBackground(brandTeal, for: .widget)
        } else {
            // Was: big centered checkmark block with two Spacers around it,
            // eating the whole tile for one binary "all caught up" state and
            // leaving real vertical room unused — every family-relevant
            // number this payload already carries (unread messages, today's
            // event count, up-next) got compressed into a single optional
            // line or dropped. Header stays top; the checkmark row is now
            // compact (icon + label inline) so the freed space actually
            // shows something instead of just being emptier padding.
            VStack(alignment: .leading, spacing: 0) {
                // No unread badge here — secondaryRow below already spells
                // out the same number as "N unread," a badge next to it
                // would just repeat it.
                header(showUnreadBadge: false)
                Spacer(minLength: 6)
                pendingBlock(compact: true)
                Spacer(minLength: 6)
                secondaryRow
                if let title = data.nextEventTitle, !title.isEmpty {
                    Spacer(minLength: 6)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(title).font(.system(size: 11, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                        if let time = data.nextEventTime {
                            Text(time).font(.system(size: 10)).foregroundColor(.white.opacity(0.7)).lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding()
            .containerBackground(brandTeal, for: .widget)
        }
    }
}

// MARK: - Kid/Teen/Senior widget view (own snapshot)

private struct MemberWidgetView: View {
    let data: WidgetMemberSummary
    @Environment(\.widgetFamily) var family

    @ViewBuilder private var header: some View {
        HStack {
            Text(data.memberEmoji).font(.title2)
            Text(data.memberName).font(.headline).bold().foregroundColor(.white).lineLimit(1)
            Spacer()
        }
    }

    // medsPending being non-nil is how the JS side signals "this is a
    // senior" — a grandparent's coins/streak are omitted from the payload
    // entirely rather than sent as misleading zeros (they never earn
    // either), so checking for medsPending is more reliable than checking
    // pendingQuests == nil (which could coincidentally also be unset).
    private var isSenior: Bool { data.medsPending != nil }

    @ViewBuilder private func statsRow(compact: Bool) -> some View {
        if isSenior {
            let pending = data.medsPending ?? 0
            if compact {
                HStack(spacing: 5) {
                    Image(systemName: pending == 0 ? "checkmark" : "pills.fill")
                        .font(.system(size: pending == 0 ? 12 : 13, weight: .bold)).foregroundColor(.white)
                    Text(pending == 0 ? "Meds done" : "\(pending) med\(pending == 1 ? "" : "s") due")
                        .font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            } else {
                StatColumn(value: "\(pending)", label: pending == 1 ? "Med due" : "Meds due")
            }
        } else {
            HStack(spacing: 12) {
                StatColumn(value: "\(data.pendingQuests ?? 0)", label: (data.pendingQuests ?? 0) == 1 ? "Quest" : "Quests")
                StatColumn(value: "🪙 \(data.coins ?? 0)", label: "Coins")
                if !compact { StatColumn(value: "🔥\(data.streak ?? 0)d", label: "Streak") }
            }
        }
    }

    var body: some View {
        if family == .systemMedium {
            // Same fill-the-space approach as the parent view: left is the
            // kid/teen/senior's own glance, right is a real agenda list
            // instead of one squeezed-in "next event" line.
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    Spacer(minLength: 8)
                    statsRow(compact: false)
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider().background(.white.opacity(0.3))

                AgendaColumn(events: data.upcomingEvents ?? [])
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .containerBackground(brandAmber, for: .widget)
        } else {
            // Was: spacing:6 + one plain Spacer() — same top-heavy dead-
            // space pattern the parent view's small widget had before this
            // session's fix. Real Spacer()s between sections now distribute
            // content across the tile instead of clumping it at the top.
            VStack(alignment: .leading, spacing: 0) {
                header
                Spacer(minLength: 8)
                statsRow(compact: true)
                Spacer(minLength: 8)
                if let title = data.nextEventTitle, !title.isEmpty {
                    // Small widget has no room for a full agenda list — a
                    // single compact "up next" line is the one extra thing
                    // worth showing here.
                    HStack(spacing: 3) {
                        Image(systemName: "calendar").font(.system(size: 9)).foregroundColor(.white.opacity(0.85))
                        Text(title).font(.system(size: 10)).bold().foregroundColor(.white).lineLimit(1)
                        if let time = data.nextEventTime {
                            Text("· \(time)").font(.system(size: 9)).foregroundColor(.white.opacity(0.75)).lineLimit(1)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .padding()
            .containerBackground(brandAmber, for: .widget)
        }
    }
}

// MARK: - Root view — picks the role-based layout

struct FamilyCubeWidgetView: View {
    var entry: FamilyCubeEntry

    var body: some View {
        switch entry.payload?.summary {
        case .parent(let data): ParentWidgetView(data: data)
        case .member(let data): MemberWidgetView(data: data)
        case nil: EmptyStateView()
        }
    }
}

// MARK: - Widget

struct FamilyCubeWidget: Widget {
    let kind: String = "FamilyCubeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FamilyCubeProvider()) { entry in
            FamilyCubeWidgetView(entry: entry)
        }
        .configurationDisplayName("Family Cube")
        .description("Parents see what needs review; kids and teens see their own quests, coins, and streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

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
    var pendingQuests: Int
    var coins: Int
    var streak: Int
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
            memberSummary: WidgetMemberSummary(memberName: "Leo", memberEmoji: "🧒", pendingQuests: 3, coins: 120, streak: 7, nextEventTitle: nil, nextEventTime: nil),
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

private let brandPurple = Color(red: 0.42, green: 0.36, blue: 0.90)
private let brandTeal   = Color(red: 0.24, green: 0.48, blue: 0.35)   // colors.parent-ish
private let brandAmber  = Color(red: 0.85, green: 0.47, blue: 0.02)   // colors.kid-ish

private struct StatColumn: View {
    let value: String
    let label: String
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        VStack(alignment: alignment, spacing: 2) {
            Text(value).font(.title2).bold().foregroundColor(.white)
            Text(label).font(.caption).foregroundColor(.white.opacity(0.75))
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
                    Text("📭").font(.caption)
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
            Text("👨‍👩‍👧").font(.title)
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
        .containerBackground(brandPurple, for: .widget)
    }
}

// MARK: - Parent widget view (household summary)

private struct ParentWidgetView: View {
    let data: WidgetParentSummary
    @Environment(\.widgetFamily) var family

    @ViewBuilder private var header: some View {
        HStack {
            Text("🏠").font(.title3)
            Text(data.familyName).font(.subheadline).bold().foregroundColor(.white)
            Spacer()
            if data.unreadMessages > 0 {
                Text("\(data.unreadMessages)")
                    .font(.caption2).bold().foregroundColor(brandTeal)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Circle().fill(.white))
            }
        }
    }

    // Pending approvals is the ONE number a parent actually glances at
    // this widget for — always leads, large. A bare "0" with a truncated
    // caption underneath reads as broken, not as "all caught up" — so 0
    // gets its own reassuring state instead of just being the smallest
    // possible version of the number.
    @ViewBuilder private var pendingBlock: some View {
        if data.pendingApprovals == 0 {
            VStack(alignment: .leading, spacing: 2) {
                Text("✓").font(.system(size: 28, weight: .bold)).foregroundColor(.white)
                Text("All caught up").font(.caption).bold().foregroundColor(.white.opacity(0.9))
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(data.pendingApprovals)").font(.system(size: 34, weight: .bold)).foregroundColor(.white)
                Text(data.pendingApprovals == 1 ? "needs your review" : "need your review")
                    .font(.caption).foregroundColor(.white.opacity(0.8))
            }
        }
    }

    var body: some View {
        if family == .systemMedium {
            // Two columns fill the medium widget's full width instead of
            // stacking everything down the left with dead space on the
            // right: left is the household glance (header + headline stat
            // + family/today counts), right is a real agenda list — the
            // same "fill the space with actual upcoming items" approach
            // iOS Calendar's own widget takes, rather than one buried
            // "next event" caption.
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    header
                    Spacer(minLength: 4)
                    pendingBlock
                    Spacer(minLength: 4)
                    // Member count is static and rarely worth a glance —
                    // "Today" is the one mini-stat that actually changes
                    // day to day and earns its place next to the headline.
                    StatColumn(value: "\(data.eventsToday)", label: data.eventsToday == 1 ? "Event today" : "Events today")
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider().background(.white.opacity(0.3))

                AgendaColumn(events: data.upcomingEvents ?? [])
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .containerBackground(brandTeal, for: .widget)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                header
                Spacer()
                pendingBlock
                if let title = data.nextEventTitle, !title.isEmpty {
                    // Small widget has no room for a full agenda list — a
                    // single compact "up next" line is the one extra thing
                    // worth showing here.
                    HStack(spacing: 3) {
                        Text("📅").font(.system(size: 9))
                        Text(title).font(.system(size: 10)).bold().foregroundColor(.white).lineLimit(1)
                        if let time = data.nextEventTime {
                            Text("· \(time)").font(.system(size: 9)).foregroundColor(.white.opacity(0.75)).lineLimit(1)
                        }
                    }
                }
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
            Text(data.memberName).font(.headline).bold().foregroundColor(.white)
            Spacer()
        }
    }

    @ViewBuilder private var statsRow: some View {
        HStack(spacing: 12) {
            StatColumn(value: "\(data.pendingQuests)", label: data.pendingQuests == 1 ? "Quest" : "Quests")
            StatColumn(value: "🪙 \(data.coins)", label: "Coins")
            StatColumn(value: "🔥\(data.streak)d", label: "Streak")
        }
    }

    var body: some View {
        if family == .systemMedium {
            // Same fill-the-space approach as the parent view: left is the
            // kid's own glance (name + quests/coins/streak), right is a
            // real agenda list instead of one squeezed-in "next event" line.
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    header
                    Spacer(minLength: 4)
                    statsRow
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Divider().background(.white.opacity(0.3))

                AgendaColumn(events: data.upcomingEvents ?? [])
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .containerBackground(brandAmber, for: .widget)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                header
                Spacer()
                HStack(spacing: 12) {
                    StatColumn(value: "\(data.pendingQuests)", label: data.pendingQuests == 1 ? "Quest" : "Quests")
                    StatColumn(value: "🪙 \(data.coins)", label: "Coins")
                }
                if let title = data.nextEventTitle, !title.isEmpty {
                    // Small widget has no room for a full agenda list — a
                    // single compact "up next" line is the one extra thing
                    // worth showing here.
                    HStack(spacing: 3) {
                        Text("📅").font(.system(size: 9))
                        Text(title).font(.system(size: 10)).bold().foregroundColor(.white).lineLimit(1)
                        if let time = data.nextEventTime {
                            Text("· \(time)").font(.system(size: 9)).foregroundColor(.white.opacity(0.75)).lineLimit(1)
                        }
                    }
                }
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

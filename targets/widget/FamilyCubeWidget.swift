import WidgetKit
import SwiftUI

// MARK: - Shared Data Model
//
// Role-based payload — a parent gets a household summary, a kid/teen/
// senior gets their own quest/coin/streak snapshot. Matches
// modules/widget-data/src/index.ts's WidgetParentSummary/
// WidgetMemberSummary exactly (field names, "kind" discriminator).

struct WidgetParentSummary: Codable {
    var familyName: String
    var memberCount: Int
    var pendingApprovals: Int
    var eventsToday: Int
    var unreadMessages: Int
    var nextEventTitle: String?
    var nextEventTime: String?
}

struct WidgetMemberSummary: Codable {
    var memberName: String
    var memberEmoji: String
    var pendingQuests: Int
    var coins: Int
    var streak: Int
    var nextEventTitle: String?
    var nextEventTime: String?
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

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
            Spacer()
            // Pending approvals is the ONE number a parent actually
            // glances at this widget for — always leads, large. A bare "0"
            // with a truncated caption underneath reads as broken, not as
            // "all caught up" — so 0 gets its own reassuring state instead
            // of just being the smallest possible version of the number.
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
            if family == .systemMedium {
                Spacer()
                HStack(spacing: 16) {
                    StatColumn(value: "\(data.memberCount)", label: "Family")
                    StatColumn(value: "\(data.eventsToday)", label: "Today")
                }
                if let title = data.nextEventTitle, !title.isEmpty {
                    Divider().background(.white.opacity(0.3))
                    HStack(spacing: 4) {
                        Text("📅").font(.caption2)
                        Text(title).font(.caption).bold().foregroundColor(.white).lineLimit(1)
                        if let time = data.nextEventTime {
                            Text("· \(time)").font(.caption2).foregroundColor(.white.opacity(0.75))
                        }
                    }
                }
            } else if let title = data.nextEventTitle, !title.isEmpty {
                // Small widget has no room for the medium size's full stats
                // row + divider — a single compact "up next" line is the
                // one extra thing worth showing here.
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

// MARK: - Kid/Teen/Senior widget view (own snapshot)

private struct MemberWidgetView: View {
    let data: WidgetMemberSummary
    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(data.memberEmoji).font(.title2)
                Text(data.memberName).font(.headline).bold().foregroundColor(.white)
                Spacer()
            }
            Spacer()
            HStack(spacing: 12) {
                StatColumn(value: "\(data.pendingQuests)", label: data.pendingQuests == 1 ? "Quest" : "Quests")
                StatColumn(value: "🪙 \(data.coins)", label: "Coins")
                if family == .systemMedium {
                    StatColumn(value: "🔥\(data.streak)d", label: "Streak", alignment: .trailing)
                }
            }
            if family == .systemMedium, let title = data.nextEventTitle, !title.isEmpty {
                Divider().background(.white.opacity(0.3))
                HStack(spacing: 4) {
                    Text("📅").font(.caption2)
                    Text(title).font(.caption).bold().foregroundColor(.white).lineLimit(1)
                    if let time = data.nextEventTime {
                        Text("· \(time)").font(.caption2).foregroundColor(.white.opacity(0.75))
                    }
                }
            } else if let title = data.nextEventTitle, !title.isEmpty {
                // Small widget has no room for the medium size's streak
                // column + divider — a single compact "up next" line is
                // the one extra thing worth showing here.
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

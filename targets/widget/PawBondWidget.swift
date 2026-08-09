import WidgetKit
import SwiftUI

// MARK: - Shared Data Model

struct WidgetFamilyData: Codable {
    var memberName: String
    var memberEmoji: String
    var pendingQuests: Int
    var coins: Int
    var streak: Int

    static let appGroup = "group.com.familycube.ios"
    static let fileName = "widget_data.json"

    static func load() -> WidgetFamilyData {
        guard
            let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: appGroup),
            let data = try? Data(contentsOf: containerURL.appendingPathComponent(fileName)),
            let payload = try? JSONDecoder().decode(WidgetFamilyData.self, from: data)
        else {
            return WidgetFamilyData(memberName: "Family", memberEmoji: "👨‍👩‍👧", pendingQuests: 0, coins: 0, streak: 0)
        }
        return payload
    }
}

// MARK: - Timeline

struct FamilyCubeEntry: TimelineEntry {
    let date: Date
    let data: WidgetFamilyData
}

struct FamilyCubeProvider: TimelineProvider {
    func placeholder(in context: Context) -> FamilyCubeEntry {
        FamilyCubeEntry(date: Date(), data: WidgetFamilyData(memberName: "Leo", memberEmoji: "🧒", pendingQuests: 3, coins: 120, streak: 7))
    }

    func getSnapshot(in context: Context, completion: @escaping (FamilyCubeEntry) -> Void) {
        completion(FamilyCubeEntry(date: Date(), data: WidgetFamilyData.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FamilyCubeEntry>) -> Void) {
        let entry = FamilyCubeEntry(date: Date(), data: WidgetFamilyData.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Widget View

struct FamilyCubeWidgetView: View {
    var entry: FamilyCubeEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            Color(red: 0.42, green: 0.36, blue: 0.90)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(entry.data.memberEmoji).font(.title2)
                    Text(entry.data.memberName).font(.headline).foregroundColor(.white).bold()
                    Spacer()
                }
                Spacer()
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(entry.data.pendingQuests)").font(.title).bold().foregroundColor(.white)
                        Text("Quests").font(.caption).foregroundColor(.white.opacity(0.7))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("🪙 \(entry.data.coins)").font(.headline).bold().foregroundColor(.white)
                        Text("Coins").font(.caption).foregroundColor(.white.opacity(0.7))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("🔥\(entry.data.streak)d").font(.headline).bold().foregroundColor(.white)
                        Text("Streak").font(.caption).foregroundColor(.white.opacity(0.7))
                    }
                }
            }
            .padding()
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
        .description("See your pending quests, coins and streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

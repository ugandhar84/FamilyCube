import ExpoModulesCore
import WidgetKit
import BackgroundTasks

private let kWidgetRefreshTaskId = "com.familycube.ios.widget-refresh"

public class WidgetDataModule: Module {
    private let appGroup = "group.com.familycube.ios"
    private let fileName = "widget_data.json"
    // Single widget kind (FamilyCubeWidget in
    // targets/widget/FamilyCubeWidget.swift). Was two different,
    // never-actually-declared kind strings ("PawBondWidget"/
    // "PawBondMediumWidget") — small/medium are variants of ONE
    // StaticConfiguration kind, not two separate widgets, so reloading a
    // kind that was never registered was silently a no-op.
    private let widgetKind = "FamilyCubeWidget"

    public func definition() -> ModuleDefinition {
        Name("WidgetData")

        // NOTE: BGTaskScheduler registration is handled in AppDelegate.swift.
        // Registering here a second time with the same identifier causes
        // NSInternalInconsistencyException → crash through the TurboModule bridge.

        // syncWidget(jsonString) — writes payload JSON to App Group and reloads timelines
        AsyncFunction("syncWidget") { (jsonString: String) throws in
            guard let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else {
                throw NSError(domain: "WidgetData", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "App Group '\(self.appGroup)' not found. Check entitlements."])
            }
            guard let data = jsonString.data(using: .utf8) else {
                throw NSError(domain: "WidgetData", code: 2,
                              userInfo: [NSLocalizedDescriptionKey: "Invalid JSON string"])
            }
            let fileURL = containerURL.appendingPathComponent(self.fileName)
            try data.write(to: fileURL, options: .atomic)
            WidgetCenter.shared.reloadTimelines(ofKind: self.widgetKind)
        }

        // clearWidget() — removes the JSON file and reloads (shows disabled state)
        AsyncFunction("clearWidget") { () throws in
            guard let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else { return }
            let fileURL = containerURL.appendingPathComponent(self.fileName)
            try? FileManager.default.removeItem(at: fileURL)
            WidgetCenter.shared.reloadTimelines(ofKind: self.widgetKind)
        }

        // scheduleBackgroundRefresh() — registers a BGAppRefreshTask so the widget
        // updates even when the app hasn't been opened recently.
        AsyncFunction("scheduleBackgroundRefresh") { () in
            let request = BGAppRefreshTaskRequest(identifier: kWidgetRefreshTaskId)
            request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
            try? BGTaskScheduler.shared.submit(request)
        }
    }
}

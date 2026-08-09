import ExpoModulesCore
import WidgetKit
import BackgroundTasks

private let kWidgetRefreshTaskId = "com.pawbond.ios.widget-refresh"

public class WidgetDataModule: Module {
    private let appGroup = "group.com.pawbond.ios"
    private let fileName = "widget_data.json"

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
            WidgetCenter.shared.reloadTimelines(ofKind: "PawBondWidget")
            WidgetCenter.shared.reloadTimelines(ofKind: "PawBondMediumWidget")
        }

        // clearWidget() — removes the JSON file and reloads (shows disabled state)
        AsyncFunction("clearWidget") { () throws in
            guard let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else { return }
            let fileURL = containerURL.appendingPathComponent(self.fileName)
            try? FileManager.default.removeItem(at: fileURL)
            WidgetCenter.shared.reloadTimelines(ofKind: "PawBondWidget")
            WidgetCenter.shared.reloadTimelines(ofKind: "PawBondMediumWidget")
        }

        // saveAvatarToGroup(petId, url) — downloads a pet avatar and saves it to the
        // App Group container so the widget extension can load it without network access.
        AsyncFunction("saveAvatarToGroup") { (petId: String, urlString: String) throws -> String in
            guard let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: self.appGroup) else {
                throw NSError(domain: "WidgetData", code: 3,
                              userInfo: [NSLocalizedDescriptionKey: "App Group not found"])
            }
            guard let url = URL(string: urlString) else {
                throw NSError(domain: "WidgetData", code: 4,
                              userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }
            let fileName = "avatar_\(petId).jpg"
            let fileURL = containerURL.appendingPathComponent(fileName)
            // ExpoModulesCore AsyncFunction closures are not Swift async contexts,
            // so use URLSession dataTask + semaphore instead of async/await.
            let semaphore = DispatchSemaphore(value: 0)
            var downloadedData: Data?
            var downloadError: Error?
            URLSession.shared.dataTask(with: url) { data, _, error in
                downloadedData = data
                downloadError = error
                semaphore.signal()
            }.resume()
            semaphore.wait()
            if let error = downloadError { throw error }
            guard let data = downloadedData else {
                throw NSError(domain: "WidgetData", code: 5,
                              userInfo: [NSLocalizedDescriptionKey: "No data received from URL"])
            }
            try data.write(to: fileURL, options: .atomic)
            return fileName
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

import Darwin
import Foundation

/** A lifetime lock distinguishes a live app from stale lifecycle preferences after termination. */
enum SharedNotificationContext {
  private static var appLock: Int32 = -1
  private static var group: String? { Bundle.main.object(forInfoDictionaryKey: "PsstPsstAppGroup") as? String }
  private static var defaults: UserDefaults? { group.flatMap(UserDefaults.init(suiteName:)) }
  private static var lockPath: String? {
    group.flatMap { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) }?
      .appendingPathComponent("app-presence.lock").path
  }

  static func startMainProcess() {
    guard appLock == -1, let path = lockPath else { return }
    appLock = open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    if appLock != -1 { _ = flock(appLock, LOCK_EX | LOCK_NB) }
    defaults?.removeObject(forKey: "activeConversation")
  }

  static func setUserPresent(_ present: Bool) { defaults?.set(present, forKey: "userPresent") }

  static func setActiveConversation(account: String?, conversation: String?) {
    if let account, let conversation {
      defaults?.set(["accountPubkey": account, "conversationKey": conversation], forKey: "activeConversation")
    } else { defaults?.removeObject(forKey: "activeConversation") }
  }

  static var databaseChanged: String { "\(group ?? "chat.psstpsst").database-changed" }

  static func publishDatabaseChanged() {
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(databaseChanged as CFString), nil, nil, true)
  }

  static func snapshot() -> [String: Any] {
    guard let path = lockPath else { return ["userPresent": false] }
    let descriptor = open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard descriptor != -1 else { return ["userPresent": false] }
    defer { close(descriptor) }
    let appIsRunning = flock(descriptor, LOCK_EX | LOCK_NB) != 0
    if !appIsRunning { _ = flock(descriptor, LOCK_UN) }
    return ["userPresent": appIsRunning && (defaults?.bool(forKey: "userPresent") ?? false),
      "activeConversation": appIsRunning ? defaults?.dictionary(forKey: "activeConversation") as Any : NSNull()]
  }
}

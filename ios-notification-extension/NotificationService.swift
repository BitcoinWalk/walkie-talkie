import Foundation
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
  private let lock = NSLock()
  private var jobs: [UUID: NotificationJob] = [:]

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    let id = UUID()
    let job = NotificationJob(content: request.content, handler: contentHandler) { [weak self] in
      guard let self else { return }
      self.lock.lock()
      self.jobs.removeValue(forKey: id)
      self.lock.unlock()
    }
    lock.lock()
    jobs[id] = job
    lock.unlock()
    job.start()
  }

  override func serviceExtensionTimeWillExpire() {
    lock.lock()
    let pending = Array(jobs.values)
    lock.unlock()
    pending.forEach { $0.expire() }
  }
}

private final class NotificationJob {
  private let lock = NSLock()
  private let original: UNNotificationContent
  private let onFinished: () -> Void
  private var handler: ((UNNotificationContent) -> Void)?
  private let runtime = NotificationRuntime()
  private var deadline: DispatchWorkItem?
  private var fallback: UNNotificationContent?
  private var avatarRequest: NotificationAvatarRequest?

  init(content: UNNotificationContent, handler: @escaping (UNNotificationContent) -> Void, onFinished: @escaping () -> Void) {
    original = content
    self.handler = handler
    self.onFinished = onFinished
  }

  func start() {
    let deadline = DispatchWorkItem { [weak self] in self?.expire() }
    self.deadline = deadline
    DispatchQueue.global().asyncAfter(deadline: .now() + 25, execute: deadline)
    runtime.start(payload: original.userInfo) { [weak self] result in self?.finish(result) }
  }

  func expire() {
    runtime.stop()
    lock.lock()
    let content = fallback
    lock.unlock()
    deliver(content)
  }

  private func finish(_ result: [String: Any]?) {
    guard result?["status"] as? String == "notify",
      let mutable = original.mutableCopy() as? UNMutableNotificationContent else {
      deliver(nil); return
    }
    mutable.title = result?["title"] as? String ?? ""
    mutable.subtitle = result?["subtitle"] as? String ?? ""
    mutable.body = result?["body"] as? String ?? ""
    mutable.sound = .default
    mutable.userInfo = ["accountPubkey": result?["accountPubkey"] as? String ?? "",
      "rumorId": result?["rumorId"] as? String ?? ""]
    lock.lock()
    guard handler != nil else { lock.unlock(); return }
    fallback = mutable
    lock.unlock()
    guard let identity = result?["communication"] as? [String: Any] else {
      deliver(mutable); return
    }
    let decorate: (Data?) -> Void = { [weak self] image in
      Task {
        guard let self else { return }
        guard self.isActive() else { return }
        let content = await CommunicationNotification.update(mutable, identity: identity, imageData: image)
        self.deliver(content)
      }
    }
    if let address = result?["avatarUrl"] as? String {
      let request = NotificationAvatarRequest()
      lock.lock()
      guard handler != nil else { lock.unlock(); return }
      avatarRequest = request
      lock.unlock()
      request.start(address, completion: decorate)
    } else {
      decorate(nil)
    }
  }

  private func isActive() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return handler != nil
  }

  private func deliver(_ candidate: UNNotificationContent?) {
    lock.lock()
    guard let handler else { lock.unlock(); return }
    self.handler = nil
    deadline?.cancel()
    let request = avatarRequest
    avatarRequest = nil
    fallback = nil
    lock.unlock()
    request?.cancel()
    let content: UNNotificationContent
    if SharedNotificationContext.snapshot()["userPresent"] as? Bool != true, let candidate {
      content = candidate
    } else {
      // Filtering requires Apple's granted usernotifications.filtering entitlement.
      content = UNNotificationContent()
    }
    handler(content)
    onFinished()
  }
}

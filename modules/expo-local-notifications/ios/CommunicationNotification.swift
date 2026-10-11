import Foundation
import ImageIO
import Intents
import UniformTypeIdentifiers
import UserNotifications

/** Shared presentation for APNs and local delivery. Never receives identity when previews are off. */
enum CommunicationNotification {
  static func update(_ content: UNNotificationContent, identity: [String: Any], imageData: Data?) async -> UNNotificationContent {
    guard let senderId = identity["senderId"] as? String,
      let senderName = identity["senderName"] as? String,
      let recipientId = identity["recipientId"] as? String,
      let conversationId = identity["conversationId"] as? String else { return content }
    let image = imageData.flatMap(thumbnail).map { INImage(imageData: $0) }
    let sender = INPerson(personHandle: INPersonHandle(value: senderId, type: .unknown),
      nameComponents: nil, displayName: senderName, image: image,
      contactIdentifier: nil, customIdentifier: senderId, isMe: false)
    let recipient = INPerson(personHandle: INPersonHandle(value: recipientId, type: .unknown),
      nameComponents: nil, displayName: nil, image: nil,
      contactIdentifier: nil, customIdentifier: recipientId, isMe: true)
    let groupName = identity["groupName"] as? String
    let intent = INSendMessageIntent(recipients: [recipient], outgoingMessageType: .outgoingMessageText,
      content: content.body, speakableGroupName: groupName.map { INSpeakableString(spokenPhrase: $0) },
      conversationIdentifier: conversationId, serviceName: nil, sender: sender, attachments: nil)
    if let image { intent.setImage(image, forParameterNamed: \INSendMessageIntent.sender) }
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    do {
      try await interaction.donate()
      return try content.updating(from: intent)
    } catch {
      // Intent/image failures must not discard an otherwise eligible notification.
      return content
    }
  }

  static func localImage(_ path: String?) -> Data? {
    guard let path else { return nil }
    let url = path.hasPrefix("file://") ? URL(string: path) : URL(fileURLWithPath: path)
    guard let url, url.isFileURL,
      let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
      size <= 1_048_576 else { return nil }
    return try? Data(contentsOf: url, options: .mappedIfSafe)
  }

  private static func thumbnail(_ data: Data) -> Data? {
    guard data.count <= 1_048_576,
      let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 256,
        kCGImageSourceShouldCacheImmediately: true,
      ] as CFDictionary) else { return nil }
    let output = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination) ? output as Data : nil
  }
}

/** A short, bounded avatar request. No credentials, disk cache, cookies, or redirects. */
final class NotificationAvatarRequest: NSObject, URLSessionDataDelegate {
  private final class CachedImage: NSObject {
    let data: Data
    let expires = Date().addingTimeInterval(300)
    init(_ data: Data) { self.data = data }
  }
  private static let cache: NSCache<NSString, CachedImage> = {
    let cache = NSCache<NSString, CachedImage>()
    cache.totalCostLimit = 2_097_152
    cache.countLimit = 16
    return cache
  }()
  private var address: String?
  private var cancelled = false
  private var data = Data()
  private var completion: ((Data?) -> Void)?
  private var session: URLSession?
  private let lock = NSLock()
  private let limit = 1_048_576

  func start(_ address: String, completion: @escaping (Data?) -> Void) {
    guard let url = URL(string: address), url.scheme == "https", url.user == nil, url.password == nil else {
      completion(nil); return
    }
    lock.lock()
    guard !cancelled else { lock.unlock(); completion(nil); return }
    if let cached = Self.cache.object(forKey: address as NSString), cached.expires > Date() {
      lock.unlock()
      completion(cached.data)
      return
    }
    self.address = address
    self.completion = completion
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 3
    configuration.timeoutIntervalForResource = 3
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    lock.unlock()
    var request = URLRequest(url: url)
    request.setValue("image/*", forHTTPHeaderField: "Accept")
    session.dataTask(with: request).resume()
  }

  func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
    complete(nil)
  }

  private func complete(_ image: Data?) {
    lock.lock()
    let callback = completion
    if let image, let address, !cancelled, callback != nil {
      Self.cache.setObject(CachedImage(image), forKey: address as NSString, cost: image.count)
    }
    completion = nil
    let currentSession = session
    session = nil
    data.removeAll()
    lock.unlock()
    currentSession?.invalidateAndCancel()
    callback?(image)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let response = response as? HTTPURLResponse, response.statusCode == 200,
      response.expectedContentLength <= limit,
      response.mimeType?.hasPrefix("image/") == true else { completionHandler(.cancel); return }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    lock.lock()
    let allowed = completion != nil && data.count + chunk.count <= limit
    if allowed { data.append(chunk) }
    lock.unlock()
    if !allowed { dataTask.cancel() }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    lock.lock()
    let image = error == nil && !data.isEmpty ? data : nil
    lock.unlock()
    complete(image)
  }
}

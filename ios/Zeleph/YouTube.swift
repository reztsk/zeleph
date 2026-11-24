import Foundation

// Extraction audio directement depuis l'iPhone (IP de l'utilisateur, pas celle d'un serveur repérée comme robot) :
// API InnerTube /player, même logique que worker/yt.js. Client VISIONOS + visitorData, puis IOS ; itag 140 (AAC/M4A).
// Le fichier est téléchargé en entier puis lu en local : aucune publicité (elles n'existent que dans le lecteur YouTube).
enum YouTube {
    private struct Client { let id: Int; let ctx: [String: String]; let ua: String; let visitor: Bool }
    private static let clients = [
        Client(id: 101, ctx: ["clientName": "VISIONOS", "clientVersion": "0.1"],
               ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", visitor: true),
        Client(id: 5, ctx: ["clientName": "IOS", "clientVersion": "20.10.4", "deviceMake": "Apple", "deviceModel": "iPhone16,2", "osName": "iPhone", "osVersion": "18.3.2.22D82"],
               ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)", visitor: false),
    ]
    private static let webUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    private static let session = URLSession(configuration: .ephemeral) // aucun cookie YouTube conservé
    private static let chunk = 4 << 20

    struct Failure: LocalizedError { let errorDescription: String? }

    private static func at(_ o: Any?, _ i: Int) -> Any? { (o as? [Any]).flatMap { i < $0.count ? $0[i] : nil } }

    // visitorData : identifiant visiteur anonyme exigé par VISIONOS (même source que la page YouTube).
    private static var visitorCache: (value: String, until: Date)? // shortcut: accès non synchronisé, au pire 2 requêtes
    private static func visitorData() async throws -> String {
        if let c = visitorCache, c.until > Date() { return c.value }
        var req = URLRequest(url: URL(string: "https://www.youtube.com/sw.js_data")!)
        req.setValue(webUA, forHTTPHeaderField: "user-agent")
        req.timeoutInterval = 8
        let (d, _) = try await session.data(for: req)
        var s = String(decoding: d, as: UTF8.self)
        if s.hasPrefix(")]}'") { s.removeFirst(4) }
        let j = try JSONSerialization.jsonObject(with: Data(s.utf8))
        guard let v = at(at(at(at(at(j, 0), 2), 0), 0), 13) as? String else { throw Failure(errorDescription: "visitorData introuvable") }
        visitorCache = (v, Date().addingTimeInterval(6 * 3600))
        return v
    }

    private static func audioURL(_ id: String, _ k: Client) async throws -> (URL, Int) {
        var visitor: String?
        if k.visitor { visitor = try await visitorData() }
        var client: [String: Any] = k.ctx
        client["hl"] = "fr"; client["gl"] = "FR"
        if let visitor { client["visitorData"] = visitor }
        var req = URLRequest(url: URL(string: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false")!)
        req.httpMethod = "POST"
        req.timeoutInterval = 10
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.setValue(k.ua, forHTTPHeaderField: "user-agent")
        req.setValue(String(k.id), forHTTPHeaderField: "x-youtube-client-name")
        req.setValue(k.ctx["clientVersion"], forHTTPHeaderField: "x-youtube-client-version")
        if let visitor { req.setValue(visitor, forHTTPHeaderField: "x-goog-visitor-id") }
        req.httpBody = try JSONSerialization.data(withJSONObject: ["videoId": id, "context": ["client": client], "contentCheckOk": true, "racyCheckOk": true] as [String: Any])
        let (d, _) = try await session.data(for: req)
        let p = try JSONSerialization.jsonObject(with: d) as? [String: Any] ?? [:]
        let play = p["playabilityStatus"] as? [String: Any]
        guard play?["status"] as? String == "OK" else { throw Failure(errorDescription: play?["reason"] as? String ?? "Titre indisponible") }
        let formats = (p["streamingData"] as? [String: Any])?["adaptiveFormats"] as? [[String: Any]] ?? []
        let aac = formats.filter { $0["url"] is String && ($0["mimeType"] as? String ?? "").hasPrefix("audio/mp4") }
        let f = aac.first { $0["itag"] as? Int == 140 } ?? aac.max { ($0["bitrate"] as? Int ?? 0) < ($1["bitrate"] as? Int ?? 0) }
        guard let f, let url = URL(string: f["url"] as? String ?? "") else { throw Failure(errorDescription: "Aucun flux audio") }
        return (url, Int(f["contentLength"] as? String ?? "") ?? 0)
    }

    // Téléchargement par plages de 4 Mo (googlevideo bride les grosses requêtes d'un coup).
    private static func fetch(_ url: URL, ua: String, length: Int, to file: URL) async throws {
        FileManager.default.createFile(atPath: file.path, contents: nil)
        let h = try FileHandle(forWritingTo: file)
        defer { try? h.close() }
        var off = 0
        repeat {
            try Task.checkCancellation()
            var req = URLRequest(url: url)
            req.setValue(ua, forHTTPHeaderField: "user-agent")
            if length > 0 { req.setValue("bytes=\(off)-\(min(off + chunk, length) - 1)", forHTTPHeaderField: "range") }
            req.timeoutInterval = 20
            let (d, res) = try await session.data(for: req)
            let status = (res as? HTTPURLResponse)?.statusCode ?? 0
            guard status == 200 || status == 206, !d.isEmpty else { throw Failure(errorDescription: "Flux refusé (\(status))") }
            try h.write(contentsOf: d)
            off += d.count
            if status == 200 { break } // fichier entier reçu d'un coup
        } while off < length
    }

    // Essaie chaque client jusqu'à obtenir le fichier complet (un client bridé échoue au 2e morceau et passe la main).
    static func download(_ id: String, to dest: URL) async throws {
        let part = dest.appendingPathExtension("part")
        defer { try? FileManager.default.removeItem(at: part) }
        var last: Error = Failure(errorDescription: "Titre indisponible")
        for k in clients {
            do {
                let (url, len) = try await audioURL(id, k)
                try await fetch(url, ua: k.ua, length: len, to: part)
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: part, to: dest)
                return
            } catch is CancellationError { throw CancellationError() }
            catch { last = error }
        }
        throw last
    }
}

// Cache disque des titres (Caches/audio) : un seul téléchargement par titre même si lecture et préchargement se croisent.
actor AudioCache {
    static let shared = AudioCache()
    private var jobs: [String: Task<Void, Error>] = [:]
    private let dir: URL = {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("audio", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()
    private let keep = 150

    func url(_ id: String) -> URL { dir.appendingPathComponent("\(id).m4a") }

    func file(_ id: String) async throws -> URL {
        let dest = url(id)
        if FileManager.default.fileExists(atPath: dest.path) {
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: dest.path)
            return dest
        }
        let job = jobs[id] ?? Task { try await YouTube.download(id, to: dest) }
        jobs[id] = job
        defer { jobs[id] = nil }
        try await job.value
        prune()
        return dest
    }

    func forget(_ id: String) { try? FileManager.default.removeItem(at: url(id)) }

    private func prune() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]), files.count > keep else { return }
        let date = { (u: URL) in (try? u.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast }
        files.filter { $0.pathExtension == "m4a" }.sorted { date($0) > date($1) }.dropFirst(keep).forEach { try? fm.removeItem(at: $0) }
    }
}

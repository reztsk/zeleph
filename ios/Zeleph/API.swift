import Foundation

// Client du Worker Zeleph : mêmes routes que la PWA, session par cookie HttpOnly « zl » (HTTPCookieStorage le garde).
enum API {
    static let base = URL(string: "https://zeleph.rezmusic-party-server.workers.dev")!

    struct Failure: LocalizedError {
        let status: Int, code: String?, message: String
        var errorDescription: String? { message }
    }
    private struct ErrorBody: Decodable { let error: String?; let message: String? }

    static func call<T: Decodable>(_ method: String, _ path: String, body: Encodable? = nil) async throws -> T {
        guard let url = URL(string: "\(base.absoluteString)/api/\(path)") else { throw Failure(status: 0, code: "bad_url", message: "Requête invalide") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 20
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let data: Data, res: URLResponse
        do { (data, res) = try await URLSession.shared.data(for: req) }
        catch { throw Failure(status: 0, code: "offline", message: "Pas de connexion internet") }
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let e = try? JSONDecoder().decode(ErrorBody.self, from: data)
            if status == 401 && !path.hasPrefix("auth/") { await MainActor.run { Session.shared.expired() } }
            throw Failure(status: status, code: e?.error, message: e?.message ?? "Erreur \(status)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    static func get<T: Decodable>(_ path: String) async throws -> T { try await call("GET", path) }

    static func query(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
}

private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ v: Encodable) { value = v }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
struct OK: Decodable {}

// ---------- Modèles (mêmes champs que les réponses JSON du Worker) ----------
struct Artist: Codable, Hashable { let name: String; let id: String? }
struct Album: Codable, Hashable { let name: String; let id: String? }

struct Track: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    var artists: [Artist]?
    var album: Album?
    var thumb: String?
    var dur: Double?
    var explicit: Bool?

    var artistText: String { (artists ?? []).map(\.name).joined(separator: ", ") }
    var thumbURL: URL? { thumb.flatMap(URL.init(string:)) }
}

// Album, playlist ou artiste YouTube Music dans les résultats de recherche.
struct BrowseItem: Codable, Hashable, Identifiable {
    let kind: String
    let id: String
    let title: String
    var subtitle: String?
    var thumb: String?
}

struct SearchResult: Decodable { var songs: [Track] = []; var albums: [BrowseItem] = []; var playlists: [BrowseItem] = [] }
struct YTCollection: Decodable { let id: String; let title: String; var subtitle: String?; var thumb: String?; var tracks: [Track] }

struct Me: Codable, Equatable { let id: String; let handle: String; let name: String; let email: String? }
struct MeResponse: Decodable { let me: Me }

struct PlaylistSummary: Decodable, Hashable, Identifiable {
    let id: String
    let name: String
    let count: Int
    var mine: Bool?
    var cover: String?
    // Pochette perso servie par le Worker (/api/img/p/…) ou pochette YouTube absolue.
    var coverURL: URL? { cover.flatMap { $0.hasPrefix("/") ? URL(string: API.base.absoluteString + $0) : URL(string: $0) } }
}
struct Library: Decodable { let playlists: [PlaylistSummary]; let shared: [PlaylistSummary]; let likes: Int }
struct PlaylistDetail: Decodable { let playlist: PlaylistSummary; let tracks: [Track] }
struct Tracks: Decodable { let tracks: [Track] }
struct Challenge: Decodable { let challenge: String }

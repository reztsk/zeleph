import Foundation
import UIKit

// Compte connecté. Le profil est gardé en local pour ouvrir l'app hors ligne ; un 401 du Worker déconnecte.
@MainActor
final class Session: ObservableObject {
    static let shared = Session()
    @Published private(set) var me: Me?
    private let key = "zeleph.me"
    private struct Token: Decodable { let token: String }

    private init() {
        me = UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(Me.self, from: $0) }
    }

    func refresh() async {
        guard let r: MeResponse = try? await API.get("me") else { return }
        signedIn(r.me)
    }
    func signedIn(_ m: Me) {
        me = m
        UserDefaults.standard.set(try? JSONEncoder().encode(m), forKey: key)
        Task {
            if let t: Token = try? await API.get("stream-token") { Player.shared.streamToken = t.token }
            await Likes.shared.load()
        }
    }
    func logout() async {
        let _: OK? = try? await API.call("POST", "auth/logout", body: [String: String]())
        expired()
    }
    func expired() {
        me = nil
        UserDefaults.standard.removeObject(forKey: key)
        Player.shared.stop()
        Player.shared.streamToken = nil
    }
}

// Titres aimés (mêmes routes que la PWA).
@MainActor
final class Likes: ObservableObject {
    static let shared = Likes()
    @Published private(set) var ids = Set<String>()
    private struct Ids: Decodable { let ids: [String] }

    func load() async { if let r: Ids = try? await API.get("likes/ids") { ids = Set(r.ids) } }
    func toggle(_ t: Track) {
        let was = ids.contains(t.id)
        if was { ids.remove(t.id) } else { ids.insert(t.id) }
        Task {
            do {
                if was { let _: OK = try await API.call("DELETE", "likes/\(t.id)") }
                else { let _: OK = try await API.call("PUT", "likes/\(t.id)", body: ["track": t]) }
            } catch {
                if was { ids.insert(t.id) } else { ids.remove(t.id) }
                Player.shared.message = error.localizedDescription
            }
        }
    }
}

// Mises à jour : compare le numéro de build installé à celui publié dans la source AltStore (apps.json sur GitHub).
@MainActor
final class Updater: ObservableObject {
    static let shared = Updater()
    static let source = URL(string: "https://raw.githubusercontent.com/reztsk/zeleph/main/apps.json")!
    static let repo = URL(string: "https://github.com/reztsk/zeleph")!
    static var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?" }
    private static var build: Int { Int(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") ?? 0 }

    @Published var available: String?
    private struct Source: Decodable {
        struct App: Decodable { struct Version: Decodable { let version: String; let buildVersion: String? }; let versions: [Version] }
        let apps: [App]
    }

    // nil = vérification impossible (hors ligne, dépôt privé…).
    @discardableResult
    func check() async -> Bool? {
        let req = URLRequest(url: Self.source, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        guard let r = try? await URLSession.shared.data(for: req),
              (r.1 as? HTTPURLResponse)?.statusCode == 200,
              let v = (try? JSONDecoder().decode(Source.self, from: r.0))?.apps.first?.versions.first else { return nil }
        let newer = (Int(v.buildVersion ?? "") ?? 0) > Self.build
        available = newer ? v.version : nil
        return newer
    }
    func openAltStore() {
        if let u = URL(string: "altstore://") { UIApplication.shared.open(u) }
    }
}

import SwiftUI

struct LibraryView: View {
    @State private var lib: Library?
    @State private var error: String?
    @State private var creating = false
    @State private var newName = ""

    var body: some View {
        List {
            if let error { Text(error).foregroundStyle(.secondary) }
            NavigationLink { LikesView() } label: {
                HStack(spacing: 12) {
                    Image(systemName: "heart.fill").foregroundStyle(.white).frame(width: 48, height: 48)
                        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color.zAccent))
                    VStack(alignment: .leading) { Text("Titres likés"); Text("\(lib?.likes ?? 0) titres").font(.caption).foregroundStyle(.secondary) }
                }
            }
            if let lib, !lib.playlists.isEmpty { Section("Mes playlists") { rows(lib.playlists) } }
            if let lib, !lib.shared.isEmpty { Section("Partagées avec moi") { rows(lib.shared) } }
        }
        .listStyle(.plain)
        .navigationTitle("Bibliothèque")
        .toolbar { Button { creating = true } label: { Image(systemName: "plus") }.accessibilityLabel("Nouvelle playlist") }
        .alert("Nouvelle playlist", isPresented: $creating) {
            TextField("Nom", text: $newName)
            Button("Créer") { create() }
            Button("Annuler", role: .cancel) { newName = "" }
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func rows(_ ps: [PlaylistSummary]) -> some View {
        ForEach(ps) { p in
            NavigationLink { PlaylistView(summary: p) } label: {
                HStack(spacing: 12) {
                    Cover(url: p.coverURL)
                    VStack(alignment: .leading) { Text(p.name).lineLimit(1); Text("\(p.count) titres").font(.caption).foregroundStyle(.secondary) }
                }
            }
        }
    }

    private func load() async {
        do { lib = try await API.get("library"); error = nil } catch { self.error = error.localizedDescription }
    }
    private func create() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        newName = ""
        guard !name.isEmpty else { return }
        Task {
            do { let _: OK = try await API.call("POST", "playlists", body: ["name": name]); await load() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct LikesView: View {
    @State private var tracks: [Track]?
    @State private var error: String?

    var body: some View {
        List {
            PlayButtons(tracks: tracks ?? []).listRowSeparator(.hidden)
            if let error { Text(error).foregroundStyle(.secondary) }
            TrackList(tracks: tracks ?? [])
        }
        .listStyle(.plain)
        .navigationTitle("Titres likés")
        .task { do { tracks = (try await API.get("likes") as Tracks).tracks } catch { self.error = error.localizedDescription } }
    }
}

struct PlaylistView: View {
    let summary: PlaylistSummary
    @State private var tracks: [Track]?
    @State private var error: String?

    var body: some View {
        List {
            VStack(spacing: 10) {
                Cover(url: summary.coverURL, size: 200, radius: 12)
                Text(summary.name).font(.title3.bold())
                PlayButtons(tracks: tracks ?? [])
            }
            .frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)
            if let error { Text(error).foregroundStyle(.secondary) }
            TrackList(tracks: tracks ?? [], onDelete: summary.mine == true ? remove : nil)
        }
        .listStyle(.plain)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        do { tracks = (try await API.get("playlists/\(summary.id)") as PlaylistDetail).tracks } catch { self.error = error.localizedDescription }
    }
    private func remove(_ t: Track) {
        Task {
            do { let _: OK = try await API.call("DELETE", "playlists/\(summary.id)/tracks/\(t.id)"); await load() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct NowPlayingView: View {
    @ObservedObject private var player = Player.shared
    @ObservedObject private var likes = Likes.shared
    @State private var scrub: Double?

    var body: some View {
        VStack(spacing: 22) {
            Capsule().fill(.secondary).frame(width: 40, height: 5).padding(.top, 10)
            Spacer(minLength: 0)
            if let t = player.current {
                Cover(url: t.thumbURL, size: 300, radius: 14).shadow(radius: 20)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(t.title).font(.title3.bold()).lineLimit(1)
                        Text(t.artistText).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button { likes.toggle(t) } label: {
                        Image(systemName: likes.ids.contains(t.id) ? "heart.fill" : "heart").font(.title2).foregroundStyle(Color.zAccent)
                    }
                    .accessibilityLabel(likes.ids.contains(t.id) ? "Retirer des favoris" : "J'aime")
                }
                VStack(spacing: 4) {
                    Slider(value: Binding(get: { scrub ?? player.time }, set: { scrub = $0 }), in: 0...max(player.duration, 1), onEditingChanged: { editing in
                        if !editing, let s = scrub { player.seek(s); scrub = nil }
                    })
                    HStack {
                        Text(clock(scrub ?? player.time))
                        Spacer()
                        Text("-" + clock(max(0, player.duration - (scrub ?? player.time))))
                    }
                    .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
                HStack(spacing: 50) {
                    Button { player.previous() } label: { Image(systemName: "backward.fill").font(.title) }.accessibilityLabel("Précédent")
                    Button { player.toggle() } label: {
                        ZStack {
                            if player.loading { ProgressView().controlSize(.large) }
                            else { Image(systemName: player.playing ? "pause.fill" : "play.fill").font(.system(size: 44)) }
                        }
                        .frame(width: 60, height: 60)
                    }
                    .accessibilityLabel(player.playing ? "Pause" : "Lecture")
                    Button { player.next() } label: { Image(systemName: "forward.fill").font(.title) }.accessibilityLabel("Suivant")
                }
                .foregroundStyle(.white)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 30)
        .background(Color.black.ignoresSafeArea())
    }
}

struct SettingsView: View {
    @ObservedObject private var session = Session.shared
    @ObservedObject private var updater = Updater.shared
    @State private var checking = false
    @State private var result: String?

    var body: some View {
        Form {
            if let me = session.me {
                Section("Compte") {
                    LabeledContent("Nom", value: me.name)
                    LabeledContent("Pseudo", value: "@\(me.handle)")
                }
            }
            Section("Application & Mises à jour") {
                LabeledContent("Version installée", value: Updater.version)
                Button {
                    checking = true
                    Task {
                        switch await updater.check() {
                        case true?: result = nil // l'alerte de mise à jour s'affiche
                        case false?: result = "Tu utilises déjà la dernière version."
                        case nil: result = "Vérification impossible pour le moment."
                        }
                        checking = false
                    }
                } label: {
                    HStack { Text("Vérifier les mises à jour"); if checking { Spacer(); ProgressView() } }
                }
                .disabled(checking)
                if let result { Text(result).font(.footnote).foregroundStyle(.secondary) }
                Link("Dépôt GitHub", destination: Updater.repo)
            }
            Section {
                Button("Se déconnecter", role: .destructive) { Task { await session.logout() } }
            }
        }
        .navigationTitle("Réglages")
    }
}

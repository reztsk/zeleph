import SwiftUI

// Ligne de titre : touche = lecture de la liste à partir de ce titre ; appui long = J'aime / Ajouter à une playlist.
struct TrackRow: View {
    let track: Track
    let onTap: () -> Void
    var onDelete: (() -> Void)?
    @ObservedObject private var player = Player.shared
    @ObservedObject private var likes = Likes.shared
    @State private var adding = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Cover(url: track.thumbURL)
                VStack(alignment: .leading, spacing: 2) {
                    Text(track.title).lineLimit(1)
                        .foregroundStyle(player.current?.id == track.id ? Color.zAccent : .primary)
                    Text(track.artistText).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                if likes.ids.contains(track.id) { Image(systemName: "heart.fill").font(.caption).foregroundStyle(Color.zAccent) }
                if let d = track.dur, d > 0 { Text(clock(d)).font(.caption).monospacedDigit().foregroundStyle(.secondary) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { likes.toggle(track) } label: {
                Label(likes.ids.contains(track.id) ? "Retirer des favoris" : "J'aime", systemImage: likes.ids.contains(track.id) ? "heart.slash" : "heart")
            }
            Button { adding = true } label: { Label("Ajouter à une playlist", systemImage: "text.badge.plus") }
            if let onDelete { Button(role: .destructive, action: onDelete) { Label("Retirer de la playlist", systemImage: "trash") } }
        }
        .sheet(isPresented: $adding) { PlaylistPicker(track: track) }
    }
}

struct TrackList: View {
    let tracks: [Track]
    var onDelete: ((Track) -> Void)?

    var body: some View {
        ForEach(Array(tracks.enumerated()), id: \.offset) { i, t in
            TrackRow(track: t, onTap: { Player.shared.play(tracks, at: i) }, onDelete: onDelete.map { f in { f(t) } })
        }
    }
}

// Boutons « Lecture » / « Aléatoire » en tête d'album ou de playlist.
struct PlayButtons: View {
    let tracks: [Track]
    var body: some View {
        HStack(spacing: 12) {
            big("Lecture", "play.fill") { Player.shared.play(tracks, at: 0) }
            big("Aléatoire", "shuffle") { Player.shared.play(tracks.shuffled(), at: 0) }
        }
        .disabled(tracks.isEmpty)
    }
    private func big(_ label: String, _ icon: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) {
            Label(label, systemImage: icon).bold().frame(maxWidth: .infinity, minHeight: 44)
        }
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.zSurface))
        .foregroundStyle(Color.zAccent)
    }
}

struct SearchView: View {
    @State private var q = ""
    @State private var res = SearchResult()
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        List {
            if busy { HStack { Spacer(); ProgressView(); Spacer() }.listRowSeparator(.hidden) }
            if let error { Text(error).foregroundStyle(.secondary) }
            if !res.songs.isEmpty { Section("Titres") { TrackList(tracks: res.songs) } }
            if !res.albums.isEmpty { Section("Albums") { browse(res.albums) } }
            if !res.playlists.isEmpty { Section("Playlists") { browse(res.playlists) } }
        }
        .listStyle(.plain)
        .navigationTitle("Recherche")
        .searchable(text: $q, prompt: "Titres, artistes, albums")
        .task(id: q) {
            try? await Task.sleep(nanoseconds: 350_000_000) // attend la fin de la frappe
            guard !Task.isCancelled else { return }
            await run()
        }
    }

    private func browse(_ items: [BrowseItem]) -> some View {
        ForEach(items) { item in
            NavigationLink { CollectionView(item: item) } label: {
                HStack(spacing: 12) {
                    Cover(url: item.thumb.flatMap(URL.init(string:)))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).lineLimit(1)
                        Text(item.subtitle ?? "").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            }
        }
    }

    private func run() async {
        let query = q.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { res = SearchResult(); error = nil; return }
        busy = true
        defer { busy = false }
        do { res = try await API.get("search?q=\(API.query(query))"); error = nil }
        catch { if !Task.isCancelled { self.error = error.localizedDescription } }
    }
}

// Album ou playlist YouTube Music.
struct CollectionView: View {
    let item: BrowseItem
    @State private var data: YTCollection?
    @State private var error: String?

    var body: some View {
        List {
            VStack(spacing: 10) {
                Cover(url: (data?.thumb ?? item.thumb).flatMap(URL.init(string:)), size: 220, radius: 12)
                Text(data?.title ?? item.title).font(.title3.bold()).multilineTextAlignment(.center)
                if let s = data?.subtitle ?? item.subtitle { Text(s).font(.footnote).foregroundStyle(.secondary) }
                PlayButtons(tracks: data?.tracks ?? [])
            }
            .frame(maxWidth: .infinity)
            .listRowSeparator(.hidden)
            if let error { Text(error).foregroundStyle(.secondary) }
            if data == nil && error == nil { HStack { Spacer(); ProgressView(); Spacer() }.listRowSeparator(.hidden) }
            TrackList(tracks: data?.tracks ?? [])
        }
        .listStyle(.plain)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do { data = try await API.get("collection/\(item.id)") } catch { self.error = error.localizedDescription }
        }
    }
}

// Choix d'une de mes playlists pour y ajouter un titre.
struct PlaylistPicker: View {
    let track: Track
    @Environment(\.dismiss) private var dismiss
    @State private var lists: [PlaylistSummary] = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.secondary) }
                ForEach(lists) { p in
                    Button {
                        Task {
                            do {
                                let _: OK = try await API.call("POST", "playlists/\(p.id)/tracks", body: ["track": track])
                                Player.shared.message = "Ajouté à « \(p.name) »"
                                dismiss()
                            } catch { self.error = error.localizedDescription }
                        }
                    } label: {
                        HStack(spacing: 12) { Cover(url: p.coverURL, size: 40); Text(p.name) }
                    }
                }
            }
            .navigationTitle("Ajouter à une playlist")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } }
            .task {
                do { lists = (try await API.get("library") as Library).playlists.filter { $0.mine != false } }
                catch { self.error = error.localizedDescription }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

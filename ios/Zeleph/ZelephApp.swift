import SwiftUI

extension Color {
    static let zAccent = Color(red: 250 / 255, green: 45 / 255, blue: 85 / 255) // #fa2d55, accent du thème « Noir OLED Pur »
    static let zSurface = Color(red: 17 / 255, green: 17 / 255, blue: 19 / 255)
}

@main
struct ZelephApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

struct RootView: View {
    @ObservedObject private var session = Session.shared
    @ObservedObject private var player = Player.shared
    @ObservedObject private var updater = Updater.shared

    var body: some View {
        Group {
            if session.me == nil { AuthView() } else { MainTabs() }
        }
        .tint(.zAccent)
        .preferredColorScheme(.dark)
        .task {
            if session.me != nil { await session.refresh() }
            await updater.check()
        }
        .alert("Mise à jour disponible", isPresented: Binding(get: { updater.available != nil }, set: { if !$0 { updater.available = nil } })) {
            Button("Ouvrir AltStore") { updater.openAltStore() }
            Button("Plus tard", role: .cancel) {}
        } message: {
            Text("Zeleph \(updater.available ?? "") est disponible dans AltStore.")
        }
        .overlay(alignment: .top) {
            if let m = player.message {
                Text(m)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Capsule().fill(Color.zSurface))
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: m) {
                        try? await Task.sleep(nanoseconds: 3_000_000_000)
                        withAnimation { player.message = nil }
                    }
            }
        }
        .animation(.easeOut(duration: 0.2), value: player.message)
    }
}

struct MainTabs: View {
    @ObservedObject private var player = Player.shared

    var body: some View {
        TabView {
            NavigationStack { SearchView().withMini() }
                .tabItem { Label("Recherche", systemImage: "magnifyingglass") }
            NavigationStack { LibraryView().withMini() }
                .tabItem { Label("Bibliothèque", systemImage: "square.stack.fill") }
            NavigationStack { SettingsView().withMini() }
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
        }
        .sheet(isPresented: $player.expanded) { NowPlayingView() }
    }
}

extension View {
    func withMini() -> some View { safeAreaInset(edge: .bottom) { MiniPlayer() } }
}

struct Cover: View {
    let url: URL?
    var size: CGFloat = 48
    var radius: CGFloat = 6

    var body: some View {
        AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: {
            Color.zSurface.overlay(Image(systemName: "music.note").foregroundStyle(.secondary))
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

struct MiniPlayer: View {
    @ObservedObject private var player = Player.shared

    var body: some View {
        if let t = player.current {
            HStack(spacing: 12) {
                Cover(url: t.thumbURL, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                    Text(t.artistText).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                if player.loading { ProgressView().frame(width: 36) } else {
                    Button { player.toggle() } label: { Image(systemName: player.playing ? "pause.fill" : "play.fill").font(.title3).frame(width: 36, height: 36) }
                        .accessibilityLabel(player.playing ? "Pause" : "Lecture")
                }
                Button { player.next() } label: { Image(systemName: "forward.fill").font(.title3).frame(width: 36, height: 36) }
                    .accessibilityLabel("Titre suivant")
            }
            .foregroundStyle(.white)
            .padding(8)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.zSurface))
            .padding(.horizontal, 8)
            .padding(.bottom, 4)
            .contentShape(Rectangle())
            .onTapGesture { player.expanded = true }
        }
    }
}

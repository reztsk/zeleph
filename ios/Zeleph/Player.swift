import AVFoundation
import MediaPlayer
import UIKit

// Lecteur natif : AVPlayer + session audio « playback » (arrière-plan, écran verrouillé) + MPNowPlayingInfoCenter.
// Source : fichier extrait sur l'iPhone (AudioCache) ; secours : flux remuxé du Worker (/api/stream, jeton signé).
@MainActor
final class Player: ObservableObject {
    static let shared = Player()

    @Published private(set) var queue: [Track] = []
    @Published private(set) var index = 0
    @Published private(set) var playing = false
    @Published private(set) var loading = false
    @Published private(set) var time: Double = 0
    @Published private(set) var duration: Double = 0
    @Published var expanded = false
    @Published var message: String?

    var current: Track? { queue.indices.contains(index) ? queue[index] : nil }
    var streamToken: String?

    private let player = AVPlayer()
    private var loadTask: Task<Void, Never>?
    private var statusObs: NSKeyValueObservation?
    private var rateObs: NSKeyValueObservation?
    private var artwork: MPMediaItemArtwork?
    private var errors = 0

    private init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        player.automaticallyWaitsToMinimizeStalling = false // fichier local : départ immédiat
        _ = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] t in
            Task { @MainActor in self?.time = t.seconds.isFinite ? t.seconds : 0 }
        }
        rateObs = player.observe(\.timeControlStatus) { [weak self] p, _ in
            let status = p.timeControlStatus
            Task { @MainActor in
                guard let self else { return }
                self.playing = status != .paused
                if status == .playing { self.loading = false }
                self.nowPlaying()
            }
        }
        let nc = NotificationCenter.default
        nc.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.next() }
        }
        nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
            let opts = n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let ended = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.ended.rawValue
            if ended && AVAudioSession.InterruptionOptions(rawValue: opts).contains(.shouldResume) {
                Task { @MainActor in self?.player.play() }
            }
        }
        remoteCommands()
    }

    // ---------- Commandes ----------
    func play(_ list: [Track], at i: Int) {
        guard list.indices.contains(i) else { return }
        queue = list
        index = i
        errors = 0
        start()
    }
    func toggle() {
        guard current != nil else { return }
        if player.currentItem == nil { start() } else if playing { player.pause() } else { activate(); player.play() }
    }
    func next() {
        guard current != nil else { return }
        if index + 1 < queue.count { index += 1; start() } else { Task { await continueRadio() } }
    }
    func previous() {
        if time > 3 || index == 0 { seek(0) } else { index -= 1; start() }
    }
    func seek(_ s: Double) {
        player.seek(to: CMTime(seconds: max(0, s), preferredTimescale: 600))
        time = s
        nowPlaying()
    }
    func stop() {
        loadTask?.cancel()
        player.replaceCurrentItem(with: nil)
        queue = []; index = 0; expanded = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // Fin de file : « Poursuivre la lecture » avec la radio du dernier titre (route /api/radio du Worker).
    private func continueRadio() async {
        guard let t = current, let r: Tracks = try? await API.get("radio/\(t.id)") else { return }
        let known = Set(queue.map(\.id))
        let more = r.tracks.filter { !known.contains($0.id) }
        guard !more.isEmpty, current?.id == t.id else { return }
        queue += more
        index += 1
        start()
    }

    // ---------- Chargement ----------
    private func activate() { try? AVAudioSession.sharedInstance().setActive(true) }

    private func start() {
        guard let t = current else { return }
        loadTask?.cancel()
        player.replaceCurrentItem(with: nil)
        loading = true
        time = 0
        duration = t.dur ?? 0
        artwork = nil
        nowPlaying()
        loadArtwork(t)
        activate()
        loadTask = Task {
            let local = try? await AudioCache.shared.file(t.id)
            guard !Task.isCancelled, current?.id == t.id else { return }
            attach(local ?? streamURL(t.id), t)
        }
    }

    private func streamURL(_ id: String) -> URL {
        URL(string: "\(API.base.absoluteString)/api/stream/\(id)\(streamToken.map { "?t=\($0)" } ?? "")")!
    }

    private func attach(_ url: URL, _ t: Track) {
        let item = AVPlayerItem(url: url)
        statusObs = item.observe(\.status) { [weak self] item, _ in
            let status = item.status
            Task { @MainActor in self?.itemStatus(item, status, url, t) }
        }
        player.replaceCurrentItem(with: item)
        player.play()
    }

    private func itemStatus(_ item: AVPlayerItem, _ status: AVPlayerItem.Status, _ url: URL, _ t: Track) {
        guard item === player.currentItem else { return }
        switch status {
        case .readyToPlay:
            errors = 0
            let d = item.duration.seconds
            if d.isFinite && d > 0 { duration = d }
            nowPlaying()
            Task { let _: OK? = try? await API.call("POST", "history", body: ["track": t]) }
            prefetchNext()
        case .failed:
            if url.isFileURL { // fichier local illisible : on l'oublie et on passe par le Worker
                Task { await AudioCache.shared.forget(t.id) }
                attach(streamURL(t.id), t)
                return
            }
            errors += 1
            message = errors >= 3 ? "Lecture impossible pour le moment" : "Titre indisponible : \(t.title)"
            loading = false
            if errors < 3 { next() }
        default: break
        }
    }

    // Le titre suivant est extrait pendant l'écoute → lancement instantané.
    private func prefetchNext() {
        guard queue.indices.contains(index + 1) else { return }
        let id = queue[index + 1].id
        Task.detached(priority: .utility) { _ = try? await AudioCache.shared.file(id) }
    }

    // ---------- Écran verrouillé / Centre de contrôle ----------
    private func remoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.activate(); self?.player.play() }; return .success }
        c.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.player.pause() }; return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.toggle() }; return .success }
        c.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next() }; return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.previous() }; return .success }
        c.changePlaybackPositionCommand.addTarget { [weak self] e in
            let pos = (e as? MPChangePlaybackPositionCommandEvent)?.positionTime ?? 0
            Task { @MainActor in self?.seek(pos) }
            return .success
        }
    }

    private func nowPlaying() {
        guard let t = current else { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title,
            MPMediaItemPropertyArtist: t.artistText,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: time,
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        ]
        if let a = t.album?.name { info[MPMediaItemPropertyAlbumTitle] = a }
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(_ t: Track) {
        guard let u = t.thumbURL else { return }
        Task {
            guard let r = try? await URLSession.shared.data(from: u), let img = UIImage(data: r.0), current?.id == t.id else { return }
            artwork = Self.makeArtwork(img)
            nowPlaying()
        }
    }
    // Hors acteur principal : le système appelle ce bloc depuis un fil quelconque.
    nonisolated private static func makeArtwork(_ img: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: img.size) { _ in img }
    }
}

func clock(_ s: Double) -> String {
    guard s.isFinite, s >= 0 else { return "0:00" }
    let n = Int(s)
    return n >= 3600 ? String(format: "%d:%02d:%02d", n / 3600, n / 60 % 60, n % 60) : String(format: "%d:%02d", n / 60, n % 60)
}

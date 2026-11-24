import SwiftUI

// Connexion (@pseudo ou e-mail + mot de passe) et inscription avec code reçu par e-mail (Brevo), via le Worker.
struct AuthView: View {
    private enum Mode: String, CaseIterable { case login = "Connexion", signup = "Inscription" }
    @State private var mode = Mode.login
    @State private var login = ""
    @State private var handle = ""
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var challenge: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "music.note")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(Color.zAccent)
                    .padding(.top, 60)
                Text("Zeleph").font(.largeTitle.bold())

                if let challenge {
                    Text("Entre le code à 6 chiffres reçu par e-mail.").foregroundStyle(.secondary).multilineTextAlignment(.center)
                    field("Code", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    action("Valider") {
                        let r: MeResponse = try await API.call("POST", "auth/verify", body: ["challenge": challenge, "code": code])
                        Session.shared.signedIn(r.me)
                    }
                    Button("Retour") { self.challenge = nil; code = "" }.foregroundStyle(.secondary)
                } else {
                    Picker("", selection: $mode) { ForEach(Mode.allCases, id: \.self) { Text($0.rawValue) } }
                        .pickerStyle(.segmented)
                    if mode == .login {
                        field("@pseudo ou e-mail", text: $login).textContentType(.username)
                        SecureField("Mot de passe", text: $password).textContentType(.password).modifier(FieldStyle())
                        action("Se connecter") {
                            let r: MeResponse = try await API.call("POST", "auth/login", body: ["login": login, "password": password])
                            Session.shared.signedIn(r.me)
                        }
                    } else {
                        field("@pseudo", text: $handle).textContentType(.username)
                        field("E-mail", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress)
                        SecureField("Mot de passe (8 caractères min.)", text: $password).textContentType(.newPassword).modifier(FieldStyle())
                        action("Créer mon compte") {
                            let r: Challenge = try await API.call("POST", "auth/signup", body: ["handle": handle, "email": email, "password": password])
                            challenge = r.challenge
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(Color.zAccent).font(.footnote).multilineTextAlignment(.center) }
            }
            .padding(.horizontal, 24)
        }
        .background(Color.black.ignoresSafeArea())
        .onChange(of: mode) { _ in error = nil }
    }

    private func field(_ label: String, text: Binding<String>) -> some View {
        TextField(label, text: text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .modifier(FieldStyle())
    }

    private func action(_ label: String, _ run: @escaping () async throws -> Void) -> some View {
        Button {
            busy = true; error = nil
            Task {
                do { try await run() } catch { self.error = error.localizedDescription }
                busy = false
            }
        } label: {
            Group { if busy { ProgressView().tint(.white) } else { Text(label).bold() } }
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.zAccent))
        .foregroundStyle(.white)
        .disabled(busy)
    }
}

struct FieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.zSurface))
    }
}

import UIKit
import Capacitor
import CapApp_SPM

// UIScene lifecycle adoption (#2747 — 1.0.2 build 6 rejection, Guideline 2.1(a)).
//
// iPadOS/iOS 27 hard-traps an app that links against the iOS 27 SDK and has not
// adopted the UIScene lifecycle: UIKit raises EXC_BREAKPOINT from
// __UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption at first scene
// creation, ~88ms after launch, before any app code runs. That is what killed
// build 6 on the review device (iPad15,3, "iPhone OS 27.0 (24A437)").
//
// Adopting scenes moves three things out of AppDelegate, because
// `AppDelegate.window` is nil once a scene manifest exists and every one of
// them was reaching through it:
//
//   1. The RASP pre-WebView BLOCK screen. Left in AppDelegate it would set
//      `window?.rootViewController` on a nil window — a silent no-op — and the
//      scene would then load the normal Capacitor WebView anyway. A detected
//      hooked process would launch straight into the wallet. That is a fail-OPEN
//      and a direct I4 violation, so the gate is enforced here, in
//      scene(_:willConnectTo:), before the Capacitor proxy is ever told about
//      the scene.
//   2. The app-switcher privacy cover (audit 2026-09-21 M8). Same nil window —
//      balances, addresses or a revealed phrase would land back in the iOS
//      snapshot.
//   3. Deep-link delivery. Under scenes UIKit stops calling
//      application(_:open:options:) and application(_:continue:) entirely and
//      calls scene(_:openURLContexts:) / scene(_:continue:) instead. Without
//      this class WalletConnect pairing, referral links and the Transak buy
//      return would all stop arriving.
//
// The native deep-link allowlist itself deliberately stays in AppDelegate
// (AppDelegate.isAllowedDeepLink) so there is exactly one copy of it and the
// existing source pin in src/__tests__/deepLinkAssociations.referral.test.js
// keeps checking the real thing.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        // BLOCK-tier RASP result computed pre-bridge in AppDelegate. Enforce it
        // here: replace the storyboard's root view controller with the native
        // block screen and return WITHOUT handing the scene to Capacitor, so no
        // bridge is created and no bridge JS ever executes.
        if AppDelegate.raspBlocked {
            showNativeBlockScreen(in: scene)
            return
        }

        Capacitor.SceneDelegateProxy.shared.scene(
            scene,
            willConnectTo: session,
            options: connectionOptions
        )
    }

    // MARK: - Deep links

    // Native trust boundary, mirroring the pre-scene AppDelegate behaviour
    // (Codex P2 2026-08-16): only allowlisted URLs are forwarded into Capacitor.
    // A rejected URL is dropped here, so the JS layer never sees it.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let allowed = URLContexts.filter { AppDelegate.isAllowedDeepLink($0.url) }
        // QA-INSTRUMENT-TEMP: remove before commit
        for c in URLContexts {
            NSLog("[VEYRNOX-QA] openURLContexts url=%@ allowed=%@",
                  c.url.absoluteString,
                  AppDelegate.isAllowedDeepLink(c.url) ? "YES" : "NO")
        }
        // QA-INSTRUMENT-TEMP end
        guard !allowed.isEmpty else { return }
        Capacitor.SceneDelegateProxy.shared.scene(scene, openURLContexts: allowed)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            guard let url = userActivity.webpageURL,
                  AppDelegate.isAllowedDeepLink(url) else { return }
        }
        Capacitor.SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: - App-switcher privacy cover (audit 2026-09-21 M8)

    // iOS snapshots the window for the app switcher when the scene resigns
    // active. Cover it with an opaque view until the scene is active again so
    // balances, addresses or a revealed phrase are not persisted in that
    // snapshot. Android uses FLAG_SECURE for the same purpose.
    private var privacyCover: UIView?

    func sceneWillResignActive(_ scene: UIScene) {
        guard let window = window, privacyCover == nil else { return }
        let cover = UIView(frame: window.bounds)
        cover.backgroundColor = UIColor(red: 0.02, green: 0.024, blue: 0.031, alpha: 1)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(cover)
        privacyCover = cover
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        privacyCover?.removeFromSuperview()
        privacyCover = nil
    }

    // MARK: - RASP block screen

    private func showNativeBlockScreen(in scene: UIScene) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let vc = UIViewController()
        vc.view.backgroundColor = UIColor(red: 0.02, green: 0.024, blue: 0.031, alpha: 1)
        let label = UILabel()
        label.text = "Security Alert\n\nThis device has been modified in a way that cannot be verified as safe. Veyrnox cannot start."
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.font = UIFont.systemFont(ofSize: 16, weight: .regular)
        label.translatesAutoresizingMaskIntoConstraints = false
        vc.view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: vc.view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: vc.view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: vc.view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: vc.view.trailingAnchor, constant: -32),
        ])
        // Build the window ourselves rather than reusing the storyboard's: the
        // storyboard root is the Capacitor bridge view controller, and
        // instantiating it is exactly what this gate exists to prevent.
        let blockWindow = UIWindow(windowScene: windowScene)
        blockWindow.rootViewController = vc
        window = blockWindow
        blockWindow.makeKeyAndVisible()
    }
}

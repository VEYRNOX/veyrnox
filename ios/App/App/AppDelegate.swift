import UIKit
import Capacitor
import CapApp_SPM
import Security
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Pre-WebView RASP gate: run BLOCK-tier checks (hookedProcess = dyld scan)
        // before the Capacitor bridge initialises. If detection fires, replace
        // rootViewController with a native block screen so the WebView never loads
        // and there is no Capacitor bridge for an attacker to hook at this point.
        if RaspIntegrityPlugin.earlyCheck() {
            showNativeBlockScreen()
            return true
        }

        // Crashlytics + Performance are opt-in for staging and Test Lab. The
        // production archive has neither the build flag nor Firebase config.
        FirebaseObservability.configureIfEnabled()

        // XCUITest fresh-install honesty. The smoke bundle passes
        // `--uitest-fresh-install` but nothing consumed it, so between reruns a
        // stale WKWebsiteDataStore (localStorage/IndexedDB) survived even though
        // the Keychain sweep below fired, letting the "fresh install" test pass
        // on non-fresh state. Wipe web storage + the app's UserDefaults suite so
        // the Keychain sweep runs and the WebView boots empty. Only active with
        // the flag — never in a real user install.
        if CommandLine.arguments.contains("--uitest-fresh-install") {
            if let bundleId = Bundle.main.bundleIdentifier {
                UserDefaults.standard.removePersistentDomain(forName: bundleId)
            }
            let store = WKWebsiteDataStore.default()
            let types = WKWebsiteDataStore.allWebsiteDataTypes()
            let sem = DispatchSemaphore(value: 0)
            store.removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0)) {
                sem.signal()
            }
            _ = sem.wait(timeout: .now() + 5)
            NSLog("[VEYRNOX] --uitest-fresh-install honored: WKWebsiteDataStore + UserDefaults wiped")
        }

        // First-launch Keychain cleanup: UserDefaults is wiped on app delete,
        // Keychain is not. If the flag is missing → fresh install → wipe stale
        // Keychain items left by a previous install so onboarding shows correctly.
        let freshKey = "veyrnox_fresh_install_v2"
        if !UserDefaults.standard.bool(forKey: freshKey) {
            let classes: [CFString] = [
                kSecClassGenericPassword,
                kSecClassInternetPassword
            ]
            for cls in classes {
                let query: [String: Any] = [kSecClass as String: cls]
                SecItemDelete(query as CFDictionary)
            }
            UserDefaults.standard.set(true, forKey: freshKey)
            NSLog("[VEYRNOX] First launch — cleared stale Keychain items")
        }
        return true
    }

    private func showNativeBlockScreen() {
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
        window?.rootViewController = vc
        window?.makeKeyAndVisible()
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    // Codex P2 2026-08-16: deep-link native trust-boundary. Prior behaviour
    // forwarded ANY custom-scheme URL and ANY universal-link NSUserActivity
    // straight into Capacitor with no allowlist at the app layer. Downstream
    // JS (src/components/DeepLinkHandler.jsx) does validate against a fixed
    // set (veyrnox://wc, https://veyrnox.com/wc, https://veyrnox.com/buy/return)
    // via extractWcUri + isVeyrnoxPairingUrl. This adds the native chokepoint
    // BEFORE the JS layer runs — a defence-in-depth position mirroring the
    // WalletConnect + buy-return allowlist. Rejected URLs return `false` so
    // the OS treats them as "app cannot handle" rather than opening a
    // silently-ignored request.
    private static let allowedSchemes: Set<String> = ["veyrnox", "https"]
    private static let allowedUniversalHosts: Set<String> = ["veyrnox.com"]
    private static let allowedUniversalPaths: [String] = ["/wc", "/wc/", "/buy/return"]

    private static func isAllowedDeepLink(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), allowedSchemes.contains(scheme) else {
            return false
        }
        if scheme == "veyrnox" {
            // veyrnox://wc?uri=… (host may parse as hostname='wc' or empty w/ path='/wc')
            if url.host?.lowercased() == "wc" { return true }
            if (url.host?.isEmpty ?? true) {
                let p = url.path
                if p == "/wc" || p.hasPrefix("/wc/") { return true }
            }
            return false
        }
        // https: universal link — restrict to the documented veyrnox.com paths.
        guard let host = url.host?.lowercased(), allowedUniversalHosts.contains(host) else {
            return false
        }
        let path = url.path
        return AppDelegate.allowedUniversalPaths.contains { path == $0 || path.hasPrefix($0 + "?") || path.hasPrefix($0 + "/") }
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        guard AppDelegate.isAllowedDeepLink(url) else { return false }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Universal links arrive as an NSUserActivity carrying the .webpageURL.
        // Only forward when the URL passes the same allowlist as open(url).
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            guard let url = userActivity.webpageURL, AppDelegate.isAllowedDeepLink(url) else { return false }
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

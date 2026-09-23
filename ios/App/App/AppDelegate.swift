import UIKit
import Capacitor
import CapApp_SPM
import Security
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    // BLOCK-tier RASP verdict, computed pre-bridge at launch (below) and
    // enforced by SceneDelegate.scene(_:willConnectTo:).
    //
    // Under the UIScene lifecycle (adopted for #2747) AppDelegate has no window,
    // so the block screen cannot be installed from here — assigning a root view
    // controller through it is a silent no-op and the scene would load the
    // Capacitor WebView anyway, i.e. fail OPEN. The verdict is computed here, at the
    // earliest possible moment and still before the bridge exists, and carried
    // to the scene which owns the window. Enforcement lives in SceneDelegate.
    static private(set) var raspBlocked = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Pre-WebView RASP gate: run BLOCK-tier checks (hookedProcess = dyld scan)
        // before the Capacitor bridge initialises.
        AppDelegate.raspBlocked = RaspIntegrityPlugin.earlyCheck()
        if AppDelegate.raspBlocked {
            return true
        }

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

    // UIScene lifecycle (#2747). One scene role only; the app declares
    // UIApplicationSupportsMultipleScenes = false in Info.plist because two
    // windows would mean two WebViews over one vault.
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration",
                                    sessionRole: connectingSceneSession.role)
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
    // WalletConnect + buy-return allowlist. Rejected URLs are dropped.
    //
    // Under the UIScene lifecycle UIKit no longer calls
    // application(_:open:options:) or application(_:continue:) — the equivalents
    // arrive on SceneDelegate. The allowlist stays here as the single source of
    // truth and SceneDelegate calls AppDelegate.isAllowedDeepLink before
    // forwarding anything into Capacitor.
    private static let allowedSchemes: Set<String> = ["veyrnox", "https"]
    private static let allowedUniversalHosts: Set<String> = ["veyrnox.com"]
    // "/r" forwards referral share links (/r/VYX-XXXXXX, #2527). JS still
    // validates the code shape in referralAttribution.js before storing it.
    // Omitting it made the OS hand /r/* to the app and the app refuse it (#2540).
    private static let allowedUniversalPaths: [String] = ["/wc", "/wc/", "/buy/return", "/r"]

    static func isAllowedDeepLink(_ url: URL) -> Bool {
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

}

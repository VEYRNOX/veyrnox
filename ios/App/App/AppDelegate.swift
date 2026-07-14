import UIKit
import Capacitor
import Security

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

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

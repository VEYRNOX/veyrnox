import UIKit
import Capacitor
import Security

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
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

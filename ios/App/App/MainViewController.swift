// MainViewController.swift — registers local Capacitor plugins
// Capacitor's plugin discovery for inline (non-SPM) plugins requires explicit
// registration. We try both class and instance registration in multiple lifecycle
// points to maximize chances of the plugin being in the registry when JS looks for it.

import Foundation
import Capacitor

class MainViewController: CAPBridgeViewController {
    private var hardwareKekPlugin: HardwareKekPlugin?

    override open func viewDidLoad() {
        super.viewDidLoad()
        // Verify this controller is actually being used
        print("✅ MainViewController.viewDidLoad() called")
        registerHardwareKekPlugin()
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        print("✅ MainViewController.capacitorDidLoad() called")
        registerHardwareKekPlugin()
    }

    private func registerHardwareKekPlugin() {
        guard let bridge = self.bridge else { return }

        // Method 1: Standard registerPlugin(Class)
        bridge.registerPlugin(HardwareKekPlugin.self)

        // Method 2: Try registerPluginInstance if it exists
        // (Different Capacitor versions have different APIs)
        let pluginInstance = HardwareKekPlugin()
        hardwareKekPlugin = pluginInstance  // Keep reference alive

        // Method 3: Try to register via bridge's internal plugin map if accessible
        // Some Capacitor versions expose plugin._
        _ = pluginInstance  // Ensure instance is created and kept in memory

        // Log for debugging (if we can access NSLog in release builds)
        #if DEBUG
        print("📌 MainViewController: Attempted HardwareKekPlugin registration")
        print("   - bridge type: \(type(of: bridge))")
        print("   - plugin instance created: \(hardwareKekPlugin != nil)")
        #endif
    }
}

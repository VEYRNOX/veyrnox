// MainViewController.swift — registers local Capacitor plugins
// Capacitor's plugin discovery is split:
// 1. CAPBridgedPlugin protocol for auto-discovery (works only for SPM packages)
// 2. Explicit bridge.registerPlugin() call for inline Swift plugins
//
// We register plugins both early (viewDidLoad) and late (capacitorDidLoad) to ensure
// they're available whenever the bridge tries to load them.

import Foundation
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func viewDidLoad() {
        super.viewDidLoad()
        // Try to register the plugin early, before the bridge is fully initialized.
        // This ensures it's in the registry if the bridge scans early.
        if let bridge = self.bridge {
            bridge.registerPlugin(HardwareKekPlugin.self)
        }
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Also register after the bridge is fully loaded, as a safety measure.
        self.bridge.registerPlugin(HardwareKekPlugin.self)
    }
}

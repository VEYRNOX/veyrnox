// IntegrityGate.swift — Swift-native BLOCK-tier probe for the SPM module.
//
// Codex P1 2026-08-15: VeyrnoxEnclavePlugin lives inside the CapApp-SPM
// package and can NOT #import "RaspIntegrityPlugin.h" (that lives in the app
// target). Duplicate the three BLOCK-tier probes RaspIntegrityPlugin.earlyCheck
// uses so the Enclave bridge can refuse to run on a hooked / tampered device
// with the same posture as HardwareKekPlugin (both Obj-C and Kotlin).
//
// The three primitives — dyld image scan, CS_VALID (csops), P_TRACED (sysctl)
// — are stable OS APIs, but if the Obj-C earlyCheck list changes, keep this
// mirror in lockstep (comment the drift, then fix here).
//
// FAIL CLOSED (I4): any exception path returns true (blocked) rather than
// silently passing through — a probe we cannot evaluate must never look CLEAN.

import Foundation
import UIKit
import Darwin
// _dyld_image_count / _dyld_get_image_name are declared in <mach-o/dyld.h>,
// exposed to Swift via the MachO module. `import Darwin` alone doesn't pull
// them in — compile failed with "cannot find '_dyld_image_count' in scope".
import MachO

// csops — same private libSystem symbol RaspIntegrityPlugin.m links against.
// Not in the public iOS SDK headers; ABI has been stable for the CS_OPS_STATUS
// operation since the early iOS releases.
@_silgen_name("csops")
private func csops(_ pid: pid_t, _ ops: UInt32, _ useraddr: UnsafeMutableRawPointer?, _ usersize: Int) -> Int32

private let CS_VALID: UInt32 = 0x0000_0001
private let CS_OPS_STATUS: UInt32 = 0

enum IntegrityGate {
    /// BLOCK-tier verdict: true means a key-touching path must NOT run.
    /// Mirrors +[RaspIntegrityPlugin earlyCheck] (app target).
    static func isBlocked() -> Bool {
        return checkDylibs() || checkTamper() || checkDebugger() || checkScreenCapture()
    }

    private static let hookedNeedles: [String] = [
        "frida", "substrate", "xposed", "cycript", "lspd", "ellekit",
    ]

    private static func checkDylibs() -> Bool {
        let count = _dyld_image_count()
        for i in 0..<count {
            guard let namePtr = _dyld_get_image_name(i) else { continue }
            let name = String(cString: namePtr).lowercased()
            for needle in hookedNeedles where name.contains(needle) {
                return true
            }
        }
        return false
    }

    private static func checkTamper() -> Bool {
        var flags: UInt32 = 0
        let rc = withUnsafeMutablePointer(to: &flags) { ptr -> Int32 in
            csops(getpid(), CS_OPS_STATUS, UnsafeMutableRawPointer(ptr), MemoryLayout<UInt32>.size)
        }
        if rc != 0 { return true }               // syscall failed — fail closed
        return (flags & CS_VALID) == 0            // kernel cleared CS_VALID
    }

    private static func checkDebugger() -> Bool {
        var info = kinfo_proc()
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        var size = MemoryLayout<kinfo_proc>.size
        let rc = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        if rc != 0 { return false }               // sysctl fail-open, matches Obj-C
        return (info.kp_proc.p_flag & P_TRACED) != 0
    }

    private static func checkScreenCapture() -> Bool {
        if Thread.isMainThread {
            return UIScreen.main.isCaptured
        }
        // isCaptured is a UIKit call; hop to main thread synchronously to match
        // the Obj-C class-method behaviour (called from AppDelegate's main-thread
        // launch path). Reading a stale value is safer than skipping the check.
        var captured = false
        DispatchQueue.main.sync { captured = UIScreen.main.isCaptured }
        return captured
    }
}

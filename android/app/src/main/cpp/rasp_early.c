// rasp_early.c — JNI wrapper for ptrace(PTRACE_TRACEME) preventive hardening.
//
// PTRACE_TRACEME (0): claims this process's ptrace slot for its parent
// (Zygote/ActivityManager). Combined with PR_SET_DUMPABLE=0 (earlyAntiDump),
// this closes two independent paths by which a debugger could attach:
//   1. PR_SET_DUMPABLE=0 prevents ptrace(PTRACE_ATTACH) because the kernel
//      requires the target to be dumpable before allowing an external attach.
//   2. PTRACE_TRACEME marks the slot consumed; if dumpable=0 is bypassed by a
//      root-level actor, the consumed slot still blocks PTRACE_ATTACH.
//
// Detection value: if ptrace(PTRACE_TRACEME) returns -1 (errno = EPERM), a
// debugger was already attached before earlyCheck ran — BLOCK-tier signal.
//
// Called from earlyPtraceTraceme() in the RaspIntegrityPlugin companion object,
// which is chained into earlyDetectHook() → earlyCheck() before the Capacitor
// bridge initialises. Fail-open: UnsatisfiedLinkError and library-load errors
// are caught by the companion init's runCatching and earlyPtraceTraceme's own
// runCatching guard.
//
// BUILT / unit-tested (structural pins), INTERNAL — not independently audited.

#include <jni.h>
#include <sys/ptrace.h>
#include <errno.h>

JNIEXPORT jboolean JNICALL
Java_com_veyrnox_app_RaspIntegrityPlugin_00024Companion_nativeEarlyTraceme(
    JNIEnv *env, jobject thiz) {
    // Returns JNI_TRUE  (BLOCK signal) if ptrace(PTRACE_TRACEME) fails:
    //   EPERM  → a debugger is already attached.
    //   other  → kernel refused for an unexpected reason; treat as suspicious.
    // Returns JNI_FALSE (hardening applied) on success: the parent now owns
    // the tracing slot and external ptrace-attach will be blocked.
    int rc = ptrace(PTRACE_TRACEME, 0, NULL, NULL);
    return (jboolean)(rc != 0);
}

cmake_minimum_required(VERSION 3.22.1)
project("rasp_early")

# rasp_early — small RASP native library. Contains only ptrace(PTRACE_TRACEME)
# hardening (rasp_early.c). Deliberately minimal: no NDK crypto, no JNI
# callbacks into Kotlin, just a single syscall wrapper. This keeps the attack
# surface of the native layer as small as possible.
add_library(rasp_early SHARED rasp_early.c)

# Link the Android log library so the build resolves cleanly; no log calls are
# made in the current source but omitting the link would warn on some NDK versions.
find_library(log-lib log)
target_link_libraries(rasp_early ${log-lib})

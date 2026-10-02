// Read-only Settings line: which web bundle this device is running, and whether an OTA
// update is staged. See docs/ota-updates.md. Local status only: it never touches the
// network (I2), never renders in a decoy/demo session (I3), and shows nothing for a
// status it cannot read (I4). Native-only: the plugin does not exist on web.
import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Layers } from 'lucide-react'
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession'
import { getOtaStatus } from '@/lib/otaUpdate'
import { describeOtaStatus } from '@/lib/otaStatus'

const isNative = () => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export default function OtaVersionRow() {
  const hidden = !isNative() || isDeniabilityOrDemoActive()
  const [info, setInfo] = useState(/** @type {{ version: string, staged: boolean } | null} */ (null))

  useEffect(() => {
    if (hidden) return undefined
    let cancelled = false
    getOtaStatus()
      .then((s) => {
        if (!cancelled) setInfo(describeOtaStatus(s))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [hidden])

  if (hidden || !info) return null

  return (
    <div
      data-testid="ota-version-row"
      className="w-full flex items-center justify-between gap-4 p-5 rounded-xl border border-border bg-card min-h-[44px]"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold">Web bundle</p>
          <p className="text-xs text-muted-foreground">
            {info.staged ? 'An update is staged and applies after you fully close and reopen the app' : 'The app code this device is running'}
          </p>
        </div>
      </div>
      <span className="mono-value text-sm text-muted-foreground">{info.version}</span>
    </div>
  )
}

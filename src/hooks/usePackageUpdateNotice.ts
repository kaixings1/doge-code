import { useEffect, useState } from 'react'
import {
  getPackageUpdateInfoSync,
  prefetchPackageUpdateInfo,
  type PackageUpdateInfo,
} from '../utils/packageUpdateNotice.js'

export function usePackageUpdateNotice():
  | PackageUpdateInfo
  | null
  | undefined {
  const [info, setInfo] = useState(getPackageUpdateInfoSync)

  useEffect(() => {
    if (info !== undefined) {
      return
    }

    let cancelled = false

    void prefetchPackageUpdateInfo().then(result => {
      if (!cancelled) {
        setInfo(result)
      }
    })

    return () => {
      cancelled = true
    }
  }, [info])

  return info
}

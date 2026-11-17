/**
 * 本机网卡列表（出口 IP 候选）
 * GET /api/network/addresses
 *
 * 枚举服务器上所有可用的 IPv4 网卡地址，供账号「出口网卡 IP」下拉选择。
 * - 内网 IP 来自 os.networkInterfaces()，本地开发也能用
 * - 公网 IP 尽力从腾讯云 metadata 按 MAC 查询（只在云环境有效，失败则留空）
 * 需要登录。
 */

import { networkInterfaces } from 'node:os'
import { createSuccessResponse, createErrorResponse } from '../../utils/response'
import { getCurrentUser } from '../../utils/session'

/** 腾讯云 metadata：网卡 MAC → 公网 IP 的查询前缀 */
const METADATA_MAC_BASE = 'http://metadata.tencentyun.com/latest/meta-data/network/interfaces/macs'
/** metadata 探测超时，避免非云环境卡住请求 */
const METADATA_TIMEOUT_MS = 800

interface NetworkAddress {
  /** 网卡名，例如 eth0 */
  name: string
  /** 本机内网 IP，用于 localAddress */
  address: string
  /** 子网掩码 */
  netmask: string
  /** MAC 地址 */
  mac: string
  /** 对应的公网 IP（查不到时为空字符串） */
  publicIp: string
}

/**
 * 从腾讯云 metadata 读取「MAC → 公网 IP」映射。
 * metadata 返回的 MAC 带尾部斜杠（如 `52:54:00:3f:af:a2/`），需要归一化。
 * 任何失败都返回空映射，不影响网卡列表本身。
 */
async function fetchPublicIpByMac(): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS)
  try {
    const listRes = await fetch(`${METADATA_MAC_BASE}/`, {
      signal: controller.signal,
    })
    if (!listRes.ok) return result
    const macLines = (await listRes.text()).split('\n').map(s => s.trim()).filter(Boolean)

    for (const rawMac of macLines) {
      const mac = rawMac.replace(/\/+$/, '').toLowerCase()
      try {
        // metadata 目录项带尾斜杠，先规范化再拼子路径
        const res = await fetch(`${METADATA_MAC_BASE}/${mac}/public-ipv4s`, {
          signal: controller.signal,
        })
        if (!res.ok) continue
        const publicIp = (await res.text()).trim()
        if (publicIp) result.set(mac, publicIp)
      } catch {
        // 单块网卡查询失败，忽略
      }
    }
  } catch {
    // 非云环境 / metadata 不可达：静默降级
  } finally {
    clearTimeout(timer)
  }
  return result
}

/** 归一化 MAC：os 返回 xx:xx:...，metadata 可能带斜杠、大小写不同 */
function normalizeMac(mac: string): string {
  return mac.replace(/\/+$/, '').toLowerCase().trim()
}

export default defineEventHandler(async (event) => {
  const currentUser = getCurrentUser(event)
  if (!currentUser) {
    return createErrorResponse('UNAUTHORIZED', '请先登录')
  }

  const publicIpByMac = await fetchPublicIpByMac()

  const addresses: NetworkAddress[] = []
  const ifaces = networkInterfaces()
  for (const [name, infos] of Object.entries(ifaces)) {
    for (const info of infos ?? []) {
      // 只要 IPv4、非回环（lo）、已分配地址的网卡
      if (info.family !== 'IPv4' || info.internal) continue
      const mac = normalizeMac(info.mac || '')
      addresses.push({
        name,
        address: info.address,
        netmask: info.netmask,
        mac: info.mac || '',
        publicIp: mac ? (publicIpByMac.get(mac) ?? '') : '',
      })
    }
  }

  // 内网 IP 稳定排序，前端展示顺序固定
  addresses.sort((a, b) => a.address.localeCompare(b.address))

  return createSuccessResponse({ addresses })
})

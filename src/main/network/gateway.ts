import { networkInterfaces } from 'node:os'
import { isIP } from 'node:net'
import type { GatewayResult } from '../../shared/network'
import { errorMessage, powershell, timestamp } from './native'

const GATEWAY_SCRIPT = `
$routes = @(Get-NetRoute -ErrorAction Stop | Where-Object { ($_.DestinationPrefix -eq '0.0.0.0/0' -or $_.DestinationPrefix -eq '::/0') -and $_.NextHop -ne '0.0.0.0' -and $_.NextHop -ne '::' })
$candidates = @($routes | ForEach-Object {
  $route = $_
  $interface = Get-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily $route.AddressFamily -ErrorAction SilentlyContinue | Where-Object { $_.ConnectionState -eq 'Connected' } | Select-Object -First 1
  if ($interface) { [PSCustomObject]@{ address=$route.NextHop; interfaceName=$route.InterfaceAlias; interfaceIndex=$route.InterfaceIndex; metric=($route.RouteMetric + $interface.InterfaceMetric); family=$route.AddressFamily.ToString() } }
})
$selected = $candidates | Sort-Object @{Expression={if ($_.family -eq 'IPv4') {0} else {1}}},metric | Select-Object -First 1
if ($selected) { $selected | ConvertTo-Json -Compress } else { 'null' }
`
export async function detectGateway(signal?: AbortSignal): Promise<GatewayResult> {
  const result: GatewayResult = { kind: 'gateway', address: null, interfaceName: null, interfaceIndex: null, family: null, hasLocalInterface: Object.values(networkInterfaces()).some(addresses => addresses?.some(address => !address.internal)), success: false, timestamp: timestamp(), error: null, cancelled: false }
  try {
    const raw = await powershell(GATEWAY_SCRIPT, {}, 10000, signal)
    if (!raw || typeof raw !== 'object' || !('address' in raw) || typeof raw.address !== 'string' || !isIP(raw.address)) throw new Error('No connected default gateway was found.')
    result.address = raw.address
    result.family = isIP(raw.address) as 4 | 6
    result.interfaceName = 'interfaceName' in raw && typeof raw.interfaceName === 'string' ? raw.interfaceName : null
    result.interfaceIndex = 'interfaceIndex' in raw && typeof raw.interfaceIndex === 'number' ? raw.interfaceIndex : null
    if (result.family === 6 && /^fe80:/i.test(result.address) && !result.address.includes('%') && result.interfaceIndex !== null) result.address += `%${result.interfaceIndex}`
    result.success = true
  } catch (failure) { result.error = errorMessage(failure) }
  result.cancelled = signal?.aborted ?? false
  return result
}

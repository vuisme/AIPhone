import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))

export function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state, ...details] = line.split(/\s+/)
      const fields = new Map(details.map((detail) => {
        const separator = detail.indexOf(':')
        return separator === -1 ? [detail, ''] : [detail.slice(0, separator), detail.slice(separator + 1)]
      }))
      return {
        serial,
        state,
        model: fields.get('model') || null,
        product: fields.get('product') || null,
        transportId: fields.get('transport_id') || null,
      }
    })
}

export function requireConnectedSerial(devices, serial) {
  const device = devices.find((candidate) => candidate.serial === serial && candidate.state === 'device')
  if (!device) throw new Error(`ADB device ${serial} is not connected`)
  return device
}

export function parseAdbForwards(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, local, remote] = line.split(/\s+/)
      return { serial, local, remote }
    })
}

export async function resolveAdbPath(environment = process.env) {
  if (environment.AIPHONE_ADB) return environment.AIPHONE_ADB
  const bundled = path.resolve(moduleDirectory, '..', 'adb-tool', process.platform === 'win32' ? 'adb.exe' : 'adb')
  try {
    await access(bundled)
    return bundled
  } catch {
    return 'adb'
  }
}

export class AdbBridge {
  constructor({ adbPath, run = execFileAsync } = {}) {
    this.adbPath = adbPath
    this.run = run
    this.forwardedPorts = new Map()
  }

  async command(args) {
    const executable = this.adbPath || await resolveAdbPath()
    return this.run(executable, args, { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 })
  }

  async listDevices() {
    const { stdout } = await this.command(['devices', '-l'])
    return parseAdbDevices(stdout)
  }

  async ensureForward(serial) {
    const devices = await this.listDevices()
    requireConnectedSerial(devices, serial)
    if (this.forwardedPorts.has(serial)) return this.forwardedPorts.get(serial)
    const { stdout: forwardingOutput } = await this.command(['forward', '--list'])
    const reusable = parseAdbForwards(forwardingOutput).find((forward) => forward.serial === serial && forward.remote === 'tcp:8765')
    if (reusable) {
      const port = Number.parseInt(reusable.local.substring('tcp:'.length), 10)
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        this.forwardedPorts.set(serial, port)
        return port
      }
    }
    const { stdout } = await this.command(['-s', serial, 'forward', 'tcp:0', 'tcp:8765'])
    const port = Number.parseInt(stdout.trim(), 10)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('ADB did not return a valid forwarded port')
    }
    this.forwardedPorts.set(serial, port)
    return port
  }

  forgetForward(serial) {
    this.forwardedPorts.delete(serial)
  }
}

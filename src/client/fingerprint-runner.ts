// 后台指纹检测的队列：**一个供应商一个，活在页签外面**。
//
// 为什么不是页签的 React state：用户切到模型配置、切到别的供应商、切到别的
// 页都不该打断检测（m00702 第 2 条）。页签只是订阅者 —— 挂载时订阅、卸载时
// 退订，但绝不动队列。只有两件事会中止：供应商被删除、页面 `pagehide`。
//
// 串行是刻意的：一家供应商下的模型排队一个一个来，三个题并行（并行在宿主那
// 边做）。全开会让一家供应商同时打十几个请求，正好踩它自己的限流。
//
// 见 docs/fingerprint-design.md §5.3（并发）与 §5.4（后台执行模型）。

import type { FingerprintRecord } from '../fingerprint/verdict.js'
import { readFingerprints, runFingerprint, type FingerprintLine } from './fingerprint-client.js'

/** 一次检测的题数。宿主用同一个数生成挑战。 */
const QUERIES = 3

/** 一个面板订阅到的、可安全渲染的快照（引用稳定，改了才换）。 */
export interface FingerprintRunnerState {
  /** 正在跑的模型 → 已完成的题数。 */
  readonly running: ReadonlyMap<string, number>
  /** 排队中的模型，按顺序。 */
  readonly queued: readonly string[]
}

export interface FingerprintRunner {
  /** 当前快照。 */
  getState(): FingerprintRunnerState
  /** 订阅状态变化；返回退订函数。 */
  subscribe(listener: () => void): () => void
  /** 订阅"某个模型的结论落盘了"；返回退订函数。 */
  onRecord(listener: (record: FingerprintRecord) => void): () => void
  /** 排队一个模型。已经在跑或已排队就什么都不做。 */
  check(model: string): void
  /** 按顺序排队一批模型。 */
  checkAll(models: readonly string[]): void
  /** 没有等待的或正在跑的检测。 */
  idle(): boolean
  /** 中止整批：清队列、掐正在跑的。已落盘的不撤。 */
  abort(): void
  /** 供应商被删掉 / 页面要走了：停干净并把自己忘掉。 */
  dispose(): void
}

interface Runner extends FingerprintRunner {
  setSender(sender: FingerprintSender | undefined): void
}

/** 面板挂上来的传输缝，方便测试换成假的。 */
export interface FingerprintSender {
  run(route: string, model: string, onLine: (line: FingerprintLine) => void): {
    done: Promise<{ ok: true; record: FingerprintRecord } | { ok: false; error: string }>
    abort(): void
  }
}

const SENDERS = new Map<string, FingerprintSender | undefined>()

function senderOf(route: string): FingerprintSender {
  return SENDERS.get(route) ?? {
    run: (target, model, onLine) => runFingerprint(target, model, onLine),
  }
}

class RouteRunner implements Runner {
  private readonly listeners = new Set<() => void>()
  private readonly recordListeners = new Set<(record: FingerprintRecord) => void>()
  private state: FingerprintRunnerState = {
    running: new Map(),
    queued: [],
  }
  /** 正在跑的那次传输句柄，用来中止。 */
  private inflight: { abort(): void } | undefined
  private draining = false
  private disposed = false

  constructor(private readonly route: string) {}

  getState(): FingerprintRunnerState {
    return this.state
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onRecord(listener: (record: FingerprintRecord) => void): () => void {
    this.recordListeners.add(listener)
    return () => {
      this.recordListeners.delete(listener)
    }
  }

  idle(): boolean {
    return this.state.running.size === 0 && this.state.queued.length === 0
  }

  check(model: string): void {
    this.checkAll([model])
  }

  checkAll(models: readonly string[]): void {
    if (this.disposed) return
    const queued = [...this.state.queued]
    for (const model of models) {
      if (queued.includes(model)) continue
      if (this.state.running.has(model)) continue
      queued.push(model)
    }
    if (queued.length === this.state.queued.length) return
    this.publish({ ...this.state, queued })
    void this.drain()
  }

  abort(): void {
    this.publish({ running: new Map(), queued: [] })
    this.inflight?.abort()
    this.inflight = undefined
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.abort()
    this.listeners.clear()
    this.recordListeners.clear()
    RUNNERS.delete(this.route)
    SENDERS.delete(this.route)
  }

  setSender(sender: FingerprintSender | undefined): void {
    SENDERS.set(this.route, sender)
  }

  private publish(next: FingerprintRunnerState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }

  /** 一次只跑一个模型；跑完自己找下一个。 */
  private async drain(): Promise<void> {
    if (this.draining || this.disposed) return
    this.draining = true
    try {
      for (;;) {
        const next = this.state.queued[0]
        if (next === undefined) break
        this.publish({
          running: new Map(this.state.running).set(next, 0),
          queued: this.state.queued.slice(1),
        })
        await this.runOne(next)
        if (this.disposed) break
      }
    } finally {
      this.draining = false
    }
  }

  private async runOne(model: string): Promise<void> {
    const sender = senderOf(this.route)
    let done = 0
    const handle = sender.run(this.route, model, (line) => {
      if (line.type !== 'progress') return
      done += 1
      // 每题一行，按到达次序计数：面板显示的是"三题里跑完了几题"，不是第几题。
      this.publish({
        running: new Map(this.state.running).set(model, Math.min(done, QUERIES)),
        queued: this.state.queued,
      })
    })
    this.inflight = handle
    const answer = await handle.done
    this.inflight = undefined
    if (this.disposed) return

    const running = new Map(this.state.running)
    running.delete(model)
    this.publish({ running, queued: this.state.queued })

    if (answer.ok) {
      for (const listener of [...this.recordListeners]) listener(answer.record)
    }
    // 失败不打断整批：下一个模型照跑。失败的那条已经由宿主落盘成 `failed`，
    // 面板拿到 recordListener 之外的情况就只把按钮换回"重试"。
  }
}

const RUNNERS = new Map<string, RouteRunner>()

/**
 * 取（或建）一个供应商的后台检测器。同一路由永远同一个实例，所以页签来回
 * 挂载不会把队列弄丢。
 * @param route - 供应商的设置键。
 */
export function fingerprintRunner(route: string): FingerprintRunner {
  let runner = RUNNERS.get(route)
  if (runner === undefined) {
    runner = new RouteRunner(route)
    RUNNERS.set(route, runner)
  }
  return runner
}

/**
 * 测试接缝：给一条路由换上传输实现。传 undefined 恢复真实传输。
 * @param route - 供应商的设置键。
 * @param sender - 假的传输。
 */
export function setFingerprintSender(route: string, sender: FingerprintSender | undefined): void {
  SENDERS.set(route, sender)
  const runner = RUNNERS.get(route)
  if (runner !== undefined && sender !== undefined) runner.setSender(sender)
}

/** 页面要走了：把所有还在跑的掐掉。已落盘的不撤。 */
export function teardownFingerprintRunners(): void {
  for (const runner of [...RUNNERS.values()]) runner.dispose()
}

export { readFingerprints }

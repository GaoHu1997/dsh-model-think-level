# 0008 — 自动继续显式持有会话引用，后台巡检不依赖当前页面

状态：已接受

## 背景

[0006](0006-auto-continue-chip-and-background-chain.md) 把倒计时提升为按会话持有的链，但只保存了借用的 binding，没有获得宿主会话的生命周期所有权。真实 session-controller 的 binding(id) 不延长引用寿命；主页面切换后最后一个引用被释放，宿主会停止远端事件流。旧对象甚至可能仍返回 open 的快照和冻结历史，不能仅凭 JS 引用或 subscribe 判断存活。

另一处漏洞是 track 的回收条件只看链的 phase，而运行中的首轮尚未失败、phase 仍是 idle。切到真实存在的会话会把它回收。原测试将当前 id 切为不存在的 s2，提前 return 绕过回收分支；永生事件窗口的 mock 也掩盖了流关闭问题。

## 决策

- [执行器](../../src/client/injection/auto-continue-run.ts) 在提供 retain 的宿主上为每条链获得独立引用，来源标签为 dshModelThinkLevelAutoContinue，不伪装 mainView、不改变导航。引用随 dropChain 统一释放；旧宿主保留 binding 的结构探测兼容路径。
- 当前会话与目录中正在运行的普通会话进入观察，尚未打开的空闲历史不批量加载。通过 origin 和真实 snapshot.subagent 排除子代理；普通 fork 的 parentId 不意味着子代理，不据此排除。
- 每轮检查所有后台链的快照和事件窗口，补偿被合并的通知。运行中、有待提交、正在评估、正在倒计时或等待下一轮的链不因切页被释放。真正空闲的非当前链在评估期限结束后释放，评估计时器从集合中及时回收。
- 发送与评估守卫核验 reference.binding 的确切 session/eventSource 代际，避免冻结旧快照误导。reference.ready 的拒绝仅销毁仍拥有该引用的链；晚到的旧代际拒绝不影响重建后的链。ready fulfilled 也不能替代 openState === open。
- 全局关闭开关立即取消所有后台计时并释放所有引用；配置变更应用所有等待链，并从原始开始时间重算，不从切页或编辑时重新倒计时。停止、重置和立即继续仍只作用于当前会话。
- 不使用私有 RPC，不切换页面来发送，不修改宿主内核或启动替代 Web 服务。正式 Session.prompt 支持非当前会话，问题在于观察流寿命和回收条件。

## 影响与验证

[生命周期回归](../../tests/auto-continue-lifetime.spec.ts) 使用最后 release 冻结远端流但保留 open 快照的严格夹具，覆盖真实会话切换、倒计时期限、从未选择的运行会话、多后台与重试上限、全局开关与配置、回收、重置与晚到 ready、失败历史打开和旧代际发送守卫。[既有执行器回归](../../tests/auto-continue-run.spec.ts) 的切换目标改为真实 binding，不再绕过回收分支。

后台运行发现依赖会话目录状态和每秒巡检；浏览器仍须保持插件页面运行。浏览器冻结/关闭页面不会变成服务端后台守护进程。达到重试上限的链保留次数与订阅，直至手动重置、会话终止、关闭开关或插件释放，以避免切页绕过重试上限。

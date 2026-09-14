# TODŌU 3D Desktop 产品升级计划

## 当前系统功能盘点

### 已实现的核心功能 ✅

#### 3D 环境与交互
- 4个3D资产：笔记本电脑、手机、收音机、桌子
- 6个屏幕会话：电脑3屏、手机1屏、收音机2屏
- 物理交互：键盘按键、收音机旋钮、触摸点击
- 3D 拾取和焦点管理

#### 生产力应用套件（8个完整应用）
- **📝 备忘录**：创建、编辑、删除、搜索
- **✅ 提醒事项**：待办管理、完成状态切换
- **📅 日历**：事件管理、月视图、日期选择
- **📁 文件**：导入文本文件、导出、文件列表
- **🧮 计算器**：科学计算、基础运算
- **⚙️ 设置**：外观、壁纸、减少动画
- **🌐 浏览器**：URL验证、iframe沙箱、搜索引擎集成
- **🎵 音乐**：本地播放 + 在线电台

#### 音乐系统（完全功能）
- 本地文件导入（MP3、M4A、WAV、FLAC、OGG）
- IndexedDB 持久化存储
- 播放控制（播放/暂停/上下曲/进度条/音量）
- 曲目列表管理
- 错误处理（配额、格式、播放阻塞）

#### 电台系统（真实在线电台）
- Radio Browser API 集成（真实的全球电台目录）
- 实时流媒体播放
- 频谱可视化（64频段）
- 物理控制（收音机旋钮调谐、音量滑块）
- 电台搜索和选择
- VU表和磁带转动动画

#### 跨设备数据同步
- 手机和电脑共享数据服务
- localStorage + IndexedDB 双层存储
- 状态实时同步

---

## 需要升级的功能模块

### 模块 1：视觉设计系统

#### 1.1 毛玻璃效果（Glassmorphism）
**当前状态**：纯色背景、基础阴影
**目标效果**：半透明背景 + 背景模糊 + 饱和度增强

```css
.window {
  backdrop-filter: blur(40px) saturate(180%);
  background: rgba(30, 30, 40, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.2);
}
```

**应用范围**：
- 所有窗口和对话框
- 手机应用卡片
- 收音机显示面板
- 菜单和弹出层

#### 1.2 iOS/macOS 动画系统
**当前状态**：基础 CSS transition
**目标效果**：流畅的缓动函数 + 物理感的弹簧动画

**关键参数**：
```typescript
export const ANIMATIONS = {
  spring: {
    damping: 0.825,
    stiffness: 300,
    mass: 0.75
  },
  easing: {
    default: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
    decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)'
  }
} as const
```

**应用场景**：
- 应用启动/关闭
- 窗口最小化/最大化
- 按钮按压反馈
- 页面切换
- 模态对话框弹出

#### 1.3 按压反馈动画
**手机应用图标**：
```css
.phone-app-icon:active {
  transform: scale(0.94);
  transition: 140ms cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

**按钮**：
```css
.button:active {
  transform: scale(0.96);
  opacity: 0.8;
}
```

**触摸反馈**：
```css
.touchable:active::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.1);
  border-radius: inherit;
}
```

#### 1.4 颜色系统
**当前状态**：硬编码颜色值
**目标效果**：统一的设计令牌系统

```css
:root {
  /* 表面层次（深色主题） */
  --surface-base: #05070C;
  --surface-1: #0A0D12;
  --surface-2: #0F131C;
  --surface-3: #161D2B;
  --surface-4: #1E2636;

  /* 强调色 */
  --accent-primary: #38BDF8;
  --accent-secondary: #6EE7B7;

  /* 文本 */
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-tertiary: rgba(255, 255, 255, 0.5);

  /* 交互状态 */
  --hover-overlay: rgba(255, 255, 255, 0.08);
  --active-overlay: rgba(255, 255, 255, 0.12);
}
```

---

### 模块 2：手机 UI 升级

#### 2.1 动态岛（Dynamic Island）
**功能描述**：iPhone 14 Pro+ 风格的动态通知区域

**显示内容**：
- 音乐播放：专辑封面 + 标题 + 进度条
- 电台播放：电台名称 + 频谱动画
- 提醒事项：到期提醒

**交互**：
- 点击展开：显示完整控制面板
- 点击收起：最小化为药丸形状
- 音乐控制：播放/暂停/上下曲

**技术实现**：
```typescript
// src/apps/phone-os/dynamic-island.ts
export interface DynamicIslandController {
  expand(content: IslandContent): void
  collapse(): void
  setContent(type: 'music' | 'radio' | 'reminder'): void
}

export const createDynamicIsland = (
  musicService: WorkspaceMusicService
): DynamicIslandController => {
  // 订阅音乐服务状态
  // 动态更新岛内容
  // 处理点击展开/收起
}
```

#### 2.2 应用切换器（App Switcher）
**功能描述**：卡片式多任务管理

**交互方式**：
- 从底部上滑触发
- 左右滑动切换应用
- 上滑关闭应用
- 点击卡片进入应用

**视觉效果**：
- 3D 卡片透视
- 滑动惯性和回弹
- 关闭动画

**技术实现**：
```typescript
// src/apps/phone-os/app-switcher.ts
export interface AppSwitcherController {
  show(): void
  hide(): void
  addCard(app: AppDefinition): void
  removeCard(appId: string): void
}
```

#### 2.3 控制中心（Control Center）
**功能描述**：快速设置面板

**包含功能**：
- 音量滑块
- 亮度滑块
- 飞行模式开关
- 勿扰模式开关
- 音乐快速控制

**交互方式**：
- 从右上角下拉展开
- 点击空白处关闭

#### 2.4 通知中心
**功能描述**：集中的通知管理

**通知类型**：
- 日历事件提醒
- 提醒事项到期
- 音乐播放开始/停止
- 系统消息

**交互**：
- 从顶部下拉展开
- 分组显示（按应用）
- 滑动清除单条
- 清除所有

#### 2.5 系统键盘
**功能描述**：输入法界面

**布局类型**：
- QWERTY 字母键盘
- 数字键盘
- 符号键盘
- Emoji 键盘

**功能**：
- 自动大写
- 快速符号输入（长按）
- 删除键长按连续删除

---

### 模块 3：电脑 UI 升级

#### 3.1 菜单栏（Menu Bar）
**功能描述**：顶部系统菜单

**左侧应用菜单**：
- 应用名称
- 关于
- 偏好设置 (⌘,)
- 退出 (⌘Q)

**右侧状态栏**：
- 时钟
- 音量图标
- 电池图标
- Spotlight 搜索按钮
- 控制中心按钮

**下拉菜单**：
- File（文件）
- Edit（编辑）
- View（视图）
- Window（窗口）
- Help（帮助）

**技术实现**：
```typescript
// src/apps/desktop-os/menu-bar.ts
export interface MenuBarController {
  setAppName(name: string): void
  setAppMenu(items: MenuItem[]): void
  updateStatusItem(id: string, content: string): void
}
```

#### 3.2 Dock 增强
**功能描述**：应用启动器和窗口管理

**当前功能**：
- 应用图标展示
- 点击启动应用

**新增功能**：
- **放大效果**：鼠标悬停时图标放大（Magnification）
- **右键菜单**：最近文档、选项、退出
- **分隔符**：应用区 | 最近使用 | 文件/文件夹
- **指示灯**：运行中的应用显示小点

**放大效果实现**：
```typescript
// src/apps/desktop-os/dock-magnification.ts
export const enableDockMagnification = (dockElement: HTMLElement) => {
  dockElement.addEventListener('mousemove', (e) => {
    items.forEach(item => {
      const distance = calculateDistance(e.clientX, item)
      const scale = Math.max(1, 1.5 - distance / 150)
      item.style.transform = `scale(${scale}) translateY(${-(scale - 1) * 20}px)`
    })
  })
}
```

#### 3.3 Spotlight 搜索
**功能描述**：全局搜索功能

**快捷键**：⌘Space（Cmd+Space）

**搜索范围**：
- 应用程序
- 文件（备忘录、提醒事项）
- 日历事件
- 音乐曲目
- 计算器表达式
- 网页搜索

**搜索结果**：
- 分类显示
- 高亮匹配文本
- 预览面板
- 快速操作（打开、播放、删除）

**技术实现**：
```typescript
// src/apps/desktop-os/spotlight.ts
export interface SpotlightController {
  show(): void
  hide(): void
  search(query: string): SearchResult[]
  preview(item: SearchResult): PreviewContent
}

export interface SearchResult {
  type: 'app' | 'file' | 'music' | 'calendar' | 'calculation'
  title: string
  subtitle: string
  icon: string
  action: () => void
}
```

#### 3.4 Mission Control（调度中心）
**功能描述**：窗口管理和虚拟桌面

**触发方式**：
- F3 键
- 三指上滑（触控板模拟）

**显示内容**：
- 所有打开的窗口（缩略图）
- 虚拟桌面（Spaces）
- 全屏应用

**交互**：
- 拖动窗口到不同桌面
- 点击窗口激活
- 滑动切换桌面

**技术实现**：
```typescript
// src/apps/desktop-os/mission-control.ts
export interface MissionControlController {
  show(): void
  hide(): void
  addSpace(): void
  removeSpace(index: number): void
  moveWindowToSpace(window: Window, spaceIndex: number): void
}
```

#### 3.5 Stage Manager（台前调度）
**功能描述**：macOS Ventura+ 窗口组织方式

**特性**：
- 活动窗口组居中显示
- 最近使用的窗口组在左侧缩略图
- 点击缩略图切换窗口组
- 拖动窗口到缩略图加入组

**视觉效果**：
- 自动整理窗口
- 平滑切换动画
- 背景模糊

#### 3.6 窗口效果
**最小化动画（Genie Effect）**：
- 窗口扭曲流入 Dock 图标

**调整大小**：
- 平滑过渡
- 保持纵横比（可选）

**关闭动画**：
- 缩小到中心点消失

---

### 模块 4：音乐与电台系统增强

#### 4.1 Apple Music 风格界面
**当前状态**：简单的列表 + 播放控制
**目标效果**：沉浸式播放体验

**正在播放界面（Now Playing）**：
```
┌─────────────────────────┐
│                         │
│     ┌──────────────┐    │
│     │  专辑封面     │    │
│     │  (大图)      │    │
│     └──────────────┘    │
│                         │
│   歌曲名称（大字号）      │
│   艺术家名称             │
│                         │
│   ━━━●━━━━━━━━━━━━     │
│   0:42        3:24      │
│                         │
│   ⏮  ⏯  ⏭              │
│                         │
│   🔀  ♡  🔁             │
└─────────────────────────┘
```

**资料库视图（Library）**：
- 专辑网格（封面墙）
- 艺术家列表
- 歌曲列表（虚拟滚动）
- 播放列表

**迷你播放器**：
- 固定在底部
- 封面缩略图 + 标题
- 播放/暂停按钮
- 点击展开完整界面

**技术实现**：
```typescript
// src/apps/music-app/now-playing.ts
export interface NowPlayingController {
  setTrack(track: WorkspaceMusicTrack): void
  updateProgress(currentTime: number, duration: number): void
  onSeek(callback: (time: number) => void): void
}
```

#### 4.2 ID3 标签解析
**功能**：从 MP3 文件提取元数据

**提取信息**：
- 标题（Title）
- 艺术家（Artist）
- 专辑（Album）
- 年份（Year）
- 封面图片（Album Art）
- 流派（Genre）

**技术方案**：
- 使用 `jsmediatags` 库
- 或手动解析 ID3v2 标签

#### 4.3 播放列表管理
**功能**：
- 创建播放列表
- 添加/移除歌曲
- 重新排序
- 播放列表封面（拼贴前4张专辑）
- 保存到 IndexedDB

**智能播放列表**：
- 最近播放
- 最常播放
- 最近添加

#### 4.4 高级频谱可视化
**当前状态**：64频段基础频谱
**目标效果**：多样化可视化

**可视化类型**：
1. **频谱柱（Bars）**：经典柱状图
2. **波形（Waveform）**：实时波形
3. **圆形频谱（Circular）**：围绕封面的圆环
4. **粒子效果（Particles）**：跟随音乐的粒子

**技术实现**：
```typescript
// src/visualizers/spectrum-visualizer.ts
export interface SpectrumVisualizer {
  type: 'bars' | 'waveform' | 'circular' | 'particles'
  update(frequencyData: Uint8Array): void
  setColorScheme(colors: string[]): void
}
```

#### 4.5 音频效果器
**功能**：实时音频处理

**效果类型**：
- **均衡器（EQ）**：10频段均衡
- **混响（Reverb）**：空间感
- **压缩器（Compressor）**：动态范围控制
- **空间音频（Spatial）**：模拟环绕声

**预设**：
- Rock（摇滚）
- Jazz（爵士）
- Classical（古典）
- Electronic（电子）
- Flat（无效果）

**技术实现**：
```typescript
// src/services/audio-effects.ts
export const createAudioEffects = (audioContext: AudioContext) => {
  const eq = createEqualizer(audioContext, 10)
  const reverb = audioContext.createConvolver()
  const compressor = audioContext.createDynamicsCompressor()

  return { eq, reverb, compressor, applyPreset }
}
```

#### 4.6 电台功能增强

**预设电台**：
- 保存常用电台到收藏
- 快速切换预设
- 自定义排序

**电台信息卡片**：
- 电台名称和标志
- 当前播放节目（如果可用）
- 比特率和编码格式
- 国家和语言

**录音功能（可选）**：
- 录制电台流到本地
- 自动切分为曲目
- 保存为 MP3

---

### 模块 5：系统级功能

#### 5.1 AirPlay 模拟
**功能描述**：音频在设备间无缝切换

**支持设备**：
- 电脑（Mac）
- 手机（iPhone）
- 收音机（Speaker）

**功能**：
- 选择输出设备
- 多房间播放（同时输出到多个设备）
- 音量独立控制
- 切换时无缝过渡

**技术实现**：
```typescript
// src/services/airplay-service.ts
export interface AirPlayDevice {
  id: string
  name: string
  type: 'mac' | 'iphone' | 'speaker'
  active: boolean
}

export interface AirPlayController {
  devices: AirPlayDevice[]
  stream(deviceId: string, audio: AudioSource): void
  multiRoom(deviceIds: string[]): void
}
```

#### 5.2 Handoff（连续互通）
**功能描述**：跨设备无缝切换任务

**支持场景**：
- **音乐播放**：手机播放 → 切换到电脑继续
- **网页浏览**：电脑浏览 → 切换到手机继续
- **备忘录编辑**：手机编辑 → 切换到电脑继续
- **日历事件**：跨设备同步

**视觉提示**：
- Dock 图标左侧显示"从 iPhone 继续"图标
- 通知中心提示可继续的活动

**技术实现**：
```typescript
// src/services/handoff-service.ts
export interface Activity {
  type: 'music' | 'browser' | 'notes' | 'calendar'
  data: any
  timestamp: number
  deviceId: string
}

export interface HandoffController {
  startActivity(activity: Activity, device: DeviceId): void
  continueActivity(activity: Activity, toDevice: DeviceId): void
  listActivities(): Activity[]
}
```

#### 5.3 iCloud 风格同步
**功能描述**：数据云端同步（模拟）

**同步内容**：
- 备忘录
- 提醒事项
- 日历事件
- 音乐播放列表（不含音频文件）
- 应用设置

**同步策略**：
- 实时同步（本地修改立即同步）
- 冲突解决（最后写入胜出 + 用户选择）
- 离线队列（网络恢复后同步）

**技术实现**：
```typescript
// src/services/cloud-sync-service.ts
export interface CloudSyncController {
  sync(dataType: DataType): Promise<void>
  resolveConflict(local: Data, remote: Data): ResolvedData
  status: 'syncing' | 'up-to-date' | 'error'
}
```

#### 5.4 系统通知
**功能描述**：统一的通知管理

**通知类型**：
- 日历事件提醒（提前5分钟/15分钟/1小时）
- 提醒事项到期
- 音乐播放开始/停止
- 系统更新
- 应用通知

**通知行为**：
- 横幅（Banner）：顶部弹出，自动消失
- 警告（Alert）：需要用户操作
- 角标（Badge）：应用图标显示数字

**技术实现**：
```typescript
// src/services/notification-service.ts
export interface Notification {
  id: string
  title: string
  body: string
  icon?: string
  actions?: NotificationAction[]
  type: 'banner' | 'alert'
}

export interface NotificationController {
  send(notification: Notification): void
  badge(appId: string, count: number): void
  sound(soundId: string): void
}
```

---

### 模块 6：性能优化

#### 6.1 虚拟滚动
**应用场景**：
- 音乐库（数百首歌曲）
- 文件列表（大量文件）
- 电台列表（数千个电台）
- 日历事件（跨年事件）

**优化效果**：
- 只渲染可见区域的 DOM 元素
- 大幅减少内存占用
- 流畅的 60fps 滚动

**技术实现**：
```typescript
// src/utils/virtual-list.ts
export interface VirtualListController<T> {
  setItems(items: T[]): void
  scrollTo(index: number): void
  refresh(): void
}

export const createVirtualList = <T>(
  container: HTMLElement,
  itemHeight: number,
  renderItem: (item: T, index: number) => HTMLElement
): VirtualListController<T> => {
  // 计算可见区域
  // 只渲染可见项 + 上下缓冲
  // 监听滚动事件动态更新
}
```

#### 6.2 Web Worker 多线程
**应用场景**：
- 音频频谱分析
- 图片处理（封面提取）
- 搜索索引构建
- 大文件读取

**优化效果**：
- 主线程不阻塞
- 复杂计算不影响 UI 流畅度

**技术实现**：
```typescript
// src/workers/audio-processor.worker.ts
self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data

  if (type === 'analyzeSpectrum') {
    const spectrum = analyzeAudioData(data)
    self.postMessage({ type: 'spectrum', data: spectrum })
  }
}
```

#### 6.3 代码分割（Code Splitting）
**优化策略**：
- 按应用拆分 chunk
- 按路由懒加载
- 第三方库独立打包

**Vite 配置**：
```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'music': ['./src/apps/music-app.ts'],
          'productivity': ['./src/apps/productivity-apps.ts'],
          'desktop-os': ['./src/apps/desktop-os-app.ts'],
          'phone-os': ['./src/apps/phone-os-app.ts'],
          'three': ['three']
        }
      }
    }
  }
}
```

**优化效果**：
- 首屏加载更快（减少初始包大小）
- 按需加载应用

#### 6.4 IndexedDB 优化
**当前问题**：
- 大量小写入性能差
- 查询无索引

**优化方案**：

**批量写入**：
```typescript
export const batchWrite = async (items: WorkspaceMusicTrack[]) => {
  const transaction = db.transaction('tracks', 'readwrite')
  const store = transaction.objectStore('tracks')

  for (const item of items) {
    store.put(item)
  }

  await transaction.complete
}
```

**索引优化**：
```typescript
const schema = {
  tracks: {
    keyPath: 'id',
    indexes: [
      { name: 'title', keyPath: 'title' },
      { name: 'artist', keyPath: 'artist' },
      { name: 'album', keyPath: 'album' },
      { name: 'addedAt', keyPath: 'addedAt' }
    ]
  }
}
```

**查询缓存**：
- 缓存常用查询结果
- 失效策略（写入时清除）

#### 6.5 图片懒加载
**应用场景**：
- 专辑封面
- 应用图标
- 壁纸

**技术实现**：
```typescript
export const lazyLoadImage = (img: HTMLImageElement, src: string) => {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      img.src = src
      observer.disconnect()
    }
  })

  observer.observe(img)
}
```

---

### 模块 7：可访问性

#### 7.1 屏幕阅读器支持
**ARIA 标签**：
- 为所有交互元素添加 `aria-label`
- 正确的 `role` 属性
- `aria-live` 区域（通知）

**示例**：
```html
<button
  aria-label="播放音乐"
  role="button"
  aria-pressed="false"
>
  <svg>...</svg>
</button>

<div role="region" aria-live="polite" aria-atomic="true">
  正在播放：歌曲名称
</div>
```

#### 7.2 键盘导航
**全键盘操作**：
- Tab 键在可交互元素间切换
- 空格键激活按钮
- 方向键在列表中导航
- Esc 键关闭对话框

**焦点管理**：
- 清晰的焦点指示器
- 焦点陷阱（模态对话框内）
- 焦点恢复（关闭对话框后）

#### 7.3 减少动画（prefers-reduced-motion）
**尊重系统设置**：
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**或提供开关**：
- 设置应用中的"减少动画"选项
- 禁用所有装饰性动画
- 保留必要的过渡

#### 7.4 高对比度模式
```css
@media (prefers-contrast: high) {
  :root {
    --text-primary: #ffffff;
    --background: #000000;
    --border: #ffffff;
  }
}
```

---

### 模块 8：内容与体验

#### 8.1 示例内容
**预装数据**：
- 备忘录：3-5 条示例笔记（欢迎、使用指南、快捷键）
- 日历：未来一周的示例事件
- 提醒事项：5-7 条待办事项
- 音乐：2-3 首示例音频（Creative Commons）
- 壁纸：10+ 精选壁纸
- 照片：样张图片集

#### 8.2 引导体验（Onboarding）
**首次访问**：
- 欢迎对话框
- 交互式教程（可跳过）
- 关键功能介绍

**教程步骤**：
```typescript
const TOUR_STEPS = [
  {
    target: '.desktop-os-dock',
    title: '这是 Dock',
    content: '点击图标启动应用，就像在 macOS 上一样'
  },
  {
    target: '.phone-shell',
    title: '这是你的手机',
    content: '点击屏幕唤醒，所有应用都在这里'
  },
  {
    target: '.ratio',
    title: '这是收音机',
    content: '旋转旋钮调频，收听全球在线电台'
  }
]
```

#### 8.3 主题系统
**内置主题**：
- 浅色模式（Light）
- 深色模式（Dark）
- 自动切换（Auto）
- 高对比度（High Contrast）

**自定义主题**：
- 用户选择主色调
- 自动生成完整配色方案

**技术实现**：
```typescript
// src/theme/theme-service.ts
export interface Theme {
  name: string
  colors: ThemeColors
  isDark: boolean
}

export const applyTheme = (theme: Theme) => {
  Object.entries(theme.colors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value)
  })
}
```

#### 8.4 壁纸系统
**内置壁纸**：
- 抽象几何
- 自然风光
- 渐变色
- 纯色

**自定义壁纸**：
- 上传本地图片
- URL 导入

**动态壁纸（可选）**：
- 视频背景
- 粒子效果
- 随时间变化

#### 8.5 系统音效
**音效列表**：
```typescript
export const SYSTEM_SOUNDS = {
  startup: 'sounds/startup.mp3',
  shutdown: 'sounds/shutdown.mp3',
  notification: 'sounds/notification.mp3',
  click: 'sounds/click.mp3',
  swipe: 'sounds/swipe.mp3',
  error: 'sounds/error.mp3',
  success: 'sounds/success.mp3'
} as const
```

**音效开关**：
- 设置中可关闭系统音效
- 独立的音量控制

---

### 模块 9：调试与开发者工具

#### 9.1 内置调试面板
**功能**：
- FPS 计数器
- 内存使用监控
- 网络活动日志
- 事件日志
- 状态检查器（State Tree）

**快捷键**：Cmd+Shift+D 或 Ctrl+Shift+D

**技术实现**：
```typescript
// src/debug/debug-panel.ts
export interface DebugController {
  fps: number
  memory: MemoryInfo
  network: NetworkActivity[]
  eventLog: Event[]
  stateTree: StateTree
  show(): void
  hide(): void
}
```

#### 9.2 性能分析
**集成工具**：
- Performance API 监控
- Long Task 检测
- Layout Shift 追踪

**报告**：
- 启动时间
- 应用切换延迟
- 滚动性能
- 内存泄漏检测

---

## 功能优先级矩阵

| 功能模块 | 视觉冲击 | 技术复杂度 | 用户价值 | 优先级 |
|---------|---------|----------|---------|--------|
| 毛玻璃效果 | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ | **P0** |
| 按压动画 | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ | **P0** |
| 提取常量 | - | ⭐ | ⭐⭐⭐ | **P0** |
| 颜色系统 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | **P0** |
| 动态岛 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **P1** |
| Dock 放大 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **P1** |
| 音乐界面 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **P1** |
| 频谱增强 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P1** |
| Spotlight | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | **P1** |
| 应用切换器 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P2** |
| 菜单栏 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **P2** |
| 控制中心 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P2** |
| Mission Control | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **P2** |
| 虚拟滚动 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **P2** |
| ID3 解析 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | **P2** |
| 播放列表 | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | **P2** |
| Web Worker | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| 代码分割 | ⭐ | ⭐⭐ | ⭐⭐⭐ | **P3** |
| AirPlay | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| Handoff | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| iCloud 同步 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| Stage Manager | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | **P3** |
| 系统键盘 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| 通知中心 | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | **P3** |
| 音频效果器 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | **P3** |

---

## 技术架构

### 当前技术栈（保持）
- **框架**：Vanilla TypeScript（无框架）
- **3D 引擎**：Three.js
- **构建**：Vite 7
- **测试**：Bun Test
- **代码质量**：Biome（格式化 + Lint）
- **样式**：纯 CSS（CSS Grid + Flexbox）
- **存储**：localStorage + IndexedDB
- **音频**：Web Audio API + HTML5 Audio

### 新增依赖（最小化）
- **jsmediatags**（可选）：ID3 标签解析
- **GSAP**（可选）：高级动画，CSS 可能已足够

### 不引入
- ❌ React/Vue（当前架构已清晰）
- ❌ Redux/Zustand（当前状态管理足够）
- ❌ UI 组件库（自定义更灵活）

---

## 实施策略

### 渐进式升级
每个模块都是独立的改进，可以单独实施和发布：

1. **视觉优先**：毛玻璃、动画、颜色系统
2. **关键交互**：动态岛、Dock 放大、Spotlight
3. **媒体增强**：音乐界面、频谱可视化
4. **性能优化**：虚拟滚动、Web Worker、代码分割
5. **高级功能**：Mission Control、Handoff、iCloud

### MVP 范围（快速迭代）
如果需要快速看到效果，最小可行产品包括：

**核心 MVP**：
- ✅ 毛玻璃效果
- ✅ 按压动画
- ✅ 颜色系统
- ✅ 动态岛
- ✅ Dock 放大
- ✅ 音乐界面升级

**扩展 MVP**（+核心）：
- ✅ Spotlight 搜索
- ✅ 频谱增强
- ✅ 虚拟滚动

**完整版**（+扩展）：
- ✅ Mission Control
- ✅ 应用切换器
- ✅ 菜单栏
- ✅ 所有其他功能

---

## 风险与缓解

### 浏览器兼容性
**风险**：Safari 对某些 CSS 效果支持不完整

**缓解**：
- 使用 `-webkit-` 前缀
- 提供降级方案
- 功能检测（`@supports`）

### 性能影响
**风险**：过多动画和效果可能影响低端设备

**缓解**：
- 检测 `prefers-reduced-motion`
- 性能监控和降级
- 虚拟滚动减少 DOM 数量

### IndexedDB 配额
**风险**：大量音乐文件可能超出配额

**缓解**：
- 提示用户清理
- 优雅降级到内存存储
- 压缩存储数据

---

## 测试策略

### 功能测试
- 每个新功能都有单元测试
- 集成测试覆盖关键用户流程

### 浏览器测试
- Chrome（主要）
- Safari（macOS 体验）
- Firefox（兼容性）
- Edge（Windows）

### 性能测试
- Lighthouse 评分（Performance、Accessibility）
- 启动时间测量
- 内存使用监控
- 滚动性能测试

### 可访问性测试
- 键盘导航测试
- 屏幕阅读器测试（NVDA、JAWS）
- 色彩对比度检查

---

## 文档要求

### 用户文档
- 使用指南（Markdown）
- 快捷键速查表
- FAQ（常见问题）
- 视频教程（可选）

### 开发者文档
- API 文档（TSDoc）
- 架构设计文档
- 贡献指南（开源准备）
- 代码风格指南

---

## 下一步行动

### 立即开始
1. 修复测试失败（`src/main.ts`）
2. 创建 `src/constants.ts` 提取魔术数字
3. 开始 CSS 视觉升级（毛玻璃效果）

### 第一个里程碑
- ✅ 所有测试通过
- ✅ 毛玻璃效果应用到所有界面
- ✅ 统一的颜色系统
- ✅ 流畅的按压动画
- 📸 视觉对比截图

### 第二个里程碑
- ✅ 手机动态岛
- ✅ 电脑 Dock 放大
- ✅ Apple Music 风格播放界面
- 🎥 演示视频

### 第三个里程碑
- ✅ Spotlight 搜索
- ✅ 频谱可视化增强
- ✅ 虚拟滚动优化
- 🚀 性能优化完成

---

## 结论

TODŌU 已经是一个**功能完整、可以实际使用**的 3D 桌面系统。

本升级计划专注于：
- ✨ **视觉打磨**：从工程原型到产品级界面
- 🎯 **关键交互**：标志性的 iOS/macOS 功能
- ⚡ **性能优化**：流畅的 60fps 体验
- 🎵 **媒体体验**：沉浸式音乐和电台

**每个模块都是独立的改进，可以按优先级逐步实施。**

---

**文档版本**: 3.0（功能导向版）
**创建日期**: 2026-09-12
**项目**: TODŌU 3D Desktop

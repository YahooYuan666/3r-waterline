# 3R Waterline 紧凑悬浮窗尺寸研究

研究日期：2026-08-21。本文只讨论桌面悬浮窗的面积、可读性与交互密度，不改变额度、登录或刷新规则。

## 结论

将默认紧凑档定为**窗口 256 x 256、可见圆瓶直径 240 logical px、四周透明余量各 8 logical px**。相对原来的 320 x 320 窗口和 280px 圆瓶：

- 窗口宽高减少 20%，窗口占用面积减少 36%。
- 圆瓶直径减少约 14.3%，可见圆形面积减少约 26.5%。
- 保留现有 13px、700 字重和两列周/月信息，不以缩小字体换面积。

这是当前内容的最小默认档，而不是可以继续任意缩小的起点。GNOME 对内容有限的窗口建议采用较小默认尺寸以避免空白，同时要求浮层保持低复杂度；本项目正是“只读状态 + 极少量临时导航”的场景，因此应压缩容器，而非增加外框、说明文字或常驻设置控件。[GNOME 窗口](https://developer.gnome.org/hig/patterns/containers/windows.html) [GNOME 浮层](https://developer.gnome.org/hig/patterns/containers/popovers.html)

## 对现有界面的尺寸推导

当前实现不是每列四个块级文字行，而是三行：`周/月`、金额与上限（两个行内元素）、重置倒计时；见 [App.tsx](../../src/App.tsx) 与 [styles.css](../../src/styles.css)。在保持 `13px / 700`、金额不换行的前提下，紧凑档使用以下可验证预算：

| 项目 | 紧凑档数值 | 目的 |
| --- | ---: | --- |
| Tauri 窗口 | 256 x 256 logical px | 给圆瓶保留 8px 透明安全区，也避免窗口比内容大得多。Tauri 的宽、高和最小宽高均以 logical px 配置，因此高 DPI 下应保持这个逻辑尺寸，而不是按物理像素另算。[Tauri WindowConfig](https://v2.tauri.app/reference/config/#windowconfig) |
| 圆瓶 | 240 x 240 px | 两列只读数据的默认最小视觉载体。圆形而非外框满足“只留下水瓶”的要求。 |
| 内容横向内边距 | 8px | 两列可用总宽 `240 - 16 = 224px`，每列 112px；这是金额同行不换行的保守宽度预算。 |
| 内容纵向内边距 | 上 31px、下 37px | 可用高度为 172px。三行的最小文字高度约为 `3 x 16.25 + 2 x 4 = 56.75px`，剩余空间用于圆形内切、居中与水面变化。 |
| 视觉导航按钮 | 24 x 24px | 仅多订阅时出现，且仅悬停或键盘聚焦后显示；不挤占常态信息面积。24px 满足 WCAG 2.2 AA 对指针目标的最低尺寸；实际命中区另行扩展，见下文。 |

**不要把圆瓶降到 240px 以下，除非同步改变信息结构。** 当直径低于 240px 时，每列的金额行会接近 112px 以下；货币符号、千分位、不同币种和本地化文本会迅速吃掉余量。这里的边界来自当前项目的真实 DOM 结构，不是通用 UI 常数。发行前应以实际字体（Windows 的 Segoe UI、macOS 的系统字体）逐条验证：所有 `.amount-line` 与倒计时元素均满足 `scrollWidth <= clientWidth`，且文本边界没有越出圆形可见区域。

## 成熟桌面控件可复用的规律

### 1. 内容决定默认尺寸，尺寸档位离散

GNOME 明确建议：内容有限的窗口应以较小尺寸为默认，避免大块空白；浮层应小且低复杂度，通常不应覆盖父窗口三分之一以上。[GNOME 窗口](https://developer.gnome.org/hig/patterns/containers/windows.html) [GNOME 浮层](https://developer.gnome.org/hig/patterns/containers/popovers.html)

**应用到 3R：** 不做无边界拖拽缩放滑杆。提供两个离散档位即可：

| 档位 | 窗口 | 圆瓶 | 使用条件 |
| --- | ---: | ---: | --- |
| 紧凑（默认） | 256 x 256 | 240px | 当前 13px 粗体、常见 USD 金额、桌面指针操作。 |
| 标准 | 320 x 320 | 280px | 用户选择更大系统缩放、需要更从容阅读，或真实金额字符串不通过紧凑档的溢出检查。 |

离散档位的好处是每档都能进行溢出、对比度和命中区验证；任意缩放会把同一套 13px 固定文字带入不可预测的窄列。这个取舍直接服务于项目“长期常驻、低打扰”的目标。

### 2. 视觉小，不等于可点区域小

Microsoft 建议 Windows 的触控目标一般为约 7.5mm，即 135 PPI、1.0x 下的 40 x 40px；频繁点击或误触代价高的目标应更大，并留出更多内边距、远离内容边缘。[Microsoft Targeting](https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-targeting) Apple HIG 的按钮指南也建议一般至少 44 x 44pt 的命中区域，并让两个按钮中心通常相距至少 60pt。[Apple HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)

WCAG 2.2 AA 则规定，指针目标至少 24 x 24 CSS px；小于此值时，24px 直径的相邻目标范围不能互相相交。[WCAG 2.2 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)

**应用到 3R：**

- 圆瓶内翻页箭头可保持 24px 的视觉尺寸，正好达到 WCAG 最低线；它们是低频、可替代的导航，不应成为主信息。
- 每个箭头的实际命中区应扩为 40 x 40px（Windows）至 44 x 44pt（macOS），图标和可见圆形底仍维持 24px；扩大命中区只能向瓶内延展，两个命中区不得交叠。若圆瓶内无法满足该约束，翻页应改由托盘菜单或键盘完成，而不是继续缩小热区。
- 不要把设置、刷新、关闭等高频或破坏性指令塞进瓶内。它们会挤压 112px 的文字列，也会违反 Windows 对边缘误触的提醒。设置应保留在系统托盘菜单或独立设置窗。

GNOME 还建议：按钮在标题栏之外应只包含图标或文字之一；右键或双击不应是用户发现某项操作的唯一途径。[GNOME 按钮](https://developer.gnome.org/hig/patterns/controls/buttons.html) 对叠加控件，GNOME 建议在不交互时显示较少控件，在指针进入内容或触摸时再显示。[GNOME Overlaid Controls](https://developer.gnome.org/hig/patterns/controls/overlaid.html)

**应用到 3R：** 可以保留用户要求的右键“基本设置”菜单，但必须同时提供可发现的入口（例如托盘菜单中的“设置”）。Apple 同样将菜单定位为节省空间的命令呈现方式。[Apple HIG Menus](https://developer.apple.com/design/human-interface-guidelines/menus) 圆瓶内部不再增加文字按钮；只有无文字的翻页图标，且它已有 `aria-label`、标题提示和键盘焦点。

Apple 将按钮定义为“发起即时动作”的控件，并建议至少 44 x 44pt 命中区。[Apple HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) 这不是圆瓶直径的推荐值，不能把它误当作承载六段额度文本的尺寸；它只约束少量可点控件的热区。Windows 40px 触控建议和 WCAG 24px 最低线共同说明：应分离视觉图标尺寸与实际命中区。

### 3. 颜色只是水位编码，文字必须独立可读

WCAG 2.2 要求颜色不得作为传达信息的唯一视觉手段。[WCAG 2.2 1.4.1](https://www.w3.org/TR/WCAG22/#use-of-color) 对普通文本要求至少 4.5:1 对比度；只有至少 18pt 常规或 14pt 粗体的“大号文本”才可降到 3:1。[WCAG 2.2 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)

**应用到 3R：** “周/月”标签、金额、上限和倒计时不能只靠绿/蓝区分，当前文字标签必须保留。13px 粗体不属于 WCAG 的“大号文本”，所以要对以下背景分别测量文字的 4.5:1 对比度：空瓶底色、绿色满水、蓝色满水，以及水面恰好穿过文字的状态。白色投影可以改善观感，但不能替代可测的前景/背景对比度。

GNOME 也提醒，图形背景上的文字会降低对比度，应尽量减少字体尺寸和字重变体。[GNOME Typography](https://developer.gnome.org/hig/guidelines/typography.html) 对本项目而言，水位背景上的文字是用户明确选择的信息密度取舍，因此保持统一 `13px / 700`，并以真实水位状态验证对比度；不要再缩小字号，也不要增加另一张信息卡。

### 4. 边缘隐藏只压缩干扰，不牺牲可找回性

Windows 的目标设计指南特别指出，靠近内容边缘且误触后果较重的目标要增加内边距并谨慎放置。[Microsoft Targeting](https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-targeting) Tauri 将窗口位置与大小都定义为 logical px，因此多显示器或 DPI 变化后可以根据当前可用工作区重新计算位置。[Tauri WindowConfig](https://v2.tauri.app/reference/config/#windowconfig)

GNOME 指出顶部与底部屏幕边缘的拖动手势由系统保留；Apple 也要求布局遵守屏幕安全区域。[GNOME Pointer and Touch](https://developer.gnome.org/hig/guidelines/pointer-touch.html) [Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

**应用到 3R：**

- 仅在用户拖动结束时吸附屏幕边缘，不能在拖动途中突然隐藏；优先允许左右边缘隐藏，不把顶部/底部作为默认吸附位。
- 隐藏态只露出 8px 的无文字色条/弧边；鼠标悬停、键盘聚焦或托盘菜单的“显示悬浮窗”都会完整展开。macOS 上还要避开菜单栏、Dock 与刘海安全区。
- 托盘/菜单栏图标是隐藏态的可靠兜底入口；Apple 将 menu bar extra 定义为应用不在前台时仍可见的应用专属图标，并在空间紧张时由系统处理拥挤。[Apple HIG The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar) 因此它适合承载“显示悬浮窗”和设置入口，不应被误当成承载两列额度文字的 24pt 替代品。
- 保存的是“贴靠哪一边 + 相对偏移”，不是绝对物理像素；显示器拔插、分辨率或缩放改变后，先限制到当前工作区，再恢复完整圆瓶，避免窗口被留在屏幕外。
- 隐藏态的边缘热区应有不小于 24px 的可点击高度；触控可用时扩为约 40px 的向内命中区。这样符合前述 WCAG/Windows 依据，又不扩大可见圆瓶。

## 跨平台实现注意项

Tauri 官方配置说明确认 `width`、`height`、`minWidth`、`minHeight` 使用 logical px，适合把紧凑档锁定为 256 x 256。[Tauri WindowConfig](https://v2.tauri.app/reference/config/#windowconfig)

Windows 的 `CompactOverlayPresenter` 是一个固定尺寸、始终置顶的画中画窗口，尽管其默认视觉比例为 16:9、并不适合直接套用到圆瓶，但“固定尺寸 + 始终置顶 + 单任务内容”的模式与本项目一致。[Microsoft Manage app windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/manage-app-windows) 无标题栏后，平台不再提供默认拖动区，因此必须保留足够大的瓶身拖动区域，并把翻页等按钮从该区域排除。[Microsoft Title bar customization](https://learn.microsoft.com/en-us/windows/apps/develop/title-bar)

不过 Tauri 也明确说明：`transparent: true` 在 macOS 需要启用 `macOSPrivateApi`，而使用该私有 API 的应用不能通过 Mac App Store 审核；Windows 可用 `noRedirectionBitmap` 减少透明窗口首次渲染时的白闪。[Tauri transparent](https://v2.tauri.app/reference/config/#transparent)

**应用到 3R：** 240px 圆瓶本身跨 DPI 没有阻碍，但 macOS 发布渠道要在实现前确定：

1. 若接受官网分发/公证，不经 Mac App Store，可评估 Tauri 的透明窗口方案。
2. 若目标是 Mac App Store，不能把私有 API 透明窗口当作既定前提，需要改为平台允许的非透明载体或重新评估外观。

这不是尺寸优化可以掩盖的差异，必须在 macOS 打包前做真实机验证。

## 本次实现的验收清单

- [ ] `width`、`height`、`minWidth`、`minHeight` 全部为 `256` logical px；圆瓶为 `240px`，舞台内边距 `8px`。
- [ ] Windows 100%、125%、150% 缩放与 macOS Retina 下，圆瓶没有被透明窗口裁切。
- [ ] 周/月两列的金额与倒计时在最宽真实货币格式下均不溢出；若失败，自动回退到“标准”档而非缩小字号或省略金额。
- [ ] 水位为 0%、50%、100% 时，每一个 13px 粗体文字都达到至少 4.5:1 的可测对比度；周/月的文字标签始终存在。
- [ ] 多订阅时翻页箭头仅悬停/聚焦出现；其可见尺寸至少 24px，触控命中区为 40px 且不互相重叠。
- [ ] 右键设置保留，但托盘菜单也能打开设置与恢复隐藏悬浮窗。
- [ ] 边缘隐藏后，显示器/DPI 改变仍能从当前工作区找回完整圆瓶。

## 来源

- [Microsoft Learn: Targeting - Windows apps](https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-targeting)
- [Apple Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Apple Human Interface Guidelines: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Apple Human Interface Guidelines: Menus](https://developer.apple.com/design/human-interface-guidelines/menus)
- [Apple Human Interface Guidelines: The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar)
- [GNOME HIG: Windows](https://developer.gnome.org/hig/patterns/containers/windows.html)
- [GNOME HIG: Popovers](https://developer.gnome.org/hig/patterns/containers/popovers.html)
- [GNOME HIG: Buttons](https://developer.gnome.org/hig/patterns/controls/buttons.html)
- [GNOME HIG: Overlaid Controls](https://developer.gnome.org/hig/patterns/controls/overlaid.html)
- [GNOME HIG: Pointer & Touch](https://developer.gnome.org/hig/guidelines/pointer-touch.html)
- [GNOME HIG: Typography](https://developer.gnome.org/hig/guidelines/typography.html)
- [W3C WCAG 2.2: 1.4.1 Use of Color](https://www.w3.org/TR/WCAG22/#use-of-color)
- [W3C WCAG 2.2: 1.4.3 Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [W3C WCAG 2.2: 2.5.8 Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum)
- [Tauri v2: WindowConfig](https://v2.tauri.app/reference/config/#windowconfig)
- [Tauri v2: `transparent`](https://v2.tauri.app/reference/config/#transparent)
- [Microsoft Learn: Manage app windows](https://learn.microsoft.com/en-us/windows/apps/develop/ui/manage-app-windows)
- [Microsoft Learn: Title bar customization](https://learn.microsoft.com/en-us/windows/apps/develop/title-bar)

param(
  [string]$Executable = (Join-Path $PSScriptRoot "..\src-tauri\target\debug\three_r_waterline.exe")
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class NativeDesktopCheck {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")]
  public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);
}
'@

function Get-WaterlineProcess {
  Get-Process -Name "three_r_waterline" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq (Resolve-Path -LiteralPath $Executable).Path } |
    Select-Object -First 1
}

function Wait-WaterlineWindow {
  $deadline = (Get-Date).AddSeconds(12)
  do {
    $process = Get-WaterlineProcess
    if ($null -ne $process -and $process.MainWindowHandle -ne 0) {
      return $process
    }
    Start-Sleep -Milliseconds 120
  } while ((Get-Date) -lt $deadline)

  throw "未在 12 秒内找到 3R 水位窗口"
}

function Get-WindowRect([IntPtr]$handle) {
  $rect = New-Object NativeDesktopCheck+RECT
  if (-not [NativeDesktopCheck]::GetWindowRect($handle, [ref]$rect)) {
    throw "无法读取悬浮窗坐标"
  }
  return $rect
}

function Invoke-MouseClick([int]$x, [int]$y, [uint32]$downFlag, [uint32]$upFlag) {
  [NativeDesktopCheck]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 80
  [NativeDesktopCheck]::mouse_event($downFlag, 0, 0, 0, [UIntPtr]::Zero)
  [NativeDesktopCheck]::mouse_event($upFlag, 0, 0, 0, [UIntPtr]::Zero)
}

function Invoke-Key([byte]$key) {
  [NativeDesktopCheck]::keybd_event($key, 0, 0, [UIntPtr]::Zero)
  [NativeDesktopCheck]::keybd_event($key, 0, 2, [UIntPtr]::Zero)
}

function Find-VisibleMenuItem([string]$name) {
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $name
  )
  $deadline = (Get-Date).AddSeconds(3)
  do {
    $items = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      $condition
    )
    for ($index = 0; $index -lt $items.Count; $index += 1) {
      $item = $items.Item($index)
      if (-not $item.Current.IsOffscreen -and $item.Current.ControlType.ProgrammaticName -eq "ControlType.MenuItem") {
        return $item
      }
    }
    Start-Sleep -Milliseconds 60
  } while ((Get-Date) -lt $deadline)

  throw "未找到原生菜单项: $name"
}

function Find-VisibleElement([string]$name) {
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    $name
  )
  $deadline = (Get-Date).AddSeconds(3)
  do {
    $item = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants,
      $condition
    )
    if ($null -ne $item -and -not $item.Current.IsOffscreen) {
      return $item
    }
    Start-Sleep -Milliseconds 60
  } while ((Get-Date) -lt $deadline)

  throw "未找到原生菜单项: $name"
}

function Invoke-ElementClick($element) {
  $bounds = $element.Current.BoundingRectangle
  Invoke-MouseClick ([int]($bounds.Left + ($bounds.Width / 2))) ([int]($bounds.Top + ($bounds.Height / 2))) 0x0002 0x0004
}

function Get-WorkingArea([IntPtr]$handle) {
  return [System.Windows.Forms.Screen]::FromHandle($handle).WorkingArea
}

function Find-TrayIcon {
  for ($attempt = 0; $attempt -lt 4; $attempt += 1) {
    $all = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    for ($index = 0; $index -lt $all.Count; $index += 1) {
      $element = $all.Item($index)
      if (-not $element.Current.IsOffscreen -and $element.Current.Name -eq "3R 水位" -and $element.Current.ControlType.ProgrammaticName -eq "ControlType.Button") {
        return $element
      }
    }

    $overflow = Find-VisibleElement "显示隐藏的图标"
    Invoke-ElementClick $overflow
    Start-Sleep -Milliseconds 300
  }

  throw "未找到系统托盘中的 3R 水位图标"
}

function Select-TrayMenuItem([string]$name) {
  for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
    try {
      $tray = Find-TrayIcon
      $bounds = $tray.Current.BoundingRectangle
      Invoke-MouseClick ([int]($bounds.Left + ($bounds.Width / 2))) ([int]($bounds.Top + ($bounds.Height / 2))) 0x0008 0x0010
      $menuItem = Find-VisibleMenuItem $name
      Invoke-ElementClick $menuItem
      Start-Sleep -Milliseconds 650
      return
    } catch {
      # Notification-area overflow and the tray menu can retain an open popup
      # between runs. Close it before retrying so a stale popup cannot make a
      # real MenuItem appear missing.
      Invoke-Key 0x1B
      Start-Sleep -Milliseconds 220
      if ($attempt -eq 2) {
        throw
      }
    }
  }
}

function Test-VisibleMenuItem([string]$name) {
  try {
    $item = Find-VisibleMenuItem $name
    return $null -ne $item
  } catch {
    return $false
  }
}

function Select-OverlayMenuItem([string]$name) {
  for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
    try {
      $process = Wait-WaterlineWindow
      $handle = [IntPtr]$process.MainWindowHandle
      [NativeDesktopCheck]::SetForegroundWindow($handle) | Out-Null
      $rect = Get-WindowRect $handle
      $x = [int](($rect.Left + $rect.Right) / 2)
      $y = [int](($rect.Top + $rect.Bottom) / 2)
      Invoke-MouseClick $x $y 0x0008 0x0010
      $menuItem = Find-VisibleMenuItem $name
      Invoke-ElementClick $menuItem
      Start-Sleep -Milliseconds 420
      return
    } catch {
      Invoke-Key 0x1B
      Start-Sleep -Milliseconds 220
      if ($attempt -eq 2) {
        throw
      }
    }
  }
}

if (-not (Test-Path -LiteralPath $Executable)) {
  throw "未找到测试程序: $Executable"
}

$initialProcesses = @(Get-Process -Name "three_r_waterline" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq (Resolve-Path -LiteralPath $Executable).Path })
if ($initialProcesses.Count -eq 0) {
  Start-Process -FilePath $Executable | Out-Null
}

$process = Wait-WaterlineWindow
$handle = [IntPtr]$process.MainWindowHandle
if (-not [NativeDesktopCheck]::IsWindowVisible($handle)) {
  Select-TrayMenuItem "显示 3R 水位"
  $process = Wait-WaterlineWindow
  $handle = [IntPtr]$process.MainWindowHandle
  Start-Sleep -Milliseconds 350
}
[NativeDesktopCheck]::SetForegroundWindow($handle) | Out-Null
$null = Start-Sleep -Milliseconds 1000

# Always establish a known starting mode before measuring native window behavior.
Select-OverlayMenuItem "圆形水瓶"
$process = Wait-WaterlineWindow
$handle = [IntPtr]$process.MainWindowHandle
$initialRect = Get-WindowRect $handle
[NativeDesktopCheck]::SetCursorPos(0, 0) | Out-Null

$dragStartX = [int](($initialRect.Left + $initialRect.Right) / 2)
$dragStartY = [int](($initialRect.Top + $initialRect.Bottom) / 2)
$dragOffsetX = $dragStartX - $initialRect.Left

[NativeDesktopCheck]::SetCursorPos($dragStartX, $dragStartY) | Out-Null
[NativeDesktopCheck]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 160
[NativeDesktopCheck]::SetCursorPos($dragOffsetX + 4, $dragStartY) | Out-Null
Start-Sleep -Milliseconds 160
[NativeDesktopCheck]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 360
$draggedRect = Get-WindowRect $handle

# Regression: open settings from the tray while the overlay is already hidden.
# The app must restore first, expand, and clamp the whole dialog to the work area.
$workArea = Get-WorkingArea $handle
Select-TrayMenuItem "设置"
$settingsHandle = [IntPtr](Wait-WaterlineWindow).MainWindowHandle
Start-Sleep -Milliseconds 650
$settingsRect = Get-WindowRect $settingsHandle
$settingsInsideWorkArea = $settingsRect.Left -ge $workArea.Left -and $settingsRect.Top -ge $workArea.Top -and $settingsRect.Right -le $workArea.Right -and $settingsRect.Bottom -le $workArea.Bottom
$closeSettingsButton = Find-VisibleElement "关闭设置"
Invoke-ElementClick $closeSettingsButton
Start-Sleep -Milliseconds 420
$restoredFromEdgeRect = Get-WindowRect $handle

# Regression: after restoring once, dragging away and back to the same edge
# must enter Edge Hide again instead of leaving the overlay permanently free.
$secondDragStartX = [int](($restoredFromEdgeRect.Left + $restoredFromEdgeRect.Right) / 2)
$secondDragStartY = [int](($restoredFromEdgeRect.Top + $restoredFromEdgeRect.Bottom) / 2)
$secondDragOffsetX = $secondDragStartX - $restoredFromEdgeRect.Left
[NativeDesktopCheck]::SetCursorPos($secondDragStartX, $secondDragStartY) | Out-Null
[NativeDesktopCheck]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 160
[NativeDesktopCheck]::SetCursorPos($secondDragOffsetX + 4, $secondDragStartY) | Out-Null
Start-Sleep -Milliseconds 160
[NativeDesktopCheck]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 360
$secondHiddenRect = Get-WindowRect $handle
$secondEdgeHidden = $secondHiddenRect.Left -lt $restoredFromEdgeRect.Left
Invoke-MouseClick ([int]($secondHiddenRect.Right - 4)) ([int](($secondHiddenRect.Top + $secondHiddenRect.Bottom) / 2)) 0x0002 0x0004
Start-Sleep -Milliseconds 420
$secondRestoredRect = Get-WindowRect $handle
$edgeHideRearmed = $secondEdgeHidden -and ($secondRestoredRect.Left -ne $secondHiddenRect.Left)

# Regression: hovering the edge tab restores the overlay, and moving the
# pointer away must re-hide it without requiring a second drag.
$escapeX = [int]($secondRestoredRect.Right + 60)
$escapeY = [int]($secondRestoredRect.Bottom + 60)
for ($step = 1; $step -le 10; $step += 1) {
  $cursorX = [int]($secondRestoredRect.Left + (($escapeX - $secondRestoredRect.Left) * $step / 10))
  $cursorY = [int](($secondRestoredRect.Top + $secondRestoredRect.Bottom) / 2) + (($escapeY - (($secondRestoredRect.Top + $secondRestoredRect.Bottom) / 2)) * $step / 10)
  [NativeDesktopCheck]::SetCursorPos($cursorX, $cursorY) | Out-Null
  Start-Sleep -Milliseconds 35
}
Start-Sleep -Milliseconds 520
$autoRehiddenRect = Get-WindowRect $handle
$autoRehidden = $autoRehiddenRect.Left -lt $secondRestoredRect.Left -or $autoRehiddenRect.Top -lt $secondRestoredRect.Top
Select-TrayMenuItem "显示 3R 水位"

Select-OverlayMenuItem "Traffic Monitor 横条"
$trafficProcess = Wait-WaterlineWindow
$trafficRect = Get-WindowRect ([IntPtr]$trafficProcess.MainWindowHandle)
$nativeMenuDismissed = -not (Test-VisibleMenuItem "Traffic Monitor 横条")

Select-OverlayMenuItem "隐藏悬浮窗"
$hidden = $false
$hiddenDeadline = (Get-Date).AddSeconds(2)
do {
  $hidden = -not [NativeDesktopCheck]::IsWindowVisible([IntPtr]$trafficProcess.MainWindowHandle)
  if (-not $hidden) {
    Start-Sleep -Milliseconds 80
  }
} while (-not $hidden -and (Get-Date) -lt $hiddenDeadline)

# A second launch must restore the existing window instead of creating another process.
Start-Process -FilePath $Executable | Out-Null
Start-Sleep -Milliseconds 700
$liveProcesses = @(Get-Process -Name "three_r_waterline" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq (Resolve-Path -LiteralPath $Executable).Path })
$restoredProcess = Wait-WaterlineWindow
$restoredVisible = [NativeDesktopCheck]::IsWindowVisible([IntPtr]$restoredProcess.MainWindowHandle)

[pscustomobject]@{
  SingleInstance = $liveProcesses.Count -eq 1
  LiveProcessCount = $liveProcesses.Count
  Dragged = ($draggedRect.Left -ne $initialRect.Left) -or ($draggedRect.Top -ne $initialRect.Top)
  EdgeTabRestored = [NativeDesktopCheck]::IsWindowVisible([IntPtr]$process.MainWindowHandle) -and (($restoredFromEdgeRect.Left -ne $draggedRect.Left) -or ($restoredFromEdgeRect.Top -ne $draggedRect.Top))
  EdgeHideRearmed = $edgeHideRearmed
  AutoRehidden = $autoRehidden
  SettingsInsideWorkArea = $settingsInsideWorkArea
  Hidden = $hidden
  TrafficSelected = $trafficRect.Bottom - $trafficRect.Top -lt $initialRect.Bottom - $initialRect.Top
  NativeMenuDismissed = $nativeMenuDismissed
  RestoredBySecondLaunch = $restoredVisible
  InitialHeight = $initialRect.Bottom - $initialRect.Top
  TrafficHeight = $trafficRect.Bottom - $trafficRect.Top
}

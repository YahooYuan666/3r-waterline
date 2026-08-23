param(
  [string]$Executable = (Join-Path $PSScriptRoot "..\src-tauri\target\release\three_r_waterline.exe")
)

$ErrorActionPreference = "Stop"

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class EdgeAutoHideNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@

function Get-TestProcess {
  Get-Process -Name "three_r_waterline" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq (Resolve-Path -LiteralPath $Executable).Path } |
    Select-Object -First 1
}

function Wait-TestProcess {
  $deadline = (Get-Date).AddSeconds(12)
  do {
    $process = Get-TestProcess
    if ($process -and $process.MainWindowHandle -ne 0) { return $process }
    Start-Sleep -Milliseconds 120
  } while ((Get-Date) -lt $deadline)
  throw "未在 12 秒内找到测试窗口"
}

function Get-Rect([IntPtr]$handle) {
  $rect = New-Object EdgeAutoHideNative+RECT
  if (-not [EdgeAutoHideNative]::GetWindowRect($handle, [ref]$rect)) { throw "无法读取窗口坐标" }
  return $rect
}

function Drag-ToLeftEdge([IntPtr]$handle) {
  $rect = Get-Rect $handle
  $startX = [int](($rect.Left + $rect.Right) / 2)
  $startY = [int](($rect.Top + $rect.Bottom) / 2)
  $offsetX = $startX - $rect.Left
  [EdgeAutoHideNative]::SetCursorPos($startX, $startY) | Out-Null
  [EdgeAutoHideNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 160
  [EdgeAutoHideNative]::SetCursorPos($offsetX + 4, $startY) | Out-Null
  Start-Sleep -Milliseconds 160
  [EdgeAutoHideNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 500
}

if (-not (Test-Path -LiteralPath $Executable)) { throw "未找到测试程序: $Executable" }
$process = Get-TestProcess
if ($process) {
  $process | Stop-Process -Force
  $deadline = (Get-Date).AddSeconds(3)
  do {
    Start-Sleep -Milliseconds 80
    $process = Get-TestProcess
  } while ($process -and (Get-Date) -lt $deadline)
  if ($process) { throw "旧测试进程未在 3 秒内退出" }
}
Start-Process -FilePath $Executable | Out-Null
$process = Wait-TestProcess
$handle = [IntPtr]$process.MainWindowHandle
$initialRect = Get-Rect $handle
Start-Sleep -Milliseconds 1000

Drag-ToLeftEdge $handle
$hiddenRect = Get-Rect $handle
$hidden = $hiddenRect.Left -lt $initialRect.Left

# Hover the visible tab; the expanded window should move under this pointer.
[EdgeAutoHideNative]::SetCursorPos([int]($hiddenRect.Right - 4), [int](($hiddenRect.Top + $hiddenRect.Bottom) / 2)) | Out-Null
Start-Sleep -Milliseconds 700
$restoredRect = Get-Rect $handle
$restored = [EdgeAutoHideNative]::IsWindowVisible($handle) -and $restoredRect.Left -ne $hiddenRect.Left

# Move outside the restored window and away from the edge activation corridor.
$escapeX = [int]($restoredRect.Right + 60)
$escapeY = [int]($restoredRect.Bottom + 60)
for ($step = 1; $step -le 10; $step += 1) {
  $cursorX = [int]($restoredRect.Left + (($escapeX - $restoredRect.Left) * $step / 10))
  $cursorY = [int]((($restoredRect.Top + $restoredRect.Bottom) / 2) + (($escapeY - (($restoredRect.Top + $restoredRect.Bottom) / 2)) * $step / 10))
  [EdgeAutoHideNative]::SetCursorPos($cursorX, $cursorY) | Out-Null
  Start-Sleep -Milliseconds 35
}
Start-Sleep -Milliseconds 650
$afterLeaveRect = Get-Rect $handle
$autoRehidden = $afterLeaveRect.Left -lt $restoredRect.Left

[pscustomobject]@{
  HiddenAfterDrag = $hidden
  RestoredOnHover = $restored
  AutoRehiddenAfterPointerLeave = $autoRehidden
}

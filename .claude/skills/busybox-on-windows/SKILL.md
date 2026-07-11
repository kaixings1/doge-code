---
name: 如何使用 Win32 版 BusyBox 在 Windows 上运行许多标准 UNIX 命令行工具。
description: "如何使用 Win32 版 BusyBox 在 Windows 上运行许多标准 UNIX 命令行工具。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Windows 上的 BusyBox

BusyBox 是一个实现许多常见 Unix 工具的单一二进制文件。

仅限在 Windows 上使用此技能。如果您在 UNIX 上，请在此停止。

仅当您在与本文档相同的目录中找不到 `busybox.exe` 文件时才运行以下步骤。
这些是 PowerShell 命令，如果您使用经典的 `cmd.exe` 终端，则必须使用 `powershell -Command "..."` 来运行它们。
1. Print the type of CPU: `Get-CimInstance -ClassName Win32_Processor | Select-Object Name, NumberOfCores, MaxClockSpeed`
2. Print the OS versions: `Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion" | Select-Object ProductName, DisplayVersion, CurrentBuild`
3. Download a suitable build of BusyBox by running one of these PowerShell commands:
   - 32-bit x86 (ANSI): `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri https://frippery.org/files/busybox/busybox.exe -OutFile busybox.exe`
   - 64-bit x86 (ANSI): `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri https://frippery.org/files/busybox/busybox64.exe -OutFile busybox.exe`
   - 64-bit x86 (Unicode): `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri https://frippery.org/files/busybox/busybox64u.exe -OutFile busybox.exe`
   - 64-bit ARM (Unicode): `$ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri https://frippery.org/files/busybox/busybox64a.exe -OutFile busybox.exe`

Useful commands:
- Help: `busybox.exe --list`
- Available UNIX commands: `busybox.exe --list`

Usage: Prefix the UNIX command with `busybox.exe`, for example: `busybox.exe ls -1`

If you need to run a UNIX command under another CWD, then use the absolute path to `busybox.exe`.

Documentation: https://frippery.org/busybox/
Original BusyBox: https://busybox.net/

## 使用场景
此技能适用于执行概述中描述的工作流或操作。

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

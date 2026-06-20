---
name: cardputer-buddy
description: 迭代开发 the Cardputer-Adv MicroPython app bundle (Claude Buddy, Snake, Hello) after the device is 已通过m5-onboard配置. Use when the user wants to 添加新应用, push a single changed .py without re-flashing, watch device serial logs, or run a one-shot REPL command. Trigger on "add an app", "推送到Cardputer", "查看设备日志", "在设备上运行", or 后续工作 after /maker-setup.
---

# Cardputer Buddy应用捆绑包

The `buddy/` directory in the local `build-with-claude` clone is the MicroPython payload that `m5-onboard` installs onto `/flash/`. Work inside that clone.

## 设备布局

```
/flash/
├── main.py              launcher menu (replaces UIFlow's boot flow)
├── buddy_*.py           共享库 (BLE, UI, state, protocol, chars)
├── burst_frames.py      精灵帧
└── apps/
    ├── claude_buddy.py  BLE客户端 → Claude Desktop's Hardware Buddy
    ├── hello_cardputer.py
    └── snake.py
```

`main.py` 扫描 `/flash/apps/` at boot and lists every `.py` as a menu entry. 放入文件 into `buddy/device/apps/`, 推送它, and it appears 下次启动时.

## 添加应用

借鉴 `buddy/device/apps/hello_cardputer.py` — 最小示例 of 键盘轮询, 字体, and 退出约定. Then 推送而不重新刷写:

```bash
python3 onboard/scripts/install_apps.py --port <PORT> --src buddy
```

`<PORT>` is whatever `detect.py` reported last run (e.g. `/dev/cu.usbmodem1101`, `/dev/ttyACM0`, `COM3`).

## 开发循环工具 (`buddy/scripts/`)

```bash
# Push a subset of files over USB-serial
python3 buddy/scripts/push.py --port <PORT> --files apps/snake.py

# 查看设备日志
python3 buddy/scripts/tail_serial.py --port <PORT>

# 一次性REPL执行
python3 buddy/scripts/repl_run.py --port <PORT> --script "import os; print(os.listdir('/flash'))"
```

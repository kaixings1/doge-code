"""
通用工具函数集合
"""
import os
import time
from typing import Any

def generate_timestamp(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """生成指定格式的时间戳"""
    return time.strftime(fmt, time.localtime())

def ensure_dir(path: str) -> None:
    """递归创建目录，目录已存在时不会报错"""
    os.makedirs(path, exist_ok=True)

def run_cmd(cmd: str, check: bool = True) -> tuple[int, str, str]:
    """执行shell命令，返回(状态码, 标准输出, 错误输出)"""
    import subprocess
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"命令执行失败: {cmd}\n错误信息: {result.stderr}")
    return result.returncode, result.stdout, result.stderr

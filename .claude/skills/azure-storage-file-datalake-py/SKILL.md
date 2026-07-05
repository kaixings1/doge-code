---
name: azure-storage-file-datalake-py
description: "Azure Storage File Datalake Py — Azure Storage File Datalake Py 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# Azure Data Lake Storage Gen2 SDK for Python

Hierarchical file system for big data analytics workloads.

## 安装

```bash
pip install azure-storage-file-datalake azure-identity
```

## 环境变量

```bash
AZURE_STORAGE_ACCOUNT_URL=https://<account>.dfs.core.windows.net
```

## 认证

```python
from azure.identity import DefaultAzureCredential
from azure.storage.filedatalake import DataLakeServiceClient

credential = DefaultAzureCredential()
account_url = "https://<account>.dfs.core.windows.net"

service_client = DataLakeServiceClient(account_url=account_url, credential=credential)
```

## Client Hierarchy

| Client | Purpose |
|--------|---------|
| `DataLakeServiceClient` | Account-level operations |
| `FileSystemClient` | Container (file system) operations |
| `DataLakeDirectoryClient` | Directory operations |
| `DataLakeFileClient` | File operations |

## File System Operations

```python
# Create file system (container)
file_system_client = service_client.create_file_system("myfilesystem")

# Get existing
file_system_client = service_client.get_file_system_client("myfilesystem")

# Delete
service_client.delete_file_system("myfilesystem")

# List file systems
for fs in service_client.list_file_systems():
    print(fs.name)
```

## Directory Operations

```python
file_system_client = service_client.get_file_system_client("myfilesystem")

# Create directory
directory_client = file_system_client.create_directory("mydir")

# Create nested directories
directory_client = file_system_client.create_directory("path/to/nested/dir")

# Get directory client
directory_client = file_system_client.get_directory_client("mydir")

# Delete directory
directory_client.delete_directory()

# Rename/move directory
directory_client.rename_directory(new_name="myfilesystem/newname")
```

## File Operations

### Upload File

```python
# Get file client
file_client = file_system_client.get_file_client("path/to/file.txt")

# Upload from local file
with open("local-file.txt", "rb") as data:
    file_client.upload_data(data, overwrite=True)

# Upload bytes
file_client.upload_data(b"Hello, Data Lake!", overwrite=True)

# Append data (for large files)
file_client.append_data(data=b"chunk1", offset=0, length=6)
file_client.append_data(data=b"chunk2", offset=6, length=6)
file_client.flush_data(12)  # Commit the data
```

### Download File

```python
file_client = file_system_client.get_file_client("path/to/file.txt")

# Download all content
download = file_client.download_file()
content = download.readall()

# Download to file
with open("downloaded.txt", "wb") as f:
    download = file_client.download_file()
    download.readinto(f)

# Download range
download = file_client.download_file(offset=0, length=100)
```

### Delete File

```python
file_client.delete_file()
```

## List Contents

```python
# List paths (files and directories)
for path in file_system_client.get_paths():
    print(f"{'DIR' if path.is_directory else 'FILE'}: {path.name}")

# List paths in directory
for path in file_system_client.get_paths(path="mydir"):
    print(path.name)

# Recursive listing
for path in file_system_client.get_paths(path="mydir", recursive=True):
    print(path.name)
```

## File/Directory 属性

```python
# Get properties
properties = file_client.get_file_properties()
print(f"Size: {properties.size}")
print(f"Last modified: {properties.last_modified}")

# Set metadata
file_client.set_metadata(metadata={"processed": "true"})
```

## Access Control (ACL)

```python
# Get ACL
acl = directory_client.get_access_control()
print(f"Owner: {acl['owner']}")
print(f"Permissions: {acl['permissions']}")

# Set ACL
directory_client.set_access_control(
    owner="user-id",
    permissions="rwxr-x---"
)

# Update ACL entries
from azure.storage.filedatalake import AccessControlChangeResult
directory_client.update_access_control_recursive(
    acl="user:user-id:rwx"
)
```

## Async Client

```python
from azure.storage.filedatalake.aio import DataLakeServiceClient
from azure.identity.aio import DefaultAzureCredential

async def datalake_operations():
    credential = DefaultAzureCredential()
    
    async with DataLakeServiceClient(
        account_url="https://<account>.dfs.core.windows.net",
        credential=credential
    ) as service_client:
        file_system_client = service_client.get_file_system_client("myfilesystem")
        file_client = file_system_client.get_file_client("test.txt")
        
        await file_client.upload_data(b"async content", overwrite=True)
        
        download = await file_client.download_file()
        content = await download.readall()

import asyncio
asyncio.run(datalake_operations())
```

## 最佳实践

1. **Use hierarchical namespace** for file system semantics
2. **Use `append_data` + `flush_data`** for large file uploads
3. **Set ACLs at directory level** and inherit to children
4. **Use async client** for high-throughput scenarios
5. **Use `get_paths` with `recursive=True`** for full directory listing
6. **Set metadata** for custom file attributes
7. **考虑 Blob API** for simple object storage use cases

## 使用场景
This skill is applicable to execute the workflow or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

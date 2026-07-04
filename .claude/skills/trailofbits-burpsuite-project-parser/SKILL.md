# Burp Suite 项目解析器

Search and extract data from Burp Suite project files (.burp) for use in Claude

**Author:** Will Vandevanter

## 前提条件

- **Burp Suite Professional** - 必需 for project file support
- **burpsuite-project-file-parser extension** - Must be installed in Burp Suite (Available: https://github.com/BuffaloWill/burpsuite-project-file-parser)
- **jq** (optional) - Recommended for formatting/filtering JSON output

## 使用场景

使用此技能当 you need to get the following from a Burp project:
- Search response headers or bodies using regex patterns
- Extract security audit findings and vulnerabilities
- Dump proxy history or site map data for analysis
- Programmatically analyze HTTP traffic captured by Burp Suite

Trigger phrases: "search the burp project", "find in burp file", "what vulnerabilities in the burp", "get audit items from burp"

## What It Does

此技能提供 CLI access to Burp Suite project files through the burpsuite-project-file-parser extension:

1. **Search headers/bodies** - Find specific patterns in captured HTTP traffic using regex
2. **Extract audit items** - Get all security findings with severity, confidence, and URLs
3. **Dump traffic data** - Export proxy history and site map entries as JSON
4. **Filter output** - Use sub-component filters to optimize performance on large projects

## 安装

```
/plugin install trailofbits/skills/plugins/burpsuite-project-parser
```

## 用法

Base command:
```bash
scripts/burp-search.sh /path/to/project.burp [FLAGS]
```

### Available Commands

| Command | Description | Output |
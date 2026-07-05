---
name: cloudformation-best-practices
description: "CloudFormation 模板优化、嵌套栈、漂移检测和生产部署最佳实践。"
risk: unknown
source: community
date_added: "2026-02-27"
---
你是专家 in AWS CloudFormation specializing in template optimization, stack architecture, and production-grade infrastructure deployment.

## 使用此技能的场景

- Writing or reviewing CloudFormation templates (YAML/JSON)
- Optimizing existing templates for maintainability and cost
- Designing nested or cross-stack architectures
- Troubleshooting stack creation/update failures and drift

## 不要使用此技能的场景

- The user prefers CDK or Terraform over raw CloudFormation
- The task is application code, not infrastructure

## 使用说明

1. Use YAML over JSON for readability.
2. Parameterize environment-specific values; use `Mappings` for static lookups.
3. Apply `DeletionPolicy: Retain` on stateful resources (RDS, S3, DynamoDB).
4. Use `Conditions` to support multi-environment templates.
5. Validate templates with `aws cloudformation validate-template` before deployment.
6. 优先 `!Sub` over `!Join` for string interpolation.

## 示例

### Example 1: Parameterized VPC Template

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Production VPC with public and private subnets

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
  VpcCidr:
    Type: String
    Default: "10.0.0.0/16"

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: !Ref VpcCidr
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: !Sub "${Environment}-vpc"

Outputs:
  VpcId:
    Value: !Ref VPC
    Export:
      Name: !Sub "${Environment}-VpcId"
```

## 最佳实践

- ✅ **Do:** Use `Outputs` with `Export` for cross-stack references
- ✅ **Do:** Add `DeletionPolicy` and `UpdateReplacePolicy` on stateful resources
- ✅ **Do:** Use `cfn-lint` and `cfn-nag` in CI pipelines
- ❌ **Don't:** Hardcode ARNs or account IDs — use `!Sub` with pseudo parameters
- ❌ **Don't:** Put all resources in a single monolithic template

## 故障排除

**Problem:** Stack stuck in `UPDATE_ROLLBACK_FAILED`
**Solution:** Use `continue-update-rollback` with `--resources-to-skip` for the failing resource, then fix the root cause.

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

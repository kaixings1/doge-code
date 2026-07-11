---
name: 指导 Java 开发者使用 Azure Communication SMS 客户端库发送短信。
description: "指导 Java 开发者使用 Azure Communication SMS 客户端库发送短信。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Azure Communication SMS (Java)

Send SMS messages to single or multiple recipients with delivery reporting.

## 安装

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-communication-sms</artifactId>
    <version>1.2.0</version>
</dependency>
```

## 客户端创建

```java
import com.azure.communication.sms.SmsClient;
import com.azure.communication.sms.SmsClientBuilder;
import com.azure.identity.DefaultAzureCredentialBuilder;

// With DefaultAzureCredential (recommended)
SmsClient smsClient = new SmsClientBuilder()
    .端点("https://<resource>.communication.azure.com")
    .credential(new DefaultAzureCredentialBuilder().build())
    .buildClient();

// With connection string
SmsClient smsClient = new SmsClientBuilder()
    .connectionString("<connection-string>")
    .buildClient();

// With AzureKeyCredential
import com.azure.core.credential.AzureKeyCredential;

SmsClient smsClient = new SmsClientBuilder()
    .端点("https://<resource>.communication.azure.com")
    .credential(new AzureKeyCredential("<access-key>"))
    .buildClient();

// Async client
SmsAsyncClient smsAsyncClient = new SmsClientBuilder()
    .connectionString("<connection-string>")
    .buildAsyncClient();
```

## Send SMS to Single Recipient

```java
import com.azure.communication.sms.models.SmsSendResult;

// Simple send
SmsSendResult result = smsClient.send(
    "+14255550100",      // From (your ACS phone number)
    "+14255551234",      // To
    "Your verification code is 123456");

System.out.println("Message ID: " + result.getMessageId());
System.out.println("To: " + result.getTo());
System.out.println("Success: " + result.isSuccessful());

if (!result.isSuccessful()) {
    System.out.println("Error: " + result.getErrorMessage());
    System.out.println("Status: " + result.getHttpStatusCode());
}
```

## Send SMS to Multiple Recipients

```java
import com.azure.communication.sms.models.SmsSendOptions;
import java.util.Arrays;
import java.util.List;

List<String> recipients = Arrays.asList(
    "+14255551111",
    "+14255552222",
    "+14255553333"
);

// With options
SmsSendOptions options = new SmsSendOptions()
    .setDeliveryReportEnabled(true)
    .setTag("marketing-campaign-001");

Iterable<SmsSendResult> results = smsClient.sendWithResponse(
    "+14255550100",      // From
    recipients,          // To list
    "Flash sale! 50% off today only.",
    options,
    Context.NONE
).getValue();

for (SmsSendResult result : results) {
    if (result.isSuccessful()) {
        System.out.println("Sent to " + result.getTo() + ": " + result.getMessageId());
    } else {
        System.out.println("Failed to " + result.getTo() + ": " + result.getErrorMessage());
    }
}
```

## Send Options

```java
SmsSendOptions options = new SmsSendOptions();

// Enable delivery reports (sent via Event Grid)
options.setDeliveryReportEnabled(true);

// Add custom tag for tracking
options.setTag("order-confirmation-12345");
```

## 响应 Handling

```java
import com.azure.core.http.rest.响应;

响应<Iterable<SmsSendResult>> 响应 = smsClient.sendWithResponse(
    "+14255550100",
    Arrays.asList("+14255551234"),
    "Hello!",
    new SmsSendOptions().setDeliveryReportEnabled(true),
    Context.NONE
);

// Check HTTP 响应
System.out.println("Status code: " + 响应.getStatusCode());
System.out.println("Headers: " + 响应.getHeaders());

// Process results
for (SmsSendResult result : 响应.getValue()) {
    System.out.println("Message ID: " + result.getMessageId());
    System.out.println("Successful: " + result.isSuccessful());
    
    if (!result.isSuccessful()) {
        System.out.println("HTTP Status: " + result.getHttpStatusCode());
        System.out.println("Error: " + result.getErrorMessage());
    }
}
```

## Async Operations

```java
import reactor.core.publisher.Mono;

SmsAsyncClient asyncClient = new SmsClientBuilder()
    .connectionString("<connection-string>")
    .buildAsyncClient();

// Send single message
asyncClient.send("+14255550100", "+14255551234", "Async message!")
    .subscribe(
        result -> System.out.println("Sent: " + result.getMessageId()),
        error -> System.out.println("Error: " + error.getMessage())
    );

// Send to multiple with options
SmsSendOptions options = new SmsSendOptions()
    .setDeliveryReportEnabled(true);

asyncClient.sendWithResponse(
    "+14255550100",
    Arrays.asList("+14255551111", "+14255552222"),
    "Bulk async message",
    options)
    .subscribe(响应 -> {
        for (SmsSendResult result : 响应.getValue()) {
            System.out.println("Result: " + result.getTo() + " - " + result.isSuccessful());
        }
    });
```

## 错误处理

```java
import com.azure.core.exception.HttpResponseException;

try {
    SmsSendResult result = smsClient.send(
        "+14255550100",
        "+14255551234",
        "Test message"
    );
    
    // Individual message errors don't throw exceptions
    if (!result.isSuccessful()) {
        handleMessageError(result);
    }
    
} catch (HttpResponseException e) {
    // 请求-level failures (auth, network, etc.)
    System.out.println("请求 failed: " + e.getMessage());
    System.out.println("Status: " + e.getResponse().getStatusCode());
} catch (RuntimeException e) {
    System.out.println("Unexpected error: " + e.getMessage());
}

private void handleMessageError(SmsSendResult result) {
    int status = result.getHttpStatusCode();
    String error = result.getErrorMessage();
    
    if (status == 400) {
        System.out.println("Invalid phone number: " + result.getTo());
    } else if (status == 429) {
        System.out.println("Rate limited - retry later");
    } else {
        System.out.println("Error " + status + ": " + error);
    }
}
```

## Delivery Reports

Delivery reports are sent via Azure Event Grid. Configure an Event Grid subscription for your ACS resource.

```java
// Event Grid webhook handler (in your 端点)
public void handleDeliveryReport(String eventJson) {
    // Parse Event Grid event
    // Event type: Microsoft.Communication.SMSDeliveryReportReceived
    
    // Event data contains:
    // - messageId: correlates to SmsSendResult.getMessageId()
    // - from: sender number
    // - to: recipient number
    // - deliveryStatus: "Delivered", "Failed", etc.
    // - deliveryStatusDetails: detailed status
    // - receivedTimestamp: when status was received
    // - tag: your custom tag from SmsSendOptions
}
```

## SmsSendResult 属性

| Property | Type | Description |
|----------|------|-------------|
| `getMessageId()` | String | Unique message identifier |
| `getTo()` | String | Recipient phone number |
| `isSuccessful()` | boolean | Whether send succeeded |
| `getHttp状态Code()` | int | HTTP status for this recipient |
| `getErrorMessage()` | String | Error details if failed |
| `getRepeatabilityResult()` | RepeatabilityResult | Idempotency result |

## 环境变量

```bash
AZURE_COMMUNICATION_ENDPOINT=https://<resource>.communication.azure.com
AZURE_COMMUNICATION_CONNECTION_STRING=端点=https://...;accesskey=...
SMS_FROM_NUMBER=+14255550100
```

## 最佳实践

1. **Phone Number Format** - Use E.164 format: `+[country code][number]`
2. **Delivery Reports** - Enable for critical messages (OTP, alerts)
3. **Tagging** - Use tags to correlate messages with business context
4. **Error Handling** - Check `isSuccessful()` for each recipient individually
5. **Rate Limiting** - Implement retry with backoff for 429 responses
6. **Bulk Sending** - Use batch send for multiple recipients (more efficient)

## 触发短语

- "send SMS Java", "text message Java"
- "SMS notification", "OTP SMS", "bulk SMS"
- "delivery report SMS", "Azure Communication Services SMS"

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

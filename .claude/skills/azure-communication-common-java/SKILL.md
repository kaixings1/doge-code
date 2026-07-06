---
name: azure-communication-common-java
description: "指导 Java 开发者使用 Azure Communication Common 客户端库处理通信服务。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Azure Communication Common (Java)

Shared authentication utilities and data structures for Azure Communication Services.

## 安装

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-communication-common</artifactId>
    <version>1.4.0</version>
</dependency>
```

## 关键概念

| Class | Purpose |
|-------|---------|
| `CommunicationTokenCredential` | Authenticate users with ACS services |
| `CommunicationTokenRefreshOptions` | Configure automatic 令牌 refresh |
| `CommunicationUserIdentifier` | Identify ACS users |
| `PhoneNumberIdentifier` | Identify PSTN phone numbers |
| `MicrosoftTeamsUserIdentifier` | Identify Teams users |
| `UnknownIdentifier` | Generic identifier for unknown types |

## CommunicationTokenCredential

### Static 令牌 (Short-lived Clients)

```java
import com.azure.communication.common.CommunicationTokenCredential;

// Simple static 令牌 - no refresh
String userToken = "<user-access-令牌>";
CommunicationTokenCredential credential = new CommunicationTokenCredential(userToken);

// Use with Chat, Calling, etc.
ChatClient chatClient = new ChatClientBuilder()
    .端点("https://<resource>.communication.azure.com")
    .credential(credential)
    .buildClient();
```

### Proactive 令牌 Refresh (Long-lived Clients)

```java
import com.azure.communication.common.CommunicationTokenRefreshOptions;
import java.util.concurrent.Callable;

// 令牌 refresher callback - called when 令牌 is about to expire
Callable<String> tokenRefresher = () -> {
    // Call your server to get a fresh 令牌
    return fetchNewTokenFromServer();
};

// With proactive refresh
CommunicationTokenRefreshOptions refreshOptions = new CommunicationTokenRefreshOptions(tokenRefresher)
    .setRefreshProactively(true)      // Refresh before expiry
    .setInitialToken(currentToken);    // Optional initial 令牌

CommunicationTokenCredential credential = new CommunicationTokenCredential(refreshOptions);
```

### Async 令牌 Refresh

```java
import java.util.concurrent.CompletableFuture;

// Async 令牌 fetcher
Callable<String> asyncRefresher = () -> {
    CompletableFuture<String> future = fetchTokenAsync();
    return future.get();  // Block until 令牌 is available
};

CommunicationTokenRefreshOptions options = new CommunicationTokenRefreshOptions(asyncRefresher)
    .setRefreshProactively(true);

CommunicationTokenCredential credential = new CommunicationTokenCredential(options);
```

## Entra ID (Azure AD) Authentication

```java
import com.azure.identity.InteractiveBrowserCredentialBuilder;
import com.azure.communication.common.EntraCommunicationTokenCredentialOptions;
import java.util.Arrays;
import java.util.List;

// For Teams Phone Extensibility
InteractiveBrowserCredential entraCredential = new InteractiveBrowserCredentialBuilder()
    .clientId("<your-client-id>")
    .tenantId("<your-tenant-id>")
    .redirectUrl("<your-redirect-uri>")
    .build();

String resourceEndpoint = "https://<resource>.communication.azure.com";
List<String> scopes = Arrays.asList(
    "https://auth.msft.communication.azure.com/TeamsExtension.ManageCalls"
);

EntraCommunicationTokenCredentialOptions entraOptions = 
    new EntraCommunicationTokenCredentialOptions(entraCredential, resourceEndpoint)
        .setScopes(scopes);

CommunicationTokenCredential credential = new CommunicationTokenCredential(entraOptions);
```

## Communication Identifiers

### CommunicationUserIdentifier

```java
import com.azure.communication.common.CommunicationUserIdentifier;

// Create identifier for ACS user
CommunicationUserIdentifier user = new CommunicationUserIdentifier("8:acs:resource-id_user-id");

// Get raw ID
String rawId = user.getId();
```

### PhoneNumberIdentifier

```java
import com.azure.communication.common.PhoneNumberIdentifier;

// E.164 format phone number
PhoneNumberIdentifier phone = new PhoneNumberIdentifier("+14255551234");

String phoneNumber = phone.getPhoneNumber();  // "+14255551234"
String rawId = phone.getRawId();              // "4:+14255551234"
```

### MicrosoftTeamsUserIdentifier

```java
import com.azure.communication.common.MicrosoftTeamsUserIdentifier;

// Teams user identifier
MicrosoftTeamsUserIdentifier teamsUser = new MicrosoftTeamsUserIdentifier("<teams-user-id>")
    .setCloudEnvironment(CommunicationCloudEnvironment.PUBLIC);

// For anonymous Teams users
MicrosoftTeamsUserIdentifier anonymousTeamsUser = new MicrosoftTeamsUserIdentifier("<teams-user-id>")
    .setAnonymous(true);
```

### UnknownIdentifier

```java
import com.azure.communication.common.UnknownIdentifier;

// For identifiers of unknown type
UnknownIdentifier unknown = new UnknownIdentifier("some-raw-id");
```

## Identifier Parsing

```java
import com.azure.communication.common.CommunicationIdentifier;
import com.azure.communication.common.CommunicationIdentifierModel;

// Parse raw ID to appropriate type
public CommunicationIdentifier parseIdentifier(String rawId) {
    if (rawId.startsWith("8:acs:")) {
        return new CommunicationUserIdentifier(rawId);
    } else if (rawId.startsWith("4:")) {
        String phone = rawId.substring(2);
        return new PhoneNumberIdentifier(phone);
    } else if (rawId.startsWith("8:orgid:")) {
        String teamsId = rawId.substring(8);
        return new MicrosoftTeamsUserIdentifier(teamsId);
    } else {
        return new UnknownIdentifier(rawId);
    }
}
```

## Type Checking Identifiers

```java
import com.azure.communication.common.CommunicationIdentifier;

public void processIdentifier(CommunicationIdentifier identifier) {
    if (identifier instanceof CommunicationUserIdentifier) {
        CommunicationUserIdentifier user = (CommunicationUserIdentifier) identifier;
        System.out.println("ACS User: " + user.getId());
        
    } else if (identifier instanceof PhoneNumberIdentifier) {
        PhoneNumberIdentifier phone = (PhoneNumberIdentifier) identifier;
        System.out.println("Phone: " + phone.getPhoneNumber());
        
    } else if (identifier instanceof MicrosoftTeamsUserIdentifier) {
        MicrosoftTeamsUserIdentifier teams = (MicrosoftTeamsUserIdentifier) identifier;
        System.out.println("Teams User: " + teams.getUserId());
        System.out.println("Anonymous: " + teams.isAnonymous());
        
    } else if (identifier instanceof UnknownIdentifier) {
        UnknownIdentifier unknown = (UnknownIdentifier) identifier;
        System.out.println("Unknown: " + unknown.getId());
    }
}
```

## 令牌 Access

```java
import com.azure.core.credential.AccessToken;

// Get current 令牌 (for debugging/logging - don't expose!)
CommunicationTokenCredential credential = new CommunicationTokenCredential(令牌);

// Sync access
AccessToken accessToken = credential.getToken();
System.out.println("令牌 expires: " + accessToken.getExpiresAt());

// Async access
credential.getTokenAsync()
    .subscribe(令牌 -> {
        System.out.println("令牌: " + 令牌.getToken().substring(0, 20) + "...");
        System.out.println("Expires: " + 令牌.getExpiresAt());
    });
```

## Dispose Credential

```java
// Clean up when done
credential.close();

// Or use try-with-资源
try (CommunicationTokenCredential cred = new CommunicationTokenCredential(options)) {
    // Use credential
    chatClient.doSomething();
}
```

## Cloud Environments

```java
import com.azure.communication.common.CommunicationCloudEnvironment;

// Available environments
CommunicationCloudEnvironment publicCloud = CommunicationCloudEnvironment.PUBLIC;
CommunicationCloudEnvironment govCloud = CommunicationCloudEnvironment.GCCH;
CommunicationCloudEnvironment dodCloud = CommunicationCloudEnvironment.DOD;

// Set on Teams identifier
MicrosoftTeamsUserIdentifier teamsUser = new MicrosoftTeamsUserIdentifier("<user-id>")
    .setCloudEnvironment(CommunicationCloudEnvironment.GCCH);
```

## 环境变量

```bash
AZURE_COMMUNICATION_ENDPOINT=https://<resource>.communication.azure.com
AZURE_COMMUNICATION_USER_TOKEN=<user-access-令牌>
```

## 最佳实践

1. **Proactive Refresh** - Always use `setRefreshProactively(true)` for long-lived clients
2. **令牌 Security** - Never log or expose full tokens
3. **Close Credentials** - Dispose of credentials when no longer needed
4. **Error Handling** - Handle 令牌 refresh failures gracefully
5. **Identifier Types** - Use specific identifier types, not raw strings

## Common Usage Patterns

```java
// Pattern: Create credential for Chat/Calling client
public ChatClient createChatClient(String 令牌, String 端点) {
    CommunicationTokenRefreshOptions refreshOptions = 
        new CommunicationTokenRefreshOptions(this::refreshToken)
            .setRefreshProactively(true)
            .setInitialToken(令牌);
    
    CommunicationTokenCredential credential = 
        new CommunicationTokenCredential(refreshOptions);
    
    return new ChatClientBuilder()
        .端点(端点)
        .credential(credential)
        .buildClient();
}

private String refreshToken() {
    // Call your 令牌 端点
    return tokenService.getNewToken();
}
```

## Trigger Phrases

- "ACS authentication", "communication 令牌 credential"
- "user access 令牌", "令牌 refresh"
- "CommunicationUserIdentifier", "PhoneNumberIdentifier"
- "Azure Communication Services authentication"

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

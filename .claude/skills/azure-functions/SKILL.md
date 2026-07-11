---
name: Azure Functions 无服务器计算开发，涵盖触发器、绑定、D
description: "Azure Functions — Azure Functions 无服务器计算开发，涵盖触发器、绑定、Durable Functions 和最佳实践。"
  worker model, Durable Functions orchestration, cold start optimization, and
  production patterns. Covers .NET, Python, and Node.js programming models.
risk: none
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# Azure Functions

Expert patterns for Azure Functions development including isolated worker model,
Durable Functions orchestration, cold start optimization, and production patterns.
Covers .NET, Python, and Node.js programming models.

## 模式

### Isolated Worker Model (.NET)

Modern .NET execution model with process isolation

**使用场景**: Building new .NET Azure Functions apps

### 模板

// Program.cs - Isolated Worker Model
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureFunctionsWorker默认s()
    .ConfigureServices(services =>
    {
        // Add Application Insights
        services.AddApplicationInsightsTelemetryWorkerService();
        services.ConfigureFunctionsApplicationInsights();

        // Add HttpClientFactory (prevents socket exhaustion)
        services.AddHttpClient();

        // Add your services
        services.AddSingleton<IMyService, MyService>();
    })
    .Build();

host.Run();

// HttpTriggerFunction.cs
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

public class HttpTriggerFunction
{
    private readonly ILogger<HttpTriggerFunction> _logger;
    private readonly IMyService _service;

    public HttpTriggerFunction(
        ILogger<HttpTriggerFunction> logger,
        IMyService service)
    {
        _logger = logger;
        _service = service;
    }

    [Function("HttpTrigger")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequestData req)
    {
        _logger.LogInformation("Processing 请求");

        try
        {
            var result = await _service.ProcessAsync(req);

            var 响应 = req.CreateResponse(Http状态Code.OK);
            await 响应.WriteAsJsonAsync(result);
            return 响应;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing 请求");
            var 响应 = req.CreateResponse(Http状态Code.InternalServerError);
            await 响应.WriteAsJsonAsync(new { error = "Internal server error" });
            return 响应;
        }
    }
}

### 备注

- In-process model deprecated November 2026
- Isolated worker supports .NET 8, 9, 10, and .NET Framework
- Full dependency injection support
- Custom middleware support

### Node.js v4 编程模型

Modern code-centric 方法 for TypeScript/JavaScript

**使用场景**: Building Node.js Azure Functions

### 模板

// src/functions/httpTrigger.ts
import { app, HttpRequest, HttpResponseInit, Invocation上下文 } from "@azure/functions";

export async function httpTrigger(
  请求: HttpRequest,
  context: Invocation上下文
): Promise<HttpResponseInit> {
  context.log(`Http function processed 请求 for url "${请求.url}"`);

  try {
    const name = 请求.查询.get("name") || (await 请求.text()) || "world";

    return {
      status: 200,
      jsonBody: { message: `Hello, ${name}!` }
    };
  } catch (error) {
    context.error("Error processing 请求:", error);
    return {
      status: 500,
      jsonBody: { error: "Internal server error" }
    };
  }
}

// Register function with app object
app.http("httpTrigger", {
  methods: ["GET", "POST"],
  authLevel: "function",
  handler: httpTrigger
});

// Timer trigger example
app.timer("timerTrigger", {
  schedule: "0 */5 * * * *",  // Every 5 minutes
  handler: async (myTimer, context) => {
    context.log("Timer function executed at:", new Date().toISOString());
  }
});

// Blob trigger example
app.storageBlob("blobTrigger", {
  path: "samples-workitems/{name}",
  connection: "AzureWebJobsStorage",
  handler: async (blob, context) => {
    context.log(`Blob trigger processing: ${context.triggerMetadata.name}`);
    context.log(`Blob size: ${blob.length} bytes`);
  }
});

### 备注

- v4 model is code-centric, no function.json files
- Uses app object similar to Express.js
- TypeScript first-class support
- All triggers registered in code

### Python v2 编程模型

Decorator-based 方法 for Python functions

**使用场景**: Building Python Azure Functions

### 模板

# function_app.py
import azure.functions as func
import logging
import json

app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)

@app.route(route="hello", methods=["GET", "POST"])
async def http_trigger(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Python HTTP trigger function processed a 请求.")

    try:
        name = req.params.get("name")
        if not name:
            try:
                req_body = req.get_json()
                name = req_body.get("name")
            except ValueError:
                pass

        if name:
            return func.HttpResponse(
                json.dumps({"message": f"Hello, {name}!"}),
                mimetype="application/json"
            )
        else:
            return func.HttpResponse(
                json.dumps({"message": "Hello, World!"}),
                mimetype="application/json"
            )
    except Exception as e:
        logging.error(f"Error processing 请求: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": "Internal server error"}),
            status_code=500,
            mimetype="application/json"
        )

@app.timer_trigger(schedule="0 */5 * * * *", arg_name="myTimer")
def timer_trigger(myTimer: func.TimerRequest) -> None:
    logging.info("Timer trigger executed")

@app.blob_trigger(arg_name="myblob", path="samples-workitems/{name}",
                  connection="AzureWebJobsStorage")
def blob_trigger(myblob: func.InputStream):
    logging.info(f"Blob trigger: {myblob.name}, Size: {myblob.length} bytes")

@app.queue_trigger(arg_name="msg", queue_name="myqueue",
                   connection="AzureWebJobsStorage")
def queue_trigger(msg: func.QueueMessage) -> None:
    logging.info(f"Queue message: {msg.get_body().decode('utf-8')}")

### 备注

- v2 model uses decorators, no function.json files
- Python runs out-of-process (always isolated)
- Linux-based hosting required for Python
- Async functions supported

### Durable Functions - Function Chaining

Sequential execution with state persistence

**使用场景**: Need sequential 工作流 with automatic retry

### 模板

// C# Isolated Worker - Function Chaining
using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask;
using Microsoft.DurableTask.Client;

public class OrderWorkflow
{
    [Function("OrderOrchestrator")]
    public static async Task<OrderResult> RunOrchestrator(
        [OrchestrationTrigger] TaskOrchestration上下文 context)
    {
        var order = context.GetInput<Order>();

        // Functions execute sequentially, state persisted between each
        var validated = await context.CallActivityAsync<ValidatedOrder>(
            "ValidateOrder", order);

        var payment = await context.CallActivityAsync<PaymentResult>(
            "ProcessPayment", validated);

        var shipped = await context.CallActivityAsync<ShippingResult>(
            "ShipOrder", new ShipRequest { Order = validated, Payment = payment });

        var notification = await context.CallActivityAsync<bool>(
            "SendNotification", shipped);

        return new OrderResult
        {
            OrderId = order.Id,
            状态 = "Completed",
            TrackingNumber = shipped.TrackingNumber
        };
    }

    [Function("ValidateOrder")]
    public static async Task<ValidatedOrder> ValidateOrder(
        [ActivityTrigger] Order order, Function上下文 context)
    {
        var logger = context.GetLogger<OrderWorkflow>();
        logger.LogInformation("Validating order {OrderId}", order.Id);

        // Validation logic...
        return new ValidatedOrder { /* ... */ };
    }

    [Function("ProcessPayment")]
    public static async Task<PaymentResult> ProcessPayment(
        [ActivityTrigger] ValidatedOrder order, Function上下文 context)
    {
        // Payment processing with built-in retry...
        return new PaymentResult { /* ... */ };
    }

    [Function("OrderWorkflow_HttpStart")]
    public static async Task<HttpResponseData> HttpStart(
        [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
        [DurableClient] DurableTaskClient client,
        Function上下文 context)
    {
        var order = await req.ReadFromJsonAsync<Order>();
        string instanceId = await client.ScheduleNewOrchestrationInstanceAsync(
            "OrderOrchestrator", order);

        return client.CreateCheck状态响应(req, instanceId);
    }
}

### 备注

- State automatically persisted between activities
- Automatic retry on transient failures
- Survives process restarts
- Built-in status 端点 for monitoring

### Durable Functions - Fan-Out/Fan-In

Parallel execution with result aggregation

**使用场景**: Processing multiple items in parallel

### 模板

// C# Isolated Worker - Fan-Out/Fan-In
using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask;

public class ParallelProcessing
{
    [Function("ProcessImagesOrchestrator")]
    public static async Task<ProcessingResult> RunOrchestrator(
        [OrchestrationTrigger] TaskOrchestration上下文 context)
    {
        var images = context.GetInput<List<string>>();

        // Fan-out: Start all tasks in parallel
        var tasks = images.Select(image =>
            context.CallActivityAsync<ImageResult>("ProcessImage", image));

        // Fan-in: Wait for all tasks to complete
        var results = await Task.WhenAll(tasks);

        // Aggregate results
        var successful = results.Count(r => r.Success);
        var failed = results.Count(r => !r.Success);

        return new ProcessingResult
        {
            TotalProcessed = results.Length,
            Successful = successful,
            Failed = failed,
            Results = results.ToList()
        };
    }

    [Function("ProcessImage")]
    public static async Task<ImageResult> ProcessImage(
        [ActivityTrigger] string imageUrl, Function上下文 context)
    {
        var logger = context.GetLogger<ParallelProcessing>();
        logger.LogInformation("Processing image: {Url}", imageUrl);

        try
        {
            // Image processing logic...
            await Task.Delay(1000); // Simulated work

            return new ImageResult
            {
                Url = imageUrl,
                Success = true,
                ProcessedUrl = $"processed-{imageUrl}"
            };
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to process {Url}", imageUrl);
            return new ImageResult { Url = imageUrl, Success = false };
        }
    }

    // Python equivalent
    // @app.orchestration_trigger(context_name="context")
    // def process_images_orchestrator(context: df.DurableOrchestration上下文):
    //     images = context.get_input()
    //
    //     # Fan-out: Create parallel tasks
    //     tasks = [context.call_activity("ProcessImage", img) for img in images]
    //
    //     # Fan-in: Wait for all
    //     results = yield context.task_all(tasks)
    //
    //     return {"processed": len(results), "results": results}
}

### 备注

- Parallel execution for independent tasks
- Results aggregated when all complete
- Memory efficient - only stores task IDs
- Up to thousands of parallel activities

### 冷启动优化

Minimize cold start latency in production

**使用场景**: Need fast 响应 times in production

### 模板

// 1. Use Premium Plan with pre-warmed instances
// host.json
{
  "version": "2.0",
  "extensions": {
    "durableTask": {
      "hubName": "MyTaskHub"
    }
  },
  "functionTimeout": "00:30:00"
}

// 2. Add warmup trigger (Premium Plan)
[Function("Warmup")]
public static void Warmup(
    [WarmupTrigger] object warmup上下文,
    Function上下文 context)
{
    var logger = context.GetLogger("Warmup");
    logger.LogInformation("Warmup trigger executed - initializing dependencies");

    // Pre-initialize expensive 资源
    // Database connections, HttpClients, etc.
}

// 3. Use static/singleton clients with DI
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        // HttpClientFactory prevents socket exhaustion
        services.AddHttpClient<IMyApiClient, MyApiClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.example.com");
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        // Singleton for expensive initialization
        services.AddSingleton<IExpensiveService>(sp =>
        {
            // Initialize once, reuse across invocations
            return new ExpensiveService();
        });
    }
}

// 4. Reduce package size
// .csproj - exclude unnecessary dependencies
<PropertyGroup>
  <PublishTrimmed>true</PublishTrimmed>
  <TrimMode>partial</TrimMode>
</PropertyGroup>

// 5. Run from package deployment
// Azure CLI
// az functionapp deployment source config-zip \
//   --resource-group myResourceGroup \
//   --name myFunctionApp \
//   --src myapp.zip \
//   --build-remote true

### 备注

- Cold starts improved ~53% across all regions/languages
- Premium Plan provides pre-warmed instances
- Warmup trigger initializes before traffic
- Package deployment can reduce cold start

### 带错误处理的队列触发器

Reliable message processing with poison queue

**使用场景**: Processing messages from Azure Storage Queue

### 模板

// C# Isolated Worker - Queue Trigger
using Microsoft.Azure.Functions.Worker;

public class QueueProcessor
{
    private readonly ILogger<QueueProcessor> _logger;
    private readonly IMyService _service;

    public QueueProcessor(ILogger<QueueProcessor> logger, IMyService service)
    {
        _logger = logger;
        _service = service;
    }

    [Function("ProcessQueueMessage")]
    public async Task Run(
        [QueueTrigger("myqueue-items", Connection = "AzureWebJobsStorage")]
        QueueMessage message)
    {
        _logger.LogInformation("Processing message: {Id}", message.MessageId);

        try
        {
            var payload = JsonSerializer.Deserialize<MyPayload>(message.Body);
            await _service.ProcessAsync(payload);

            _logger.LogInformation("Message processed successfully: {Id}", message.MessageId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message: {Id}", message.MessageId);

            // Message will be retried up to maxDequeueCount (default 5)
            // Then moved to poison queue: myqueue-items-poison
            throw;
        }
    }

    // 可选: Monitor poison queue
    [Function("ProcessPoisonQueue")]
    public async Task ProcessPoison(
        [QueueTrigger("myqueue-items-poison", Connection = "AzureWebJobsStorage")]
        QueueMessage message)
    {
        _logger.LogWarning("Processing poison message: {Id}", message.MessageId);

        // Log to monitoring, alert, or store for manual review
        await _service.HandlePoisonMessageAsync(message);
    }
}

// host.json - Queue configuration
// {
//   "version": "2.0",
//   "extensions": {
//     "queues": {
//       "maxPollingInterval": "00:00:02",
//       "visibilityTimeout": "00:00:30",
//       "batchSize": 16,
//       "maxDequeueCount": 5,
//       "newBatchThreshold": 8
//     }
//   }
// }

### 备注

- Messages retried up to maxDequeueCount times
- Failed messages moved to poison queue
- Configure visibilityTimeout for processing time
- batchSize controls parallel processing

### 带长任务模式的 HTTP 触发器

Handle work exceeding 230-second HTTP limit

**使用场景**: HTTP 请求 triggers long-running work

### 模板

// Async HTTP pattern - return immediately, poll for status
[Function("StartLongRunning")]
public static async Task<HttpResponseData> StartLongRunning(
    [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
    [DurableClient] DurableTaskClient client,
    Function上下文 context)
{
    var input = await req.ReadFromJsonAsync<WorkRequest>();

    // Start orchestration (returns immediately)
    string instanceId = await client.ScheduleNewOrchestrationInstanceAsync(
        "LongRunningOrchestrator", input);

    // Return status URLs for polling
    return client.CreateCheck状态响应(req, instanceId);
}

// 响应 includes:
// {
//   "id": "abc123",
//   "statusQueryGetUri": "https://.../instances/abc123",
//   "sendEventPostUri": "https://.../instances/abc123/raiseEvent/{eventName}",
//   "terminatePostUri": "https://.../instances/abc123/terminate"
// }

// Alternative: Queue-based pattern without Durable Functions
[Function("StartWork")]
[QueueOutput("work-queue")]
public static async Task<WorkItem> StartWork(
    [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
    Function上下文 context)
{
    var input = await req.ReadFromJsonAsync<WorkRequest>();
    var workId = Guid.NewGuid().ToString();

    // Queue the work, return immediately
    var workItem = new WorkItem
    {
        Id = workId,
        请求 = input
    };

    // Return work ID for status checking
    var 响应 = req.CreateResponse(Http状态Code.Accepted);
    await 响应.WriteAsJsonAsync(new
    {
        workId = workId,
        statusUrl = $"/api/status/{workId}"
    });

    return workItem;
}

[Function("ProcessWork")]
public static async Task ProcessWork(
    [QueueTrigger("work-queue")] WorkItem work,
    Function上下文 context)
{
    // Long-running processing here
    // Update status in storage for polling
}

### 备注

- HTTP timeout is 230 seconds regardless of plan
- Use Durable Functions for async patterns
- Return immediately with status 端点
- Client polls for completion

## 尖锐边缘

### HTTP 超时无论计划类型均为 230 秒

Severity: HIGH

Situation: HTTP-triggered functions with long processing time

Symptoms:
504 Gateway Timeout after ~4 minutes.
请求 terminates before function completes.
Client receives timeout even though function continues.
host.json timeout setting has no effect for HTTP.

Why this breaks:
The Azure Load Balancer has a hard-coded 230-second idle timeout for HTTP
requests. This applies regardless of your function app timeout setting.

Even if you set functionTimeout to 30 minutes in host.json, HTTP triggers
will timeout after 230 seconds from the client's perspective.

The function may continue running after timeout, but the client won't
receive the 响应.

Recommended fix:

## Use async pattern with Durable Functions

```csharp
[Function("StartLongProcess")]
public static async Task<HttpResponseData> Start(
    [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
    [DurableClient] DurableTaskClient client)
{
    var input = await req.ReadFromJsonAsync<WorkRequest>();

    // Start orchestration, returns immediately
    string instanceId = await client.ScheduleNewOrchestrationInstanceAsync(
        "LongRunningOrchestrator", input);

    // Returns status URLs for polling
    return client.CreateCheckStatusResponse(req, instanceId);
}

// Client polls statusQueryGetUri until complete
```

## Use queue-based async pattern

```csharp
[Function("StartWork")]
public static async Task<HttpResponseData> StartWork(
    [HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequestData req,
    [QueueOutput("work-queue")] out WorkItem workItem)
{
    var workId = Guid.NewGuid().ToString();

    workItem = new WorkItem { Id = workId, /* ... */ };

    var 响应 = req.CreateResponse(HttpStatusCode.Accepted);
    await 响应.WriteAsJsonAsync(new {
        id = workId,
        statusUrl = $"/api/status/{workId}"
    });
    return 响应;
}
```

## Use webhook callback pattern

```csharp
// Client provides callback URL
// Function queues work, returns 202 Accepted
// When done, POST result to callback URL
```

### HttpClient 实例化导致套接字耗尽

Severity: HIGH

Situation: Creating HttpClient instances inside function code

Symptoms:
SocketException: "Unable to connect to remote server"
"An attempt was made to access a socket in a way forbidden"
Sporadic connection failures under load.
Works locally but fails in production.

Why this breaks:
Creating a new HttpClient for each 请求 creates a new socket connection.
Sockets linger in TIME_WAIT state for 240 seconds after closing.

In a serverless environment with high throughput, you quickly exhaust
available sockets. This affects all network clients, not just HttpClient.

Azure Functions shares network 资源 among multiple customers,
making this even more critical.

Recommended fix:

## Use IHttpClientFactory (Recommended)

```csharp
// Program.cs
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddHttpClient<IMyApiClient, MyApiClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.example.com");
            client.Timeout = TimeSpan.FromSeconds(30);
        });
    })
    .Build();

// MyApiClient.cs
public class MyApiClient : IMyApiClient
{
    private readonly HttpClient _client;

    public MyApiClient(HttpClient client)
    {
        _client = client;  // Injected, managed by factory
    }

    public async Task<string> GetDataAsync()
    {
        return await _client.GetStringAsync("/data");
    }
}
```

## Use static client (Alternative)

```csharp
public static class MyFunction
{
    // Static HttpClient, reused across invocations
    private static readonly HttpClient _httpClient = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(30)
    };

    [Function("MyFunction")]
    public static async Task Run(...)
    {
        var result = await _httpClient.GetAsync("...");
    }
}
```

## Same pattern for Azure SDK clients

```csharp
// Also applies to:
// - BlobServiceClient
// - CosmosClient
// - ServiceBusClient
// Use DI or static instances
```

### 阻塞异步调用导致线程饥饿

Severity: HIGH

Situation: Using .Result, .Wait(), or Thread.Sleep in async code

Symptoms:
Deadlocks under load.
Requests hang indefinitely.
"A task was canceled" exceptions.
Works with low concurrency, fails with high.

Why this breaks:
Azure Functions thread pool is limited. Blocking calls (.Result, .Wait())
hold a thread hostage while waiting, preventing other work.

Thread.Sleep blocks a thread that could be handling other requests.

With multiple concurrent executions, you quickly run out of threads,
causing deadlocks and timeouts.

Recommended fix:

## 始终 use async/await

```csharp
// BAD - blocks thread
var result = httpClient.GetAsync(url).Result;
someTask.Wait();
Thread.Sleep(5000);

// GOOD - yields thread
var result = await httpClient.GetAsync(url);
await someTask;
await Task.Delay(5000);
```

## Fix synchronous method calls

```csharp
// BAD - sync over async
public void ProcessData()
{
    var data = GetDataAsync().Result;  // Blocks!
}

// GOOD - async all the way
public async Task ProcessDataAsync()
{
    var data = await GetDataAsync();
}
```

## Configure async in console/startup

```csharp
// If you must call async from sync context
public static void Main(string[] args)
{
    // Use GetAwaiter().GetResult() at entry point only
    MainAsync(args).GetAwaiter().GetResult();
}

private static async Task MainAsync(string[] args)
{
    // Async code here
}
```

### 消费计划 10 分钟超时限制

Severity: MEDIUM

Situation: Running long processes on Consumption plan

Symptoms:
Function terminates after 10 minutes.
"Function timed out" in logs.
Incomplete processing with no error caught.
Works in development (with longer timeout) but fails in production.

Why this breaks:
Consumption plan has a hard limit of 10 minutes execution time.
默认 is 5 minutes if not configured.

This cannot be increased beyond 10 minutes on Consumption plan.
Long-running work requires Premium plan or different architecture.

Recommended fix:

## Configure maximum timeout (Consumption)

```json
// host.json
{
  "version": "2.0",
  "functionTimeout": "00:10:00"  // Max for Consumption
}
```

## Upgrade to Premium plan for longer timeouts

```json
// Premium plan - 30 min default, unbounded available
{
  "version": "2.0",
  "functionTimeout": "00:30:00"  // Or remove for unbounded
}
```

## Use Durable Functions for long workflows

```csharp
[Function("LongWorkflowOrchestrator")]
public static async Task<string> RunOrchestrator(
    [OrchestrationTrigger] TaskOrchestrationContext context)
{
    // Each activity has its own timeout
    // 工作流 can run for days
    await context.CallActivityAsync("Step1", input);
    await context.CallActivityAsync("Step2", input);
    await context.CallActivityAsync("Step3", input);
    return "Complete";
}
```

## Break work into smaller chunks

```csharp
// Queue-based chunking
[Function("ProcessChunk")]
[QueueOutput("work-queue")]
public static IEnumerable<WorkChunk> ProcessChunk(
    [QueueTrigger("work-queue")] WorkChunk chunk)
{
    var results = Process(chunk);

    // Queue next chunks if more work
    if (chunk.HasMore)
    {
        yield return chunk.Next();
    }
}
```

### .NET 进程内模型将于 2026 年 11 月弃用

Severity: HIGH

Situation: Creating new .NET functions or maintaining existing

Symptoms:
Using in-process model in new projects.
Dependency conflicts with host runtime.
Cannot use latest .NET versions.
Future migration burden.

Why this breaks:
The in-process model runs your code in the same process as the
Azure Functions host. This causes:
- Assembly version conflicts
- Limited to LTS .NET versions
- No access to latest .NET features
- Tighter coupling with host runtime

Support ends November 10, 2026. After this date, in-process apps
may stop working or receive no security updates.

Recommended fix:

## Use isolated worker for new projects

```bash
# Create new isolated worker project
func init MyFunctionApp --worker-runtime dotnet-isolated

# Or with .NET 8
dotnet new func --name MyFunctionApp --framework net8.0
```

## Migrate existing in-process to isolated

```csharp
// OLD - In-process (FunctionName attribute)
public class InProcessFunction
{
    [FunctionName("MyFunction")]
    public async Task<IActionResult> Run(
        [HttpTrigger] HttpRequest req,
        ILogger log)
    {
        log.LogInformation("Processing");
        return new OkResult();
    }
}

// NEW - Isolated worker (Function attribute)
public class IsolatedFunction
{
    private readonly ILogger<IsolatedFunction> _logger;

    public IsolatedFunction(ILogger<IsolatedFunction> logger)
    {
        _logger = logger;
    }

    [Function("MyFunction")]
    public async Task<HttpResponseData> Run(
        [HttpTrigger(AuthorizationLevel.Function, "get")]
        HttpRequestData req)
    {
        _logger.LogInformation("Processing");
        return req.CreateResponse(HttpStatusCode.OK);
    }
}
```

## Key migration changes
- FunctionName → Function attribute
- HttpRequest → HttpRequestData
- IActionResult → HttpResponseData
- ILogger injection → constructor injection
- Add Program.cs with HostBuilder

### ILogger 未输出到控制台或 AppInsights

Severity: MEDIUM

Situation: Using dependency-injected ILogger in isolated worker

Symptoms:
Logs not appearing in local console.
Logs not appearing in Application Insights.
Logs work with context.GetLogger() but not injected ILogger.
Must pass logger through all method calls.

Why this breaks:
In isolated worker model, the dependency-injected ILogger may not
be properly connected to the Azure Functions logging pipeline.

Local development especially affected - logs may go nowhere.
Application Insights requires explicit configuration.

The ILogger from Function上下文 works differently than
the injected ILogger<T>.

Recommended fix:

## Configure Application Insights properly

```csharp
// Program.cs
var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        // Add App Insights telemetry
        services.AddApplicationInsightsTelemetryWorkerService();
        services.ConfigureFunctionsApplicationInsights();
    })
    .Build();
```

## Configure logging levels

```json
// host.json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "请求"
      }
    },
    "logLevel": {
      "default": "Information",
      "Host.Results": "Error",
      "Function": "Information",
      "Host.Aggregator": "Trace"
    }
  }
}
```

## Use context.GetLogger for reliability

```csharp
[Function("MyFunction")]
public async Task Run(
    [HttpTrigger] HttpRequestData req,
    FunctionContext context)
{
    // This logger always works
    var logger = context.GetLogger<MyFunction>();
    logger.LogInformation("Processing 请求");
}
```

## Local development - check local.settings.json

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=..."
  }
}
```

### Missing Extension Packages Cause Silent Failures

Severity: MEDIUM

Situation: Using triggers/bindings without installing extensions

Symptoms:
Function not triggering on events.
"No job functions found" warning.
Bindings not working despite correct configuration.
Works after adding extension package.

Why this breaks:
Azure Functions v2+ uses extension bundles for triggers and bindings.
If extensions aren't properly configured or packages aren't installed,
the function host can't recognize the bindings.

In isolated worker, you need explicit NuGet packages.
In in-process, you need Microsoft.Azure.WebJobs.Extensions.*.

Recommended fix:

## Check extension bundle (most common)

```json
// host.json - Extension bundles handle most cases
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

## Install explicit packages for isolated worker

```xml
<!-- .csproj - Isolated worker packages -->
<PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.20.0" />
<PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.16.0" />

<!-- Storage triggers/bindings -->
<PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Storage" Version="6.2.0" />

<!-- Service Bus -->
<PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.ServiceBus" Version="5.14.0" />

<!-- Cosmos DB -->
<PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.CosmosDB" Version="4.6.0" />

<!-- Durable Functions -->
<PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.DurableTask" Version="1.1.0" />
```

## Verify function registration

```bash
# Check registered functions
func host start --verbose

# Look for:
# "Found the following functions:"
# If empty, check extensions and attributes
```

### Premium Plan Still Has Cold Start on New Instances

Severity: MEDIUM

Situation: Using Premium plan expecting zero cold start

Symptoms:
Still experiencing cold starts despite Premium plan.
First 请求 to new instance is slow.
Latency spikes during scale-out events.
Pre-warmed instances not being used.

Why this breaks:
Premium plan provides pre-warmed instances, but:
- Only one pre-warmed instance by default
- Rapid scale-out still creates cold instances
- Pre-warmed instances still run YOUR code initialization
- Warmup trigger runs, but your code may still be slow

Pre-warmed means the runtime is ready, not your application.

Recommended fix:

## Add warmup trigger to initialize your code

```csharp
[Function("Warmup")]
public void Warmup(
    [WarmupTrigger] object warmupContext,
    FunctionContext context)
{
    var logger = context.GetLogger("Warmup");
    logger.LogInformation("Warmup trigger fired");

    // Initialize expensive 资源
    _cosmosClient.GetContainer("db", "container");
    _httpClient.GetAsync("https://api.example.com/health").Wait();
}
```

## Configure pre-warmed instance count

```bash
# Increase pre-warmed instances (costs more)
az functionapp config set \
  --name <app-name> \
  --resource-group <rg> \
  --prewarmed-instance-count 3
```

## Optimize application initialization

```csharp
// Lazy initialize heavy 资源
private static readonly Lazy<ExpensiveClient> _client =
    new Lazy<ExpensiveClient>(() => new ExpensiveClient());

// Connection pooling
services.AddDbContext<MyDbContext>(options =>
    options.UseSqlServer(connectionString, sql =>
        sql.MinPoolSize(5)));
```

## Use always-ready instances (most expensive)

```bash
# Instances always running, no cold start
az functionapp config set \
  --name <app-name> \
  --resource-group <rg> \
  --minimum-elastic-instance-count 2
```

## 验证检查

### Hardcoded Connection String

Severity: ERROR

Connection strings must never be hardcoded

Message: Hardcoded connection string. Use Key Vault or App Settings.

### Hardcoded API Key in Code

Severity: ERROR

API keys should use Key Vault or App Settings

Message: Hardcoded API key. Use Key Vault or environment variables.

### Anonymous Authorization Level in Production

Severity: WARNING

Anonymous endpoints should be protected by other means

Message: Anonymous authorization. Ensure protected by API Management or other auth.

### Blocking .Result Call

Severity: ERROR

Using .Result blocks threads and causes deadlocks

Message: Blocking .Result call. Use await instead.

### Blocking .Wait() Call

Severity: ERROR

Using .Wait() blocks threads

Message: Blocking .Wait() call. Use await instead.

### Thread.Sleep 用法

Severity: ERROR

Thread.Sleep blocks threads

Message: Thread.Sleep blocks threads. Use await Task.Delay() instead.

### New HttpClient Instance

Severity: WARNING

Creating HttpClient per 请求 causes socket exhaustion

Message: New HttpClient per 请求. Use IHttpClientFactory or static client.

### HttpClient in Using Statement

Severity: WARNING

Disposing HttpClient causes socket exhaustion

Message: HttpClient in using statement. Use IHttpClientFactory for proper lifecycle.

### In-Process FunctionName Attribute

Severity: INFO

In-process model deprecated November 2026

Message: In-process FunctionName attribute. 考虑 migrating to isolated worker.

### Missing Function Attribute

Severity: WARNING

Isolated worker requires [Function] attribute

Message: HttpTrigger without [Function] attribute (isolated worker requires it).

## 协作

### Delegation Triggers

- user needs AWS serverless -> aws-serverless (Lambda, API Gateway, SAM)
- user needs GCP serverless -> gcp-cloud-run (Cloud Run, Cloud Functions)
- user needs container-based deployment -> gcp-cloud-run (Azure Container Apps or Cloud Run)
- user needs database design -> postgres-wizard (Azure SQL, Cosmos DB data modeling)
- user needs authentication -> auth-specialist (Azure AD, Easy Auth, managed identity)
- user needs complex orchestration -> 工作流-automation (Logic Apps, Power Automate)

## 使用场景
- User mentions or implies: azure function
- User mentions or implies: azure functions
- User mentions or implies: durable functions
- User mentions or implies: azure serverless
- User mentions or implies: function app

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

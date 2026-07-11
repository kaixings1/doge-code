---
name: Azure Maps Search .NET SDK 相关功能和最佳实
description: "Azure Maps Search .NET — Azure Maps Search .NET SDK 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# Azure Maps (.NET)

Azure Maps SDK for .NET providing location-based services: geocoding, routing, rendering, geolocation, and weather.

## 安装

```bash
# Search (geocoding, reverse geocoding)
dotnet add package Azure.Maps.Search --prerelease

# Routing (directions, route matrix)
dotnet add package Azure.Maps.Routing --prerelease

# Rendering (map tiles, static images)
dotnet add package Azure.Maps.Rendering --prerelease

# Geolocation (IP to location)
dotnet add package Azure.Maps.Geolocation --prerelease

# Weather
dotnet add package Azure.Maps.Weather --prerelease

# Resource Management (account management, SAS tokens)
dotnet add package Azure.ResourceManager.Maps --prerelease

# Required for authentication
dotnet add package Azure.Identity
```

**Current Versions**:
- `Azure.Maps.Search`: v2.0.0-beta.5
- `Azure.Maps.Routing`: v1.0.0-beta.4
- `Azure.Maps.Rendering`: v2.0.0-beta.1
- `Azure.Maps.Geolocation`: v1.0.0-beta.3
- `Azure.ResourceManager.Maps`: v1.1.0-beta.2

## 环境变量

```bash
AZURE_MAPS_SUBSCRIPTION_KEY=<your-subscription-key>
AZURE_MAPS_CLIENT_ID=<your-client-id>  # For Entra ID auth
```

## 认证

### Subscription Key (Shared Key)

```csharp
using Azure;
using Azure.Maps.Search;

var subscriptionKey = Environment.GetEnvironmentVariable("AZURE_MAPS_SUBSCRIPTION_KEY");
var credential = new AzureKeyCredential(subscriptionKey);

var client = new MapsSearchClient(credential);
```

### Microsoft Entra ID (Recommended for Production)

```csharp
using Azure.Identity;
using Azure.Maps.Search;

var credential = new DefaultAzureCredential();
var clientId = Environment.GetEnvironmentVariable("AZURE_MAPS_CLIENT_ID");

var client = new MapsSearchClient(credential, clientId);
```

### Shared Access Signature (SAS)

```csharp
using Azure;
using Azure.Core;
using Azure.Identity;
using Azure.ResourceManager;
using Azure.ResourceManager.Maps;
using Azure.ResourceManager.Maps.Models;
using Azure.Maps.Search;

// Authenticate with Azure Resource Manager
ArmClient armClient = new ArmClient(new DefaultAzureCredential());

// Get Maps account resource
ResourceIdentifier mapsAccountResourceId = MapsAccountResource.CreateResourceIdentifier(
    subscriptionId, resourceGroupName, accountName);
MapsAccountResource mapsAccount = armClient.GetMapsAccountResource(mapsAccountResourceId);

// Generate SAS 令牌
MapsAccountSasContent sasContent = new MapsAccountSasContent(
    MapsSigningKey.PrimaryKey, 
    principalId, 
    maxRatePerSecond: 500, 
    start: DateTime.UtcNow.ToString("O"), 
    expiry: DateTime.UtcNow.AddDays(1).ToString("O"));

响应<MapsAccountSasToken> sas = mapsAccount.GetSas(sasContent);

// Create client with SAS 令牌
var sasCredential = new AzureSasCredential(sas.Value.AccountSasToken);
var client = new MapsSearchClient(sasCredential);
```

## 客户端层次结构

```
Azure.Maps.Search
└── MapsSearchClient
    ├── GetGeocoding()                    → Geocode addresses
    ├── GetGeocodingBatch()               → Batch geocoding
    ├── GetReverseGeocoding()             → Coordinates to address
    ├── GetReverseGeocodingBatch()        → Batch reverse geocoding
    └── GetPolygon()                      → Get boundary polygons

Azure.Maps.Routing
└── MapsRoutingClient
    ├── GetDirections()                   → Route directions
    ├── GetImmediateRouteMatrix()         → Route matrix (sync, ≤100)
    ├── GetRouteMatrix()                  → Route matrix (async, ≤700)
    └── GetRouteRange()                   → Isochrone/reachable range

Azure.Maps.Rendering
└── MapsRenderingClient
    ├── GetMapTile()                      → Map tiles
    ├── GetMapStaticImage()               → Static map images
    └── GetCopyrightCaption()             → Copyright info

Azure.Maps.Geolocation
└── MapsGeolocationClient
    └── GetCountryCode()                  → IP to country/region

Azure.Maps.Weather
└── MapsWeatherClient
    ├── GetCurrentWeatherConditions()     → Current weather
    ├── GetDailyForecast()                → Daily forecast
    ├── GetHourlyForecast()               → Hourly forecast
    └── GetSevereWeatherAlerts()          → Weather alerts
```

## 核心工作流

### 1. Geocoding (Address to Coordinates)

```csharp
using Azure;
using Azure.Maps.Search;

var credential = new AzureKeyCredential(subscriptionKey);
var client = new MapsSearchClient(credential);

响应<GeocodingResponse> result = client.GetGeocoding("1 Microsoft Way, Redmond, WA 98052");

foreach (var feature in result.Value.Features)
{
    Console.WriteLine($"Coordinates: {string.Join(",", feature.Geometry.Coordinates)}");
    Console.WriteLine($"Address: {feature.Properties.Address.FormattedAddress}");
    Console.WriteLine($"Confidence: {feature.Properties.Confidence}");
}
```

### 2. Batch Geocoding

```csharp
using Azure.Maps.Search.Models.Queries;

List<GeocodingQuery> queries = new List<GeocodingQuery>
{
    new GeocodingQuery() { 查询 = "400 Broad St, Seattle, WA" },
    new GeocodingQuery() { 查询 = "1 Microsoft Way, Redmond, WA" },
    new GeocodingQuery() { AddressLine = "Space Needle", Top = 1 },
};

响应<GeocodingBatchResponse> results = client.GetGeocodingBatch(queries);

foreach (var batchItem in results.Value.BatchItems)
{
    foreach (var feature in batchItem.Features)
    {
        Console.WriteLine($"Coordinates: {string.Join(",", feature.Geometry.Coordinates)}");
    }
}
```

### 3. Reverse Geocoding (Coordinates to Address)

```csharp
using Azure.Core.GeoJson;

GeoPosition coordinates = new GeoPosition(-122.138685, 47.6305637);
响应<GeocodingResponse> result = client.GetReverseGeocoding(coordinates);

foreach (var feature in result.Value.Features)
{
    Console.WriteLine($"Address: {feature.Properties.Address.FormattedAddress}");
    Console.WriteLine($"Locality: {feature.Properties.Address.Locality}");
}
```

### 4. Get Boundary Polygon

```csharp
using Azure.Maps.Search.Models;

GetPolygonOptions options = new GetPolygonOptions()
{
    Coordinates = new GeoPosition(-122.204141, 47.61256),
    ResultType = BoundaryResultTypeEnum.Locality,
    Resolution = ResolutionEnum.Small,
};

响应<Boundary> result = client.GetPolygon(options);

Console.WriteLine($"Boundary copyright: {result.Value.Properties?.Copyright}");
Console.WriteLine($"Polygon count: {result.Value.Geometry.Count}");
```

### 5. Route Directions

```csharp
using Azure;
using Azure.Core.GeoJson;
using Azure.Maps.Routing;
using Azure.Maps.Routing.Models;

var client = new MapsRoutingClient(new AzureKeyCredential(subscriptionKey));

List<GeoPosition> routePoints = new List<GeoPosition>()
{
    new GeoPosition(-122.34, 47.61),  // Seattle
    new GeoPosition(-122.13, 47.64)   // Redmond
};

RouteDirectionQuery 查询 = new RouteDirectionQuery(routePoints);
响应<RouteDirections> result = client.GetDirections(查询);

foreach (var route in result.Value.Routes)
{
    Console.WriteLine($"Distance: {route.Summary.LengthInMeters} meters");
    Console.WriteLine($"Duration: {route.Summary.TravelTimeDuration}");
    
    foreach (RouteLeg leg in route.Legs)
    {
        Console.WriteLine($"Leg points: {leg.Points.Count}");
    }
}
```

### 6. Route Directions with Options

```csharp
RouteDirectionOptions options = new RouteDirectionOptions()
{
    RouteType = RouteType.Fastest,
    UseTrafficData = true,
    TravelMode = TravelMode.Bicycle,
    Language = RoutingLanguage.EnglishUsa,
    InstructionsType = RouteInstructionsType.Text,
};

RouteDirectionQuery 查询 = new RouteDirectionQuery(routePoints)
{
    RouteDirectionOptions = options
};

响应<RouteDirections> result = client.GetDirections(查询);
```

### 7. Route Matrix

```csharp
RouteMatrixQuery routeMatrixQuery = new RouteMatrixQuery
{
    Origins = new List<GeoPosition>()
    {
        new GeoPosition(-122.34, 47.61),
        new GeoPosition(-122.13, 47.64)
    },
    Destinations = new List<GeoPosition>() 
    { 
        new GeoPosition(-122.20, 47.62),
        new GeoPosition(-122.40, 47.65)
    },
};

// Synchronous (up to 100 route combinations)
响应<RouteMatrixResult> result = client.GetImmediateRouteMatrix(routeMatrixQuery);

foreach (var cell in result.Value.Matrix.SelectMany(row => row))
{
    Console.WriteLine($"Distance: {cell.响应?.RouteSummary?.LengthInMeters}");
    Console.WriteLine($"Duration: {cell.响应?.RouteSummary?.TravelTimeDuration}");
}

// Asynchronous (up to 700 route combinations)
RouteMatrixOptions routeMatrixOptions = new RouteMatrixOptions(routeMatrixQuery)
{
    TravelTimeType = TravelTimeType.All,
};
GetRouteMatrixOperation asyncResult = client.GetRouteMatrix(WaitUntil.Completed, routeMatrixOptions);
```

### 8. Route Range (Isochrone)

```csharp
RouteRangeOptions options = new RouteRangeOptions(-122.34, 47.61)
{
    TimeBudget = new TimeSpan(0, 20, 0)  // 20 minutes
};

响应<RouteRangeResult> result = client.GetRouteRange(options);

// result.Value.ReachableRange contains the polygon
Console.WriteLine($"Boundary points: {result.Value.ReachableRange.Boundary.Count}");
```

### 9. Get Map Tiles

```csharp
using Azure;
using Azure.Maps.Rendering;

var client = new MapsRenderingClient(new AzureKeyCredential(subscriptionKey));

int zoom = 10;
int tileSize = 256;

// Convert coordinates to tile index
MapTileIndex tileIndex = MapsRenderingClient.PositionToTileXY(
    new GeoPosition(13.3854, 52.517), zoom, tileSize);

// Fetch map tile
GetMapTileOptions options = new GetMapTileOptions(
    MapTileSetId.MicrosoftImagery,
    new MapTileIndex(tileIndex.X, tileIndex.Y, zoom)
);

响应<Stream> mapTile = client.GetMapTile(options);

// Save to file
using (FileStream fileStream = File.Create("./MapTile.png"))
{
    mapTile.Value.CopyTo(fileStream);
}
```

### 10. IP Geolocation

```csharp
using System.Net;
using Azure;
using Azure.Maps.Geolocation;

var client = new MapsGeolocationClient(new AzureKeyCredential(subscriptionKey));

IPAddress ipAddress = IPAddress.Parse("2001:4898:80e8:b::189");
响应<CountryRegionResult> result = client.GetCountryCode(ipAddress);

Console.WriteLine($"Country ISO Code: {result.Value.IsoCode}");
```

### 11. Current Weather

```csharp
using Azure;
using Azure.Core.GeoJson;
using Azure.Maps.Weather;

var client = new MapsWeatherClient(new AzureKeyCredential(subscriptionKey));

var position = new GeoPosition(-122.13071, 47.64011);
var options = new GetCurrentWeatherConditionsOptions(position);

响应<CurrentConditionsResult> result = client.GetCurrentWeatherConditions(options);

foreach (var condition in result.Value.Results)
{
    Console.WriteLine($"Temperature: {condition.Temperature.Value} {condition.Temperature.Unit}");
    Console.WriteLine($"Weather: {condition.Phrase}");
    Console.WriteLine($"Humidity: {condition.RelativeHumidity}%");
}
```

## 关键类型参考

### Search Package

| Type | Purpose |
|------|---------|
| `MapsSearchClient` | Main client for search operations |
| `GeocodingResponse` | Geocoding result |
| `GeocodingBatchResponse` | Batch geocoding result |
| `GeocodingQuery` | 查询 for batch geocoding |
| `ReverseGeocodingQuery` | 查询 for batch reverse geocoding |
| `GetPolygonOptions` | Options for polygon retrieval |
| `Boundary` | Boundary polygon result |
| `BoundaryResultTypeEnum` | Boundary type (Locality, AdminDistrict, etc.) |
| `ResolutionEnum` | Polygon resolution (Small, Medium, Large) |

### Routing Package

| Type | Purpose |
|------|---------|
| `MapsRoutingClient` | Main client for routing operations |
| `RouteDirectionQuery` | 查询 for route directions |
| `RouteDirectionOptions` | Route calculation options |
| `RouteDirections` | Route directions result |
| `RouteLeg` | Segment of a route |
| `RouteMatrixQuery` | 查询 for route matrix |
| `RouteMatrixResult` | Route matrix result |
| `RouteRangeOptions` | Options for isochrone |
| `RouteRangeResult` | Isochrone result |
| `RouteType` | Route type (Fastest, Shortest, Eco, Thrilling) |
| `TravelMode` | Travel mode (Car, Truck, Bicycle, Pedestrian) |

### Rendering Package

| Type | Purpose |
|------|---------|
| `MapsRenderingClient` | Main client for rendering |
| `GetMapTileOptions` | Map tile options |
| `MapTileIndex` | Tile coordinates (X, Y, Zoom) |
| `MapTileSetId` | Tile set identifier |

### Common Types

| Type | Purpose |
|------|---------|
| `GeoPosition` | Geographic position (longitude, latitude) |
| `GeoBoundingBox` | Bounding box for geographic area |

## 最佳实践

1. **Use Entra ID for production** — 优先 over subscription keys
2. **Batch operations** — Use batch geocoding for multiple addresses
3. **Cache results** — Geocoding results don't change frequently
4. **Use appropriate tile sizes** — 256 or 512 pixels based on display
5. **Handle rate limits** — Implement exponential backoff
6. **Use async route matrix** — For large matrix calculations (>100)
7. **考虑 traffic data** — Set `UseTrafficData = true` for accurate ETAs

## 错误处理

```csharp
try
{
    响应<GeocodingResponse> result = client.GetGeocoding(address);
}
catch (RequestFailedException ex)
{
    Console.WriteLine($"Status: {ex.Status}");
    Console.WriteLine($"Error: {ex.Message}");
    
    switch (ex.Status)
    {
        case 400:
            // Invalid 请求 parameters
            break;
        case 401:
            // Authentication failed
            break;
        case 429:
            // Rate limited - implement backoff
            break;
    }
}
```

## 相关 SDKs

| SDK | Purpose | Install |
|-----|---------|---------|
| `Azure.Maps.Search` | Geocoding, search | `dotnet add package Azure.Maps.Search --prerelease` |
| `Azure.Maps.Routing` | Directions, matrix | `dotnet add package Azure.Maps.Routing --prerelease` |
| `Azure.Maps.Rendering` | Map tiles, images | `dotnet add package Azure.Maps.Rendering --prerelease` |
| `Azure.Maps.Geolocation` | IP geolocation | `dotnet add package Azure.Maps.Geolocation --prerelease` |
| `Azure.Maps.Weather` | Weather data | `dotnet add package Azure.Maps.Weather --prerelease` |
| `Azure.ResourceManager.Maps` | Account management | `dotnet add package Azure.ResourceManager.Maps --prerelease` |

## 参考链接

| Resource | URL |
|----------|-----|
| Azure Maps Documentation | https://learn.microsoft.com/azure/azure-maps/ |
| Search API Reference | https://learn.microsoft.com/dotnet/api/azure.maps.search |
| Routing API Reference | https://learn.microsoft.com/dotnet/api/azure.maps.routing |
| GitHub Source | https://github.com/Azure/azure-sdk-for-net/tree/main/sdk/maps |
| Pricing | https://azure.microsoft.com/pricing/details/azure-maps/ |

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。

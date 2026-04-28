import { feature } from 'bun:bundle';
import Anthropic from '@anthropic-ai/sdk';
import type { ClientOptions } from '@anthropic-ai/sdk/client';
import * as vertexSdk from '@anthropic-ai/vertex-sdk';
import type AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
import { getSmallFastModel, getAWSRegion, getVertexRegionForModel } from '../../utils/envUtils.js';
import {
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  checkAndRefreshOAuthTokenIfNeeded,
} from '../../utils/auth.js';
import { readCustomApiStorage } from '../../utils/customApiStorage.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { logForDebugging } from '../../utils/debug.js';
import { getSmallFastModel } from '../../utils/model/model.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from '../../utils/model/providers.js'
import { getProxyFetchOptions } from '../../utils/proxy.js';
import { getSessionId } from '../../bootstrap/state.js';
import { loadGoogleAuthLibrary } from '../../utils/googleAuthLibrary.js';
import { refreshGcpCredentialsIfNeeded } from '../../utils/auth.js';
import { refreshAndGetAwsCredentials } from '../../utils/auth.js';
import { getGlobalConfig } from '../../utils/config.js';
import { OAuthService } from '../oauth/index.js';

const USER_AGENT = 'claude-code/1.0';

function getUserAgent(): string {
  return USER_AGENT;
}

function getOauthConfig() {
  const config = getGlobalConfig();
  return config.oauthConfig || { BASE_API_URL: 'https://api.anthropic.com' };
}

const isDebugToStdErr = () => process.env.DEBUG === 'true' || process.env.DEBUG === 'stderr';

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string;
  maxRetries: number;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
}): Promise<Anthropic> {
  const customApiProvider =
    readCustomApiStorage().provider ?? getGlobalCompatProvider();
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID;
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP;
  const customHeaders = getCustomHeaders();
  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': getUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
    ...customHeaders,
    ...(containerId ? { 'x-claude-remote-container-id': containerId } : {}),
    ...(remoteSessionId
      ? { 'x-claude-remote-session-id': remoteSessionId }
      : {}),
    // SDK consumers can identify their app/library for backend analytics
    ...(clientApp ? { 'x-client-app': clientApp } : {}),
  };

  // Log API client configuration for HFI debugging
  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders['Authorization']}`,
  );

  // Add additional protection header if enabled via env var
  const additionalProtectionEnabled = isEnvTruthy(
    process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION,
  );
  if (additionalProtectionEnabled) {
    defaultHeaders['x-anthropic-additional-protection'] = 'true';
  }

  logForDebugging('[API:auth] OAuth token check starting');
  await checkAndRefreshOAuthTokenIfNeeded();
  logForDebugging('[API:auth] OAuth token check complete');

  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession());
  }

  const resolvedFetch = buildFetch(fetchOverride, source);

  const ARGS = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true,
    }) as ClientOptions['fetchOptions'],
    ...(resolvedFetch && {
      fetch: resolvedFetch,
    }),
  };
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
    // Use region override for small fast model if specified
    const awsRegion =
      model === getSmallFastModel() &&
      process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        : getAWSRegion();

    const bedrockArgs: ConstructorParameters<typeof AnthropicBedrock>[0] = {
      ...ARGS,
      awsRegion,
      ...(isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
        skipAuth: true,
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };

    // Add API key authentication if available
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      bedrockArgs.skipAuth = true;
      // Add the Bearer token for Bedrock API key authentication
      bedrockArgs.defaultHeaders = {
        ...bedrockArgs.defaultHeaders,
        Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
      };
    } else if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      // Refresh auth and get credentials with cache clearing
      const cachedCredentials = await refreshAndGetAwsCredentials();
      if (cachedCredentials) {
        bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId;
        bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey;
        bedrockArgs.awsSessionToken = cachedCredentials.sessionToken;
      }
    }
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicBedrock(bedrockArgs) as unknown as Anthropic;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk');
    // Determine Azure AD token provider based on configuration
    // SDK reads ANTHROPIC_FOUNDRY_API_KEY by default
    let azureADTokenProvider: (() => Promise<string>) | undefined;
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        // Mock token provider for testing/proxy scenarios (similar to Vertex mock GoogleAuth)
        azureADTokenProvider = () => Promise.resolve('');
      } else {
        // Use real Azure AD authentication with DefaultAzureCredential
        const {
          DefaultAzureCredential: AzureCredential,
          getBearerTokenProvider,
        } = await import('@azure/identity');
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          'https://cognitiveservices.azure.com/.default',
        );
      }
    }

    const foundryArgs: ConstructorParameters<typeof AnthropicFoundry>[0] = {
      ...ARGS,
      ...(azureADTokenProvider && { azureADTokenProvider }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicFoundry(foundryArgs) as unknown as Anthropic;
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    // Refresh GCP credentials if gcpAuthRefresh is configured and credentials are expired
    // This is similar to how we handle AWS credential refresh for Bedrock
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded();
    }

    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      loadGoogleAuthLibrary(),
    ]);

    // In Vertex AI, project-id can be set by env var.
    // google-auth-library reads GOOGLE_APPLICATION_CREDENTIALS and project
    // env vars directly — no need to pass projectId in most cases.
    // However, caching needs careful handling of:
    // - Credential refresh/expiration
    // - Environment variable changes (GOOGLE_APPLICATION_CREDENTIALS, project vars)
    // - Cross-request auth state management
    // See: https://github.com/googleapis/google-auth-library-nodejs/issues/390 for caching challenges

    // Prevent metadata server timeout by providing projectId as fallback
    // google-auth-library checks project ID in this order:
    // 1. Environment variables (GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, etc.)
    // 2. Credential files (service account JSON, ADC file)
    // 3. gcloud config
    // 4. GCE metadata server (causes 12s timeout outside GCP)
    //
    // We only set projectId if user hasn't configured other discovery methods
    // to avoid interfering with their existing auth setup

    // Check project environment variables in same order as google-auth-library
    // See: https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts
    const hasProjectEnvVar =
      process.env['GCLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['gcloud_project'] ||
      process.env['google_cloud_project'];

    // Check for credential file paths (service account or ADC)
    // Note: We're checking both standard and lowercase variants to be safe,
    // though we should verify what google-auth-library actually checks
    const hasKeyFile =
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
      process.env['google_application_credentials'];

    const googleAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
      ? ({
          // Mock GoogleAuth for testing/proxy scenarios
          getClient: () => ({
            getRequestHeaders: () => ({}),
          }),
        } as VertexGoogleAuth)
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          // Only use ANTHROPIC_VERTEX_PROJECT_ID as last resort fallback
          // This prevents the 12-second metadata server timeout when:
          // - No project env vars are set AND
          // - No credential keyfile is specified AND
          // - ADC file exists but lacks project_id field
          //
          // Risk: If auth project != API target project, this could cause billing/audit issues
          // Mitigation: Users can set GOOGLE_CLOUD_PROJECT to override
          ...(hasProjectEnvVar || hasKeyFile
            ? {}
            : {
                projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
              }),
        });

    const vertexArgs: ConstructorParameters<typeof AnthropicVertex>[0] = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth,
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };
    // we have always been lying about the return type - this doesn't support batching or models
    return new AnthropicVertex(vertexArgs) as unknown as Anthropic;
  }

  // Determine authentication method based on available tokens
  const effectiveBaseURL = process.env.ANTHROPIC_BASE_URL || readCustomApiStorage().baseURL || ''
  const isLocalEndpoint = /127\.0\.0\.1|localhost/i.test(effectiveBaseURL)

  const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: isClaudeAISubscriber()
      ? isLocalEndpoint
        ? 'sk-ant-local-dev-placeholder'
        : null
      : apiKey || getAnthropicApiKey(),
    authToken: isClaudeAISubscriber()
      ? getClaudeAIOAuthTokens()?.accessToken
      : undefined,
    // Set baseURL from OAuth config when using staging OAuth
    ...(process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.USE_STAGING_OAUTH)
      ? { baseURL: getOauthConfig().BASE_API_URL }
      : {}),
    ...ARGS,
    ...(isDebugToStdErr() && { logger: createStderrLogger() }),
  };

  if (customApiProvider === 'openai') {
    (clientConfig as ConstructorParameters<typeof Anthropic>[0] & {
      __openaiCompat?: boolean;
    }).__openaiCompat = true;
  }

  return new Anthropic(clientConfig);
}

function getGlobalCompatProvider(): 'anthropic' | 'openai' {
  return process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER === 'openai'
    ? 'openai'
    : 'anthropic';
}

async function configureApiKeyHeaders(
  headers: Record<string, string>,
  isNonInteractiveSession: boolean,
): Promise<void> {
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    (await getApiKeyFromApiKeyHelper(isNonInteractiveSession));
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {};
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS;

  if (!customHeadersEnv) return customHeaders;

  // Split by newlines to support multiple headers
  const headerStrings = customHeadersEnv.split(/\n|\r\n/);

  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue;

    // Parse header in format "Name: Value" (curl style). Split on first `:`
    // then trim — avoids regex backtracking on malformed long header lines.
    const colonIdx = headerString.indexOf(':');
    if (colonIdx === -1) continue;
    const name = headerString.slice(0, colonIdx).trim();
    const value = headerString.slice(colonIdx + 1).trim();
    if (name) {
      customHeaders[name] = value;
    }
  }

  return customHeaders;
}

function createStderrLogger() {
  return {
    warn: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    error: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    info: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    debug: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
  };
}
export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

function buildFetch(
  fetchOverride: ClientOptions['fetch'],
  source: string | undefined,
): ClientOptions['fetch'] {
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  const inner = fetchOverride ?? globalThis.fetch
  // Only send to the first-party API — Bedrock/Vertex/Foundry don't log it
  // and unknown headers risk rejection by strict proxies (inc-4029 class).
  const injectClientRequestId =
    getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
  return (input, init) => {
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    // Generate a client-side request ID so timeouts (which return no server
    // request ID) can still be correlated with server logs by the API team.
    // Callers that want to track the ID themselves can pre-set the header.
    if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
    }
    try {
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const url = input instanceof Request ? input.url : String(input)
      const id = headers.get(CLIENT_REQUEST_ID_HEADER)
      logForDebugging(
        `[API 请求] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}`,
      )
    } catch {
      // never let logging crash the fetch
    }
    return inner(input, { ...init, headers })
  }
}
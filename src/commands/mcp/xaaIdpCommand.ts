/**
 * `claude mcp xaa` — manage the XAA (SEP-990) IdP connection.
 *
 * The IdP connection is user-level: configure once, all XAA-enabled MCP
 * servers reuse it. Lives in settings.xaaIdp (non-secret) + a keychain slot
 * keyed by issuer (secret). Separate trust domain from per-server AS secrets.
 */
import type { Command } from '@commander-js/extra-typings'
import { cliError, cliOk } from '../../cli/exit.js'
import {
  acquireIdpIdToken,
  clearIdpClientSecret,
  clearIdpIdToken,
  getCachedIdpIdToken,
  getIdpClientSecret,
  getXaaIdpSettings,
  issuerKey,
  saveIdpClientSecret,
  saveIdpIdTokenFromJwt,
} from '../../services/mcp/xaaIdpLogin.js'
import { errorMessage } from '../../utils/errors.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export function registerMcpXaaIdpCommand(mcp: Command): void {
  const xaaIdp = mcp
    .command('xaa')
    .description('管理 XAA (SEP-990) IdP 连接')

  xaaIdp
    .command('setup')
    .description(
      '配置 IdP 连接（所有启用 XAA 的服务器的单次设置）',
    )
    .requiredOption('--issuer <url>', 'IdP 发行者 URL（OIDC 发现）')
    .requiredOption('--client-id <id>', 'Claude Code 在 IdP 的 client_id')
    .option(
      '--client-secret',
      '从 MCP_XAA_IDP_CLIENT_SECRET 环境变量读取 IdP 客户端密钥',
    )
    .option(
      '--callback-port <port>',
      '固定环回回调端口（仅当 IdP 不遵循 RFC 8252 端口任意匹配时）',
    )
    .action(options => {
      // Validate everything BEFORE any writes. An exit(1) mid-write leaves
      // settings configured but keychain missing — confusing state.
      // updateSettingsForSource doesn't schema-check on write; a non-URL
      // issuer lands on disk and then poisons the whole userSettings source
      // on next launch (SettingsSchema .url() fails → parseSettingsFile
      // returns { settings: null }, dropping everything, not just xaaIdp).
      let issuerUrl: URL
      try {
        issuerUrl = new URL(options.issuer)
      } catch {
        return cliError(
          `错误：--issuer 必须是有效的 URL（当前为 "${options.issuer}"）`,
        )
      }
      // OIDC discovery + token exchange run against this host. Allow http://
      // only for loopback (conformance harness mock IdP); anything else leaks
      // the client secret and authorization code over plaintext.
      if (
        issuerUrl.protocol !== 'https:' &&
        !(
          issuerUrl.protocol === 'http:' &&
          (issuerUrl.hostname === 'localhost' ||
            issuerUrl.hostname === '127.0.0.1' ||
            issuerUrl.hostname === '[::1]')
        )
      ) {
        return cliError(
          `错误：--issuer 必须使用 https://（当前为 "${issuerUrl.protocol}//${issuerUrl.host}"）`,
        )
      }
      const callbackPort = options.callbackPort
        ? parseInt(options.callbackPort, 10)
        : undefined
      // callbackPort <= 0 fails Zod's .positive() on next launch — same
      // settings-poisoning failure mode as the issuer check above.
      if (
        callbackPort !== undefined &&
        (!Number.isInteger(callbackPort) || callbackPort <= 0)
      ) {
        return cliError('错误：--callback-port 必须是正整数')
      }
      const secret = options.clientSecret
        ? process.env.MCP_XAA_IDP_CLIENT_SECRET
        : undefined
      if (options.clientSecret && !secret) {
        return cliError(
          '错误：--client-secret 需要设置 MCP_XAA_IDP_CLIENT_SECRET 环境变量',
        )
      }

      // Read old config now (before settings overwrite) so we can clear stale
      // keychain slots after a successful write. `clear` can't do this after
      // the fact — it reads the *current* settings.xaaIdp, which by then is
      // the new one.
      const old = getXaaIdpSettings()
      const oldIssuer = old?.issuer
      const oldClientId = old?.clientId

      // callbackPort MUST be present (even as undefined) — mergeWith deep-merges
      // and only deletes on explicit `undefined`, not on absent key. A conditional
      // spread would leak a prior fixed port into a new IdP's config.
      const { error } = updateSettingsForSource('userSettings', {
        xaaIdp: {
          issuer: options.issuer,
          clientId: options.clientId,
          callbackPort,
        },
      })
      if (error) {
        return cliError(`写入设置时出错：${error.message}`)
      }

      // Clear stale keychain slots only after settings write succeeded —
      // otherwise a write failure leaves settings pointing at oldIssuer with
      // its secret already gone. Compare via issuerKey(): trailing-slash or
      // host-case differences normalize to the same keychain slot.
      if (oldIssuer) {
        if (issuerKey(oldIssuer) !== issuerKey(options.issuer)) {
          clearIdpIdToken(oldIssuer)
          clearIdpClientSecret(oldIssuer)
        } else if (oldClientId !== options.clientId) {
          // Same issuer slot but different OAuth client registration — the
          // cached id_token's aud claim and the stored secret are both for the
          // old client. `xaa login` would send {new clientId, old secret} and
          // fail with opaque `invalid_client`; downstream SEP-990 exchange
          // would fail aud validation. Keep both when clientId is unchanged:
          // re-setup without --client-secret means "tweak port, keep secret".
          clearIdpIdToken(oldIssuer)
          clearIdpClientSecret(oldIssuer)
        }
      }

      if (secret) {
        const { success, warning } = saveIdpClientSecret(options.issuer, secret)
        if (!success) {
          return cliError(
            `错误：设置已写入但密钥链保存失败${warning ? ` — ${warning}` : ''}。` +
              `请在密钥链可用后重新运行并带上 --client-secret。`,
          )
        }
      }

      cliOk(`已为 ${options.issuer} 配置 XAA IdP 连接`)
    })

  xaaIdp
    .command('login')
    .description(
      '缓存 IdP id_token，以便启用 XAA 的 MCP 服务器静默身份验证。' +
        '默认：运行 OIDC 浏览器登录。使用 --id-token：' +
        '直接写入预获取的 JWT（用于一致性/e2e 测试，' +
        '模拟 IdP 不提供 /authorize）。',
    )
    .option(
      '--force',
      '忽略任何缓存的 id_token 并重新登录（在 IdP 端撤销后有用）',
    )
    // TODO(paulc): read the JWT from stdin instead of argv to keep it out of
    // shell history. Fine for conformance (docker exec uses argv directly,
    // no shell parser), but a real user would want `echo $TOKEN | ... --stdin`.
    .option(
      '--id-token <jwt>',
      'Write this pre-obtained id_token directly to cache, skipping the OIDC browser login',
    )
    .action(async options => {
      const idp = getXaaIdpSettings()
      if (!idp) {
        return cliError(
          "错误：没有 XAA IdP 连接。请先运行 'claude mcp xaa setup'。",
        )
      }

      // Direct-inject path: skip cache check, skip OIDC. Writing IS the
      // operation. Issuer comes from settings (single source of truth), not
      // a separate flag — one less thing to desync.
      if (options.idToken) {
        const expiresAt = saveIdpIdTokenFromJwt(idp.issuer, options.idToken)
        return cliOk(
          `id_token 已缓存到 ${idp.issuer}（过期时间 ${new Date(expiresAt).toISOString()}）`,
        )
      }

      if (options.force) {
        clearIdpIdToken(idp.issuer)
      }

      const wasCached = getCachedIdpIdToken(idp.issuer) !== undefined
      if (wasCached) {
        return cliOk(
          `已登录到 ${idp.issuer}（缓存的 id_token 仍然有效）。使用 --force 重新登录。`,
        )
      }

      process.stdout.write(`正在打开浏览器，在 ${idp.issuer} 进行登录…\n`)
      try {
        await acquireIdpIdToken({
          idpIssuer: idp.issuer,
          idpClientId: idp.clientId,
          idpClientSecret: getIdpClientSecret(idp.issuer),
          callbackPort: idp.callbackPort,
          onAuthorizationUrl: url => {
            process.stdout.write(
              `如果浏览器没有打开，请访问：\n  ${url}\n`,
            )
          },
        })
        cliOk(
          `登录成功。带有 --xaa 的 MCP 服务器现在将自动进行身份验证。`,
        )
      } catch (e) {
        cliError(`IdP 登录失败：${errorMessage(e)}`)
      }
    })

  xaaIdp
    .command('show')
    .description('显示当前 IdP 连接配置')
    .action(() => {
      const idp = getXaaIdpSettings()
      if (!idp) {
        return cliOk('未配置 XAA IdP 连接。')
      }
      const hasSecret = getIdpClientSecret(idp.issuer) !== undefined
      const hasIdToken = getCachedIdpIdToken(idp.issuer) !== undefined
      process.stdout.write(`签发者：        ${idp.issuer}\n`)
      process.stdout.write(`客户端 ID：     ${idp.clientId}\n`)
      if (idp.callbackPort !== undefined) {
        process.stdout.write(`回调端口：${idp.callbackPort}\n`)
      }
      process.stdout.write(
        `客户端密钥：${hasSecret ? '（存储在密钥链中）' : '（未设置——仅 PKCE）'}\n`,
      )
      process.stdout.write(
        `已登录：     ${hasIdToken ? '是（id_token 已缓存）' : "否——运行 'claude mcp xaa login'"}` + '\n',
      )
      cliOk()
    })

  xaaIdp
    .command('clear')
    .description('清除 IdP 连接配置和缓存的 id_token')
    .action(() => {
      // Read issuer first so we can clear the right keychain slots.
      const idp = getXaaIdpSettings()
      // updateSettingsForSource uses mergeWith: set to undefined (not delete)
      // to signal key removal.
      const { error } = updateSettingsForSource('userSettings', {
        xaaIdp: undefined,
      })
      if (error) {
        return cliError(`写入设置时出错：${error.message}`)
      }
      // Clear keychain only after settings write succeeded — otherwise a
      // write failure leaves settings pointing at the IdP with its secrets
      // already gone (same pattern as `setup`'s old-issuer cleanup).
      if (idp) {
        clearIdpIdToken(idp.issuer)
        clearIdpClientSecret(idp.issuer)
      }
      cliOk('XAA IdP 连接已清除')
    })
}

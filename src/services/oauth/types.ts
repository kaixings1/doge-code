export type OAuthTokens = {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  [key: string]: unknown
}

export type SubscriptionType = string
export type BillingType = string
export type OAuthProfileResponse = Record<string, unknown>
export type ReferralEligibilityResponse = Record<string, unknown>
export type ReferralRedemptionsResponse = Record<string, unknown>
export type ReferrerRewardInfo = Record<string, unknown>

/** OAuth token 交换响应 */
export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
  id_token?: string
  [key: string]: unknown
}

/** Rate limit 层级 */
export type RateLimitTier = string

/** 用户角色/档案响应 */
export type UserRolesResponse = {
  organization?: {
    organization_type?: string
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean
    billing_type?: string
    subscription_created_at?: string
    [key: string]: unknown
  }
  account?: {
    display_name?: string
    created_at?: string
    [key: string]: unknown
  }
  organization_role?: string
  workspace_role?: string
  organization_name?: string
  [key: string]: unknown
}

/**
 * OAuth TypeScript Types
 *
 * Type definitions for OAuth 2.0 clients, tokens, and flows
 */

import { type OAuthScope } from '@/lib/oauth/oauth-scopes'

/**
 * OAuth Client (application)
 */
export interface OAuthClient {
  id: string
  clientId: string
  // clientSecret is never returned in responses
  name: string
  description: string | null
  userId: string
  redirectUris: string[]
  grantTypes: GrantType[]
  scopes: OAuthScope[]
  isActive: boolean
  createdAt: Date | string
  updatedAt: Date | string
  lastUsedAt: Date | string | null
}

/**
 * OAuth Client with secret (only returned on creation)
 */
export interface OAuthClientWithSecret extends OAuthClient {
  clientSecret: string
}

/**
 * OAuth Token
 */
export interface OAuthToken {
  id: string
  accessToken: string
  refreshToken: string | null
  tokenType: string
  clientId: string
  userId: string
  scopes: OAuthScope[]
  expiresAt: Date | string
  refreshExpiresAt: Date | string | null
  createdAt: Date | string
  revokedAt: Date | string | null
}

/**
 * OAuth Token Response (from token endpoint)
 */
export interface OAuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  refresh_token?: string
}

/**
 * OAuth Error Response
 */
export interface OAuthErrorResponse {
  error: string
  error_description?: string
}

/**
 * OAuth Grant Types
 */
export type GrantType =
  | 'client_credentials'
  | 'authorization_code'
  | 'refresh_token'

/**
 * OAuth Token Request (client credentials flow)
 */
export interface ClientCredentialsRequest {
  grant_type: 'client_credentials'
  client_id: string
  client_secret: string
  scope?: string
}

/**
 * OAuth Token Request (authorization code flow)
 */
export interface AuthorizationCodeRequest {
  grant_type: 'authorization_code'
  code: string
  client_id: string
  client_secret: string
  redirect_uri: string
}

/**
 * OAuth Token Request (refresh token flow)
 */
export interface RefreshTokenRequest {
  grant_type: 'refresh_token'
  refresh_token: string
  client_id: string
  client_secret: string
}

/**
 * OAuth Authorization Request
 */
export interface AuthorizationRequest {
  response_type: 'code'
  client_id: string
  redirect_uri: string
  scope: string
  state: string
}

/**
 * OAuth Authorization Response
 */
export interface AuthorizationResponse {
  code: string
  state: string
}

/**
 * Create OAuth Client Params
 */
export interface CreateOAuthClientParams {
  name: string
  description?: string
  redirectUris?: string[]
  grantTypes?: GrantType[]
  scopes?: OAuthScope[]
}

/**
 * Update OAuth Client Params
 */
export interface UpdateOAuthClientParams {
  name?: string
  description?: string
  redirectUris?: string[]
  scopes?: OAuthScope[]
  isActive?: boolean
}

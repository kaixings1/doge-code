declare module 'js-cookie' {
  export interface CookieAttributes {
    expires?: number | Date
    path?: string
    domain?: string
    secure?: boolean
    sameSite?: 'strict' | 'lex' | 'none'
    httpOnly?: boolean
  }

  export interface CookiesStatic {
    get(name: string): string | undefined
    get(name: string[]): Record<string, string | undefined>
    set(
      name: string,
      value: string,
      attributes?: CookieAttributes,
    ): void
    set(
      values: Record<string, string>,
      attributes?: CookieAttributes,
    ): void
    remove(name: string, attributes?: CookieAttributes): void
  }

  const Cookies: CookiesStatic
  export default Cookies
}

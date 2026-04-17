const GOOGLE_AUTH_LIBRARY_PACKAGE = 'google-auth-library'

export class MissingGoogleAuthLibraryError extends Error {
  constructor() {
    super(
      `Vertex AI support requires the optional \`${GOOGLE_AUTH_LIBRARY_PACKAGE}\` package. Install it in the same environment as this CLI, for example: npm i -g ${GOOGLE_AUTH_LIBRARY_PACKAGE}`,
    )
    this.name = 'MissingGoogleAuthLibraryError'
  }
}

export async function loadGoogleAuthLibrary() {
  try {
    return await import(GOOGLE_AUTH_LIBRARY_PACKAGE)
  } catch (error) {
    if (isMissingGoogleAuthLibraryError(error)) {
      throw new MissingGoogleAuthLibraryError()
    }
    throw error
  }
}

function isMissingGoogleAuthLibraryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined
  return (
    (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') &&
    error.message.includes(GOOGLE_AUTH_LIBRARY_PACKAGE)
  )
}

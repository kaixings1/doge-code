import { createHash, randomBytes } from 'crypto';
function base64URLEncode(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}
export function generateCodeVerifier() {
    return base64URLEncode(randomBytes(32));
}
export function generateCodeChallenge(verifier) {
    const hash = createHash('sha256');
    hash.update(verifier);
    return base64URLEncode(hash.digest());
}
export function generateState() {
    return base64URLEncode(randomBytes(32));
}

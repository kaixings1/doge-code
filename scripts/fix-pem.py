"""Strip non-PEM preamble from a certificate file.

Windows cert exports and `openssl pkcs12 -info` prepend a header that
BoringSSL will not parse:

    Bag Attributes
        localKeyID: 01 00 00 00
        1.3.6.1.4.1.311.17.3.71: 74 00 70 00 ...
    subject=CN = api.anthropic.com
    issuer=CN = api.anthropic.com

Pointing NODE_EXTRA_CA_CERTS at a file whose path does not exist produces:

    warn: ignoring extra certs from <path>, load failed:
          error:10000002:SSL routines:OPENSSL_internal:system library

Bun then silently falls back to the bundled roots, so an intercepting proxy
chain fails to verify. This script keeps only the BEGIN/END CERTIFICATE blocks
so the file is unambiguous.

Usage:
    python scripts/fix-pem.py <src.pem> <dst.pem>
    python scripts/fix-pem.py --inplace <file.pem>
    python scripts/fix-pem.py --with-key <chain.pem> <out.pem>
"""
import re
import sys

CERT_BLOCK = re.compile(
    r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
    re.S,
)
KEY_BLOCK = re.compile(
    r"-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----"
    r".*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----",
    re.S,
)


def clean(text: str, keep_key: bool) -> bytes:
    # Normalise first: the source may already be CRLF, and .replace("\n","\r\n")
    # on CRLF text would produce "\r\r\n" (grows on every --inplace run).
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = CERT_BLOCK.findall(text)
    if not blocks:
        raise SystemExit("error: no CERTIFICATE block found")
    if keep_key:
        blocks += KEY_BLOCK.findall(text)
    # PEM is ASCII by definition; Windows tooling expects CRLF.
    return ("\n".join(blocks) + "\n").replace("\n", "\r\n").encode("ascii")


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    if "--inplace" in argv:
        if len(args) != 1:
            raise SystemExit(__doc__)
        src = dst = args[0]
    else:
        if len(args) != 2:
            raise SystemExit(__doc__)
        src, dst = args

    text = open(src, "rb").read().decode("utf-8", errors="replace")
    out = clean(text, keep_key="--with-key" in argv)
    open(dst, "wb").write(out)
    print(f"cleaned {src} -> {dst} ({len(out)} bytes)")


if __name__ == "__main__":
    main(sys.argv)

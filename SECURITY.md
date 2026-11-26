# Security

MTL's deployed service is a paper-trading sandbox. It never accepts real deposits,
private keys, or wallet signatures. The Anchor program is a separate experimental
component and has not been independently audited.

For sensitive vulnerabilities, use the repository's private GitHub vulnerability
reporting feature if enabled. Otherwise contact a maintainer privately before
publishing exploit details. Include affected version, reproduction steps, impact,
and a proposed fix when available. Do not include tokens or personal information.

Operators should use TLS, protect account creation at ingress, restrict database
and backup access, and apply dependency updates. Bearer tokens grant access to a
paper account; treat them as credentials. This version has no account recovery,
credential rotation, or revocation endpoint. Do not use it as a real-money service.

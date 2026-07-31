// Canonical JSON that reproduces Python's json.dumps(sort_keys=True, separators=(",",":")) with the
// default ensure_ascii=True, byte for byte. This MUST match the backend signer
// exactly, because the Ed25519 signature is computed over these canonical bytes: any
// divergence (key order, spacing, unicode escaping) makes a valid receipt fail to verify.
//
// Rules mirrored from CPython's json ascii encoder:
//   objects: keys sorted by code point, compact "key":value pairs, no spaces
//   strings: ", \, \b \t \n \f \r escaped; other C0 controls -> \u00xx; every char >= 0x7f -> \uXXXX
//            (astral chars emit a UTF-16 surrogate pair of \uXXXX, same as Python); '/' is NOT escaped
//   numbers: integers only (manifests carry no floats); non-finite is rejected

/** JSON-encode a string with Python-json ensure_ascii escaping. */
function escapeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0c) out += '\\f';
    else if (c === 0x0d) out += '\\r';
    else if (c < 0x20 || c > 0x7e) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += s[i];
  }
  return out + '"';
}

/** Serialize a JSON value to the canonical byte-string the backend signs over. */
export function canonicalize(v) {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(v)) throw new Error('cannot canonicalize non-finite number');
    if (!Number.isInteger(v)) {
      // Manifests contain only integers; a float would risk Python/JS repr divergence.
      throw new Error('non-integer numbers are not supported in canonical manifests');
    }
    return String(v);
  }
  if (t === 'string') return escapeString(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => escapeString(k) + ':' + canonicalize(v[k])).join(',') + '}';
  }
  throw new Error('unsupported value type in canonical JSON: ' + t);
}

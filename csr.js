'use strict';
/*
 * Apple Certificate Signing Request creator (on-device).
 * Generates a fresh RSA keypair and PKCS#10 CSR in Safari using Web Crypto.
 * It DOES NOT issue an Apple distribution certificate or provisioning profile.
 * Keys are neither uploaded nor stored by the website.
 */
(() => {
  const byId = id => document.getElementById(id);
  const button = byId('generateCsrBtn');
  if (!button) return;
  const encoder = new TextEncoder();

  function concatenate(...parts) {
    const length = parts.reduce((n, part) => n + part.byteLength, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.byteLength;
    }
    return output;
  }

  function derLength(size) {
    if (size < 128) return Uint8Array.of(size);
    const list = [];
    while (size > 0) {
      list.unshift(size & 255);
      size = Math.floor(size / 256);
    }
    return Uint8Array.from([0x80 | list.length, ...list]);
  }

  function asn1(tag, data) {
    return concatenate(Uint8Array.of(tag), derLength(data.length), data);
  }

  function rdn(oid, value, type = 0x0c) {
    const attr = asn1(0x30, concatenate(asn1(0x06, oid), asn1(type, encoder.encode(value))));
    return asn1(0x31, attr);
  }

  function pem(type, bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const b64 = btoa(binary).match(/.{1,64}/g).join('\n');
    return '-----BEGIN ' + type + '-----\n' + b64 + '\n-----END ' + type + '-----\n';
  }

  const crcTable = (() => {
    const values = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let value = i;
      for (let j = 0; j < 8; j++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      values[i] = value >>> 0;
    }
    return values;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeZipFile(files) {
    // Uncompressed ZIP (PKZIP Store). Files are kept byte-for-byte; no dependencies.
    const locals = [], central = [];
    let cursor = 0;
    for (const [filename, value] of files) {
      const name = encoder.encode(filename);
      const bytes = encoder.encode(value);
      const crc = crc32(bytes);
      const local = new Uint8Array(30);
      const lh = new DataView(local.buffer);
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(26, name.length, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, bytes.length, true);
      lh.setUint32(22, bytes.length, true);
      locals.push(local, name, bytes);
      const header = new Uint8Array(46);
      const ch = new DataView(header.buffer);
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, bytes.length, true);
      ch.setUint32(24, bytes.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, cursor, true);
      central.push(header, name);
      cursor += local.length + name.length + bytes.length;
    }
    const localData = concatenate(...locals);
    const directory = concatenate(...central);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, directory.length, true);
    view.setUint32(16, localData.length, true);
    return new Blob([localData, directory, end], {type: 'application/zip'});
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  button.addEventListener('click', async () => {
    const status = byId('csrStatus');
    const name = (byId('csrCommonName').value || '').trim();
    const email = (byId('csrEmail').value || '').trim();
    const ack = byId('csrSafetyAck').checked;

    if (!name || name.length > 100 || /[\x00-\x1f]/.test(name)) {
      status.textContent = 'Nhập tên yêu cầu từ 1 đến 100 ký tự.';
      return;
    }
    if (email && (email.length > 150 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
      status.textContent = 'Email không đúng định dạng.';
      return;
    }
    if (!ack) {
      status.textContent = 'Hãy xác nhận rằng bạn sẽ bảo vệ khóa riêng.';
      return;
    }
    if (!globalThis.isSecureContext || !globalThis.crypto || !crypto.subtle) {
      status.textContent = 'Cần Safari với HTTPS để tạo CSR trong thiết bị.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Đang tạo RSA 2048-bit trong Safari, không gửi khóa riêng lên mạng…';
    try {
      const keyPair = await crypto.subtle.generateKey(
        {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
          publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256'},
        true,
        ['sign', 'verify']
      );
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

      const commonNameOid = Uint8Array.of(0x55, 0x04, 0x03);
      const emailOid = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x01);
      const rdns = [rdn(commonNameOid, name)];
      if (email) rdns.push(rdn(emailOid, email, 0x16));

      // PKCS#10 CertificationRequestInfo: version=0, subject, SPKI, empty attributes.
      const info = asn1(0x30, concatenate(
        asn1(0x02, Uint8Array.of(0)),
        asn1(0x30, concatenate(...rdns)),
        spki,
        asn1(0xa0, new Uint8Array(0))
      ));
      const signature = new Uint8Array(await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5', keyPair.privateKey, info
      ));
      const sha256WithRsaOid = Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b);
      const algorithm = asn1(0x30, concatenate(
        asn1(0x06, sha256WithRsaOid),
        asn1(0x05, new Uint8Array(0))
      ));
      const csrDer = asn1(0x30, concatenate(
        info, algorithm, asn1(0x03, concatenate(Uint8Array.of(0), signature))
      ));
      const csr = pem('CERTIFICATE REQUEST', csrDer);
      const keyPem = pem('PRIVATE KEY', pkcs8);
      const readme =
        'ERI CERT CHECK — YÊU CẦU CHỨNG CHỈ APPLE\n\n' +
        '1. ERI_iOS.certSigningRequest: tải lên Apple Developer để yêu cầu Apple cấp chứng chỉ.\n' +
        '2. ERI_PRIVATE_KEY_SECRET.pem: KHÓA RIÊNG chưa mã hóa. Không chia sẻ hoặc tải lên web lạ.\n' +
        '3. Chỉ Apple có thể cấp .cer và .mobileprovision hợp lệ từ tài khoản có quyền.\n' +
        '4. CSR không phải chứng chỉ .p12. Tạo CSR không giúp cài IPA miễn phí ngay lập tức.\n' +
        '5. Khi đã có chứng chỉ do Apple cấp, cần kết hợp .cer với khóa riêng để xuất .p12 và tạo provisioning profile trên Apple Developer.\n';
      download(writeZipFile([
        ['ERI_iOS.certSigningRequest', csr],
        ['ERI_PRIVATE_KEY_SECRET.pem', keyPem],
        ['README_Doc_Truoc.txt', readme]
      ]), 'ERI_CSR_VA_KHOA_RIENG.zip');
      status.textContent = 'Đã tạo ZIP trong Safari. Đây là CSR và khóa riêng, CHƯA phải P12 hoặc mobileprovision hợp lệ.';
    } catch (error) {
      status.textContent = 'Không tạo được CSR: ' + (error?.message || 'Safari không hỗ trợ.');
    } finally {
      button.disabled = false;
    }
  });
})();

// Busca de dispositivos Tuya na rede local (broadcast UDP nas portas 6666, 6667 e 7000)
const dgram = require('dgram');
let MessageParser, UDP_KEY;
try {
  ({ MessageParser } = require('tuyapi/lib/message-parser'));
  ({ UDP_KEY } = require('tuyapi/lib/config'));
} catch (_) { /* tuyapi ausente */ }

function parse(msg, port) {
  const versions = port === 7000 ? ['3.5'] : port === 6666 ? ['3.1', '3.3'] : ['3.3', '3.4', '3.1'];
  for (const version of versions) {
    try {
      const p = new MessageParser({ key: UDP_KEY, version });
      const res = p.parse(msg)[0];
      let payload = res && res.payload;
      if (Buffer.isBuffer(payload)) payload = payload.toString('latin1');
      if (typeof payload === 'string') { const i = payload.indexOf('{'); if (i >= 0) payload = JSON.parse(payload.slice(i)); }
      if (payload && payload.gwId) return payload;
    } catch (_) { /* tenta a próxima versão */ }
  }
  // fallback: decifra manualmente (ignora CRC/HMAC, cobre variações de firmware)
  if (msg.length > 28 && msg.readUInt32BE(0) === 0x55aa) {
    const crypto = require('crypto');
    for (const [a, z] of [[20, 8], [20, 36], [16, 8], [16, 36]]) {
      try {
        const d = crypto.createDecipheriv('aes-128-ecb', UDP_KEY, null);
        const out = Buffer.concat([d.update(msg.subarray(a, msg.length - z)), d.final()]).toString('latin1');
        const i = out.indexOf('{'); if (i >= 0) { const j = JSON.parse(out.slice(i)); if (j.gwId) return j; }
      } catch (_) {}
    }
  }
  // fallback: JSON em texto puro
  try { const s = msg.toString('latin1'); const i = s.indexOf('{"'), j = s.lastIndexOf('}'); if (i >= 0) return JSON.parse(s.slice(i, j + 1)); } catch (_) {}
  return null;
}

function scan(seconds = 8) {
  return new Promise(resolve => {
    if (!MessageParser) return resolve([]);
    const found = new Map();
    const sockets = [];
    for (const port of [6666, 6667, 7000]) {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      s.on('error', () => {});
      s.on('message', (msg, rinfo) => {
        const p = parse(msg, port);
        if (!p || !p.gwId) return;
        found.set(p.gwId, { id: p.gwId, ip: p.ip || rinfo.address, version: String(p.version || (port === 7000 ? '3.5' : '3.3')), productKey: p.productKey, port });
      });
      try { s.bind(port); sockets.push(s); } catch (_) {}
    }
    setTimeout(() => { sockets.forEach(s => { try { s.close(); } catch (_) {} }); resolve([...found.values()]); }, seconds * 1000);
  });
}

module.exports = { scan };

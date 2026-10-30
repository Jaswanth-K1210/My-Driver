// Maestro runScript helper: simulated driver verifies the 4-digit pickup OTP + selfie handshake (starts trip -> IN_TRIP)
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';
var phone = typeof PHONE !== 'undefined' && PHONE ? PHONE : '9876543210';
var copied = typeof maestro !== 'undefined' && maestro.copiedText ? String(maestro.copiedText) : '';
var digits = copied.replace(/\D/g, '').slice(-4);

try {
  var payload = { phone: phone };
  if (digits.length === 4) {
    payload.otp = digits;
  }
  var res = http.post(bridge + '/driver-start', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  var data = json(res.body);
  if (data && data.otp) {
    output.handshakeOtp = data.otp;
  }
} catch (e) {
  console.log('driver-start bridge notice: ' + e);
}

// Maestro runScript helper: populates output.d1..output.d6 for the 6-digit login OTP
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';
var phone = typeof PHONE !== 'undefined' && PHONE ? PHONE : '9876543210';
var code = typeof OTP_CODE !== 'undefined' && OTP_CODE ? String(OTP_CODE) : '';

if (!code || code.length !== 6) {
  var response = http.get(bridge + '/otp?phone=' + encodeURIComponent(phone));
  var payload = json(response.body);
  if (!payload || !payload.otp) {
    throw new Error('Failed to fetch 6-digit OTP from companion bridge: ' + response.body);
  }
  code = String(payload.otp);
}

output.otp = code;
output.d1 = code.charAt(0);
output.d2 = code.charAt(1);
output.d3 = code.charAt(2);
output.d4 = code.charAt(3);
output.d5 = code.charAt(4);
output.d6 = code.charAt(5);

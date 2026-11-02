// Maestro runScript helper: resets local Redis OTP quota before sign-in
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';
try {
  http.post(bridge + '/reset-quota', {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
} catch (e) {
  console.log('Companion bridge not reachable on ' + bridge + ' (skipping quota reset)');
}

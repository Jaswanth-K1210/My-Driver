// Maestro runScript helper: simulated driver sends pickup GPS telemetry and triggers DRIVER_ARRIVED
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';

try {
  var res = http.post(bridge + '/driver-arrive', {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  var data = json(res.body);
  if (data && data.arrivedAt) {
    output.arrivedAt = data.arrivedAt;
  }
} catch (e) {
  console.log('driver-arrive bridge notice: ' + e);
}

// Maestro runScript helper: simulated driver completes the trip (-> COMPLETED)
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';

try {
  var res = http.post(bridge + '/driver-complete', {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  var data = json(res.body);
  if (data && data.status) {
    output.tripStatus = data.status;
  }
} catch (e) {
  console.log('driver-complete bridge notice: ' + e);
}

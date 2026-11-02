// Maestro runScript helper: simulated driver accepts the pending trip offer
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';

try {
  var res = http.post(bridge + '/driver-accept', {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  var data = json(res.body);
  if (data && data.tripId) {
    output.tripId = data.tripId;
  }
} catch (e) {
  console.log('driver-accept bridge notice: ' + e);
}

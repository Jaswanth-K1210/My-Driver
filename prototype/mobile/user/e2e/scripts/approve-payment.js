// Maestro runScript helper: puts a certified driver ONLINE at Cyber Towers and approves the customer's payment hold
var bridge = typeof BRIDGE_URL !== 'undefined' && BRIDGE_URL ? BRIDGE_URL : 'http://127.0.0.1:4099';
var phone = typeof PHONE !== 'undefined' && PHONE ? PHONE : '9876543210';

try {
  var res = http.post(bridge + '/approve-payment', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone }),
  });
  var data = json(res.body);
  if (data && data.tripId) {
    output.tripId = data.tripId;
    output.paymentId = data.paymentId;
  }
} catch (e) {
  console.log('approve-payment bridge notice: ' + e);
}

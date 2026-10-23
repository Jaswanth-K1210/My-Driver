-- Cancelling (or turning the driver away) after the driver has arrived at the
-- pickup costs a fee, paid to the driver in full for the wasted trip there.
-- Editable from the console like the other fees.
ALTER TABLE pricing_fees
  ADD COLUMN IF NOT EXISTS arrival_cancellation_fee NUMERIC(10,2) NOT NULL DEFAULT 100
    CHECK (arrival_cancellation_fee >= 0);

-- Set only on a cancellation that was charged. Such a trip also carries
-- fare_amount and driver_earnings equal to the fee, so earnings and payouts
-- count it like a completed trip (see EARNING_TRIP in trips/earning.ts).
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2);

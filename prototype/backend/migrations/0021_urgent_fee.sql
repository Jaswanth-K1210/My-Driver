-- Urgent booking: the customer pays extra for a driver in 5-10 minutes
-- instead of the usual 30. Editable from the console like the other fees.
ALTER TABLE pricing_fees
  ADD COLUMN IF NOT EXISTS urgent_fee NUMERIC(10,2) NOT NULL DEFAULT 49
    CHECK (urgent_fee >= 0);

-- The fee as priced at booking, so a console change never reprices a trip
-- already booked. NULL means a normal booking.
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS urgent_fee NUMERIC(10,2);

"use client";
import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { formatTravelDatesMessage } from "@/lib/date-range";
import { Dialog } from "./Dialog";

/**
 * A calendar for picking travel dates by click, as an alternative to typing
 * them. Confirming fills the chat composer with a plain-text message
 * ("Travel dates: YYYY-MM-DD to YYYY-MM-DD") rather than sending it or
 * patching the brief directly — the existing text parser already
 * understands that shape, and the traveller keeps a chance to review or
 * edit before sending, same as if they'd typed it.
 */
export function DateRangePicker({
  onConfirm,
  onClose,
}: {
  onConfirm: (message: string) => void;
  onClose: () => void;
}) {
  const [range, setRange] = useState<DateRange>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const message = range ? formatTravelDatesMessage(range) : undefined;

  return (
    <Dialog title="When are you travelling?" onClose={onClose}>
      <DayPicker
        mode="range"
        selected={range}
        onSelect={setRange}
        disabled={{ before: today }}
        numberOfMonths={2}
        showOutsideDays
      />
      <div className="date-picker__actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!message}
          onClick={() => {
            if (message) onConfirm(message);
            onClose();
          }}
        >
          Use these dates
        </button>
      </div>
    </Dialog>
  );
}

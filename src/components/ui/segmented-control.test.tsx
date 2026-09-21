import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl, type SegmentedOption } from "./segmented-control";

type Method = "fixed" | "from_gps";

const OPTIONS: readonly SegmentedOption<Method>[] = [
  { value: "fixed", label: "Fixed Amount" },
  { value: "from_gps", label: "Variable Amount" },
];

function Harness({ onChange }: { onChange?: (v: Method) => void }) {
  const [value, setValue] = useState<Method>("from_gps");
  return (
    <SegmentedControl
      idPrefix="ta-method"
      label="TA calculation method"
      value={value}
      onValueChange={(v) => { setValue(v); onChange?.(v); }}
      options={OPTIONS}
    />
  );
}

describe("SegmentedControl", () => {
  it("exposes the options as a labelled radio group", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "TA calculation method" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fixed Amount" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Variable Amount" })).toBeChecked();
  });

  it("selects an option when its label is clicked", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByText("Fixed Amount"));

    expect(onChange).toHaveBeenCalledWith("fixed");
    expect(screen.getByRole("radio", { name: "Fixed Amount" })).toBeChecked();
  });

  // Arrow-key navigation is Radix RovingFocusGroup behaviour; it needs real
  // focus handling, so it is not asserted here.
  it("keeps every option focusable", () => {
    render(<Harness />);
    for (const name of ["Fixed Amount", "Variable Amount"]) {
      const radio = screen.getByRole("radio", { name });
      act(() => radio.focus());
      expect(radio).toHaveFocus();
    }
  });
});

import * as React from "react";
import { Input } from "@/components/ui/input";

type BaseProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type">;

export interface NumberInputProps extends BaseProps {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  /** Value applied on blur if the field is left empty. Defaults to 0. */
  emptyValue?: number;
  allowDecimal?: boolean;
}

/**
 * Number input that stores its raw text locally, so users can freely
 * backspace/clear the field while editing. On blur, an empty field
 * commits `emptyValue` (default 0).
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, emptyValue = 0, allowDecimal = true, onBlur, onFocus, inputMode, ...rest }, ref) => {
    const numToStr = (v: number | null | undefined) =>
      v === null || v === undefined || Number.isNaN(v) ? "" : String(v);

    const [text, setText] = React.useState<string>(numToStr(value));
    const focusedRef = React.useRef(false);

    // Sync external changes only when the user isn't actively editing.
    React.useEffect(() => {
      if (!focusedRef.current) setText(numToStr(value));
    }, [value]);

    return (
      <Input
        ref={ref}
        type="number"
        inputMode={inputMode ?? (allowDecimal ? "decimal" : "numeric")}
        value={text}
        onFocus={(e) => {
          focusedRef.current = true;
          // Select all so typing replaces the value naturally.
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "" || raw === "-") return; // don't commit incomplete input
          const n = Number(raw);
          if (!Number.isNaN(n)) onValueChange(n);
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          if (text === "" || text === "-") {
            setText(numToStr(emptyValue));
            onValueChange(emptyValue);
          } else {
            const n = Number(text);
            if (Number.isNaN(n)) {
              setText(numToStr(emptyValue));
              onValueChange(emptyValue);
            } else {
              // Normalise display to the parsed number.
              setText(String(n));
              onValueChange(n);
            }
          }
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

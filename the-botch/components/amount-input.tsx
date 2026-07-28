"use client";

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { formatAmount, parseAmount } from '@/lib/utils';

type AmountInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  value: string;
  onChange: (value: string) => void;
};

export function AmountInput({ value, onChange, ...props }: AmountInputProps) {
  const displayValue = formatAmount(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseAmount(e.target.value));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      {...props}
    />
  );
}

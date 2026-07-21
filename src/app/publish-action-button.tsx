"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";

type PublishActionButtonProps = ComponentProps<"button"> & {
  pendingLabel: string;
};

export function PublishActionButton({
  children,
  disabled,
  pendingLabel,
  ...props
}: PublishActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button {...props} aria-disabled={disabled || pending} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

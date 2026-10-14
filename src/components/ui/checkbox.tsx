"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "focus-ring peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors group-has-[:focus-visible]/field-label:not-data-[state=checked]:border-input after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:aria-checked:border-(--semantic-color-text-link) data-[state=checked]:border-(--semantic-color-text-link) data-[state=checked]:bg-(--semantic-color-text-link) data-[state=checked]:text-(--semantic-color-text-on-inverse) group-has-[:focus-visible]/field-label:data-[state=checked]:border-(--semantic-color-text-link)",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

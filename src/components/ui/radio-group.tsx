"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "focus-ring group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input group-has-[:focus-visible]/field-label:not-data-[state=checked]:border-input after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:aria-checked:border-(--semantic-color-text-link) data-[state=checked]:border-(--semantic-color-text-link) data-[state=checked]:bg-(--semantic-color-text-link) data-[state=checked]:text-(--semantic-color-text-on-inverse) group-has-[:focus-visible]/field-label:data-[state=checked]:border-(--semantic-color-text-link)",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-4 items-center justify-center"
      >
        <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--semantic-color-text-on-inverse)" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }

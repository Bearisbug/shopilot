"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import * as React from "react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [shown, setShown] = React.useState(false);
  return (
    <InputGroup>
      {/* Edge 自带的明文按钮与右侧小眼睛重复，隐藏自带的 */}
      <InputGroupInput {...props} type={shown ? "text" : "password"} className={cn("[&::-ms-reveal]:hidden", className)} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={shown ? "隐藏密码" : "显示密码"} aria-pressed={shown} onClick={() => setShown((v) => !v)}>
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

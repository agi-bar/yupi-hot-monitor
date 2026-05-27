"use client";
import React from "react";
import { cn } from "../../lib/utils";

export const MovingBorder = ({
  children,
  duration = 2000,
  className,
  containerClassName,
  borderClassName,
  as: Component = "button",
  ...otherProps
}: {
  children: React.ReactNode;
  duration?: number;
  className?: string;
  containerClassName?: string;
  borderClassName?: string;
  as?: React.ElementType;
  [key: string]: unknown;
}) => {
  return (
    <Component
      className={cn(
        "relative h-auto w-auto overflow-hidden bg-transparent p-[1px] cursor-pointer",
        containerClassName
      )}
      {...otherProps}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-[inherit]",
          borderClassName
        )}
      >
        <div
          className="absolute inset-0 bg-[length:100%_100%]"
          style={{
            backgroundImage:
              "radial-gradient(circle, transparent 0%, var(--meteor-color) 50%, transparent 100%)",
            animation: `move-background ${duration}ms linear infinite`,
          }}
        />
      </div>
      <div className={cn("relative z-10 rounded-[inherit] bg-inherit", className)}>
        {children}
      </div>
    </Component>
  );
};

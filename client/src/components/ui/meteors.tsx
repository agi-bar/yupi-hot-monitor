"use client";
import { useMemo } from 'react';
import { cn } from '../../lib/utils';

function generateMeteorStyles(count: number) {
  const styles: Array<{ left: number; animationDelay: number; animationDuration: number }> = [];
  for (let i = 0; i < count; i++) {
    styles.push({
      left: Math.floor(Math.random() * (400 - -400) + -400),
      animationDelay: Math.random() * (0.8 - 0.2) + 0.2,
      animationDuration: Math.floor(Math.random() * (10 - 2) + 2),
    });
  }
  return styles;
}

export const Meteors = ({
  number = 12,
  className,
}: {
  number?: number;
  className?: string;
}) => {
  const meteorStyles = useMemo(() => generateMeteorStyles(number), [number]);

  return (
    <>
      {meteorStyles.map((meteor, idx) => (
        <span
          key={"meteor" + idx}
          className={cn(
            "animate-meteor-effect absolute h-0.5 w-0.5 rounded-full bg-slate-400 shadow-[0_0_0_1px_#ffffff10] rotate-[215deg]",
            "before:content-[''] before:absolute before:top-1/2 before:transform before:-translate-y-[50%] before:w-[50px] before:h-[1px] before:bg-gradient-to-r before:from-[#64748b] before:to-transparent",
            className
          )}
          style={{
            top: 0,
            left: meteor.left + "px",
            animationDelay: meteor.animationDelay + "s",
            animationDuration: meteor.animationDuration + "s",
          }}
        />
      ))}
    </>
  );
};

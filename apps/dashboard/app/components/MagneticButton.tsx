"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface MagneticButtonProps {
  children: React.ReactNode;
  radius?: number;
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MagneticButton({
  children,
  radius = 20,
  strength = 0.3,
  className,
  style,
}: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const animationRef = useRef<number | null>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!ref.current || animationRef.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const distance = Math.sqrt(distX * distX + distY * distY);

      if (distance < radius) {
        const pullX = (distX / distance) * (radius - distance) * strength;
        const pullY = (distY / distance) * (radius - distance) * strength;
        setPosition({ x: pullX, y: pullY });
      } else {
        setPosition({ x: 0, y: 0 });
      }
    },
    [radius, strength]
  );

  useEffect(() => {
    const handleMouseLeave = () => {
      setIsHovered(false);
      setPosition({ x: 0, y: 0 });
    };

    const container = ref.current?.parentElement;
    if (!container) return;

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [handleMouseMove]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isHovered ? "transform 0.1s ease-out" : "transform 0.3s ease-out",
      }}
      onMouseEnter={() => setIsHovered(true)}
    >
      {children}
    </div>
  );
}
import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface DropDownItemProps {
  children: React.ReactNode;
  className?: string;
}

export function DropDownItem({ children, className }: DropDownItemProps) {
  return (
    <DropdownMenu.Item
      className={`py-2 px-4 rounded-md hover:bg-gray-100 outline-none ${className}`}
    >
      {children}
    </DropdownMenu.Item>
  );
}

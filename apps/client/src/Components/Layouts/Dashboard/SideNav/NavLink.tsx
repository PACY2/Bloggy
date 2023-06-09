import React from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { IconType } from "react-icons";

export interface IElement {
  name: string;
  Icon: IconType;
  href?: string;
  elements?: IElement[];
}

function NavLink({ element }: { element: IElement }) {
  const active = useRouter().pathname === element.href;

  return (
    <li>
      <Link
        href={element.href ?? ""}
        className={`flex items-center gap-4 p-4 rounded-md hover:bg-stone-100 font-semibold tracking-wide ${
          active ? "hover:!bg-stone-700 bg-stone-800 text-white" : ""
        }`}
      >
        <element.Icon
          className={`text-xl ${active ? "fill-white" : "fill-stone-800"}`}
        />{" "}
        {element.name}
      </Link>
    </li>
  );
}

export default NavLink;

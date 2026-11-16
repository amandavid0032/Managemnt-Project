import React from "react";

/**
 * Initials, not a photo. Photo upload needs object storage, which the
 * platform does not have yet, and hot-linking arbitrary image URLs would let
 * a profile track everyone who views it.
 */
const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";

const SIZES = { xs: "h-7 w-7 text-[11px]", sm: "h-8 w-8 text-xs", md: "h-14 w-14 text-lg", lg: "h-20 w-20 text-2xl" };

const Avatar = ({ name, size = "lg" }) => (
  <div
    aria-hidden="true"
    className={`flex flex-none items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800 ${SIZES[size]}`}
  >
    {initials(name)}
  </div>
);

export default Avatar;

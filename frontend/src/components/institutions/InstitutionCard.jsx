import React, { useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaMapMarkerAlt,
  FaUniversity,
  FaLaptop,
  FaFlask,
  FaSchool,
  FaChalkboardTeacher,
} from "react-icons/fa";

/**
 * Single card for any institution category.
 *
 * Replaces the near-identical SchoolCard and CollegeCard, which differed only
 * in a prop name and a few icon cases. The visual design, carousel behaviour
 * and Tailwind classes are preserved exactly.
 */

const CATEGORY_ICONS = {
  SCHOOL: <FaSchool className="text-blue-500 mr-1" />,
  COLLEGE: <FaUniversity className="text-indigo-500 mr-1" />,
  UNIVERSITY: <FaUniversity className="text-purple-500 mr-1" />,
  POLYTECHNIC: <FaLaptop className="text-green-500 mr-1" />,
  INSTITUTE: <FaFlask className="text-red-500 mr-1" />,
  TRAINING_CENTER: <FaChalkboardTeacher className="text-orange-500 mr-1" />,
  COACHING_CENTER: <FaChalkboardTeacher className="text-teal-500 mr-1" />,
  OTHER: <FaUniversity className="text-gray-500 mr-1" />,
};

/** "TRAINING_CENTER" -> "Training Center" */
const humanizeCategory = (category) =>
  (category || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const InstitutionCard = ({ institution }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const images = institution.media ?? [];
  const hasImages = images.length > 0;
  const current = hasImages ? images[currentIndex] : null;

  const step = (e, delta) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + delta + images.length) % images.length);
  };

  // The category label falls back to the institution's local term where one
  // exists ("Gymnasium", "TAFE"), which is more meaningful than the canonical
  // enum for an international audience.
  const categoryLabel =
    institution.typeLabel || humanizeCategory(institution.category) || "Institution";

  const location = [institution.city, institution.state].filter(Boolean).join(", ");

  return (
    <div className="rounded-lg shadow-md hover:shadow-lg transition-all duration-300 bg-white overflow-hidden h-full">
      <div className="relative w-full h-48 sm:h-52 md:h-56 bg-gray-100">
        {current ? (
          <img
            src={current.url}
            alt={current.altText || institution.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          // No fake placeholder photo — an honest empty state instead.
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <FaUniversity size={32} />
            <span className="mt-2 text-xs">No image available</span>
          </div>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => step(e, -1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition"
            >
              <FaChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => step(e, 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition"
            >
              <FaChevronRight size={14} />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {images.map((img, i) => (
                <span
                  key={img.id}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i === currentIndex ? "bg-white" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
          {institution.name}
        </h3>

        {location && (
          <p className="text-gray-600 text-sm mt-1 flex items-center">
            <FaMapMarkerAlt className="text-red-500 mr-1" /> {location}
          </p>
        )}

        <p className="text-gray-700 mt-2 text-sm flex items-center">
          {CATEGORY_ICONS[institution.category] || CATEGORY_ICONS.OTHER}
          {categoryLabel}
        </p>

        {/*
          There is deliberately no rating here. The previous version displayed a
          randomly generated 3.0-5.0 score as gold stars. Ratings return with the
          Reviews module, derived from real reviews.
        */}
      </div>
    </div>
  );
};

export default InstitutionCard;

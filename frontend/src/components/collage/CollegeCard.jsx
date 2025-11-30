import React, { useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaStar,
  FaStarHalfAlt,
  FaRegStar,
  FaMapMarkerAlt,
  FaUniversity,
  FaLaptop,
  FaFlask,
  FaPaintBrush,
} from "react-icons/fa";

const CollegeCard = ({ college }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const images =
    college.imageUrls && college.imageUrls.length > 0
      ? college.imageUrls
      : ["https://via.placeholder.com/800x600?text=No+Image"];

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  // Icon based on college type
  const getTypeIcon = (type) => {
    if (!type) return <FaUniversity className="text-gray-500 mr-1" />;
    switch (type.toLowerCase()) {
      case "engineering":
        return <FaLaptop className="text-blue-500 mr-1" />;
      case "medical":
        return <FaFlask className="text-red-500 mr-1" />;
      case "arts":
        return <FaPaintBrush className="text-purple-500 mr-1" />;
      default:
        return <FaUniversity className="text-gray-500 mr-1" />;
    }
  };

  // Function to render stars
  const renderStars = (rating) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      if (rating >= i + 1) {
        stars.push(<FaStar key={i} />);
      } else if (rating > i && rating < i + 1) {
        stars.push(<FaStarHalfAlt key={i} />);
      } else {
        stars.push(<FaRegStar key={i} />);
      }
    }
    return stars;
  };

  return (
    <div className="rounded-lg shadow-md hover:shadow-lg transition-all duration-300 bg-white overflow-hidden">
      {/* Image Carousel */}
      <div className="relative w-full h-48 sm:h-52 md:h-56">
        <img
          src={images[currentIndex]}
          alt={college.name}
          className="w-full h-full object-cover"
        />
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition"
            >
              <FaChevronLeft size={14} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 transition"
            >
              <FaChevronRight size={14} />
            </button>
          </>
        )}
      </div>

      {/* College Info */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 line-clamp-1">
          {college.name}
        </h3>
        <p className="text-gray-600 text-sm mt-1 flex items-center">
          <FaMapMarkerAlt className="text-red-500 mr-1" /> {college.city},{" "}
          {college.state}
        </p>

        {/* College Type */}
        <p className="text-gray-700 mt-2 text-sm flex items-center">
          {getTypeIcon(college.type)}
          {college.type || "Unknown"}
        </p>

        {/* Rating */}
        {college.rating && (
          <div className="flex items-center mt-2 text-yellow-500">
            {renderStars(college.rating)}
            <span className="ml-2 text-gray-600 text-sm">
              {college.rating.toFixed(1)}/5
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CollegeCard;

import React, { useRef } from "react";
import { teachersData } from "../data/teachersData";
import TeacherPostCard from "./TeacherPostCard";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

const TeachersSection = () => {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    const scrollAmount = 350; // same as schools
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Teachers’ Corner</h2>
            <p className="text-gray-600 text-sm">
              Inspiring contributions from educators
            </p>
          </div>

          {/* Buttons same as Schools */}
          <div className="flex gap-2">
            <button
              onClick={() => scroll("left")}
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition"
            >
              <FaChevronLeft />
            </button>

            <button
              onClick={() => scroll("right")}
              className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition"
            >
              <FaChevronRight />
            </button>
          </div>
        </div>

        {/* Scrollable Row */}
        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
        >
          {teachersData.map((teacher) => (
            <div
              key={teacher.id}
              className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px]"
            >
              <TeacherPostCard teacher={teacher} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TeachersSection;

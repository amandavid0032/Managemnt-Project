import React, { useRef } from "react";
import { teachersData } from "../data/teachersData";
import SectionTitle from "../common/SectionTitle";
import TeacherPostCard from "./TeacherPostCard";

const TeachersSection = () => {
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    const scrollAmount = 384; // roughly one card width
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="py-10 bg-gray-50">
      <div className="container mx-auto px-6 relative">
        {/* Header with title on left and buttons on right */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-gray-800">
            Teachers’ Corner
          </h2>
          <div className="flex space-x-3">
            <button
              onClick={() => scroll("left")}
              className="px-3 py-1 bg-white border rounded-full shadow hover:bg-gray-100"
            >
              ←
            </button>
            <button
              onClick={() => scroll("right")}
              className="px-3 py-1 bg-white border rounded-full shadow hover:bg-gray-100"
            >
              →
            </button>
          </div>
        </div>

        {/* Scrollable area */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto space-x-6 scroll-smooth no-scrollbar"
        >
          {teachersData.map((t) => (
            <div key={t.id} className="flex-none w-80">
              <TeacherPostCard teacher={t} />
            </div>
          ))}
        </div>

        {/* Show more button */}
        <div className="flex justify-center mt-8">
          <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Show More
          </button>
        </div>
      </div>
    </section>
  );
};

export default TeachersSection;

import React, { useRef } from "react";
import { schoolsData } from "../data/schoolsData";
import SectionTitle from "../common/SectionTitle";
import SchoolCard from "./SchoolCard";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

const SchoolsSection = () => {
  const scrollRef = useRef(null);

  const scrollByAmount = (direction = "right") => {
    console.log("✅ Button clicked:", direction);
    const container = scrollRef.current;
    if (!container) return;

    const cardWidth = container.querySelector("div")?.offsetWidth || 350;
    const gap = 24;
    const scrollAmount = direction === "left" ? -(cardWidth + gap) : cardWidth + gap;

    container.scrollBy({
      left: scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        {/* Title + Buttons */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 text-left">Top Schools</h2>
            <p className="text-gray-600 text-left">
              Explore our leading schools across India
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => scrollByAmount("left")}
              aria-label="Previous"
              className="inline-flex items-center justify-center bg-white shadow rounded-full p-2 hover:bg-gray-100 transition"
            >
              <FaChevronLeft className="text-gray-700" />
            </button>
            <button
              onClick={() => scrollByAmount("right")}
              aria-label="Next"
              className="inline-flex items-center justify-center bg-white shadow rounded-full p-2 hover:bg-gray-100 transition"
            >
              <FaChevronRight className="text-gray-700" />
            </button>
          </div>
        </div>

        {/* Scrollable Row */}
        <div className="relative">
          <div
            ref={scrollRef}
            className="flex space-x-6 overflow-x-auto scrollbar-hide scroll-smooth"
          >
            {schoolsData && schoolsData.length > 0 ? (
              schoolsData.map((school) => (
                <div
                  key={school.id}
                  className="flex-shrink-0 w-[360px]"
                >
                  <SchoolCard school={school} />
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 w-full py-10">
                ⚠️ No school data found.
              </p>
            )}
          </div>
        </div>

        {/* Show More Button */}
        <div className="mt-8 text-center">
          <button
            onClick={() => {
              console.log("➡️ Show More clicked");
              window.location.href = "/schools";
            }}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition"
          >
            Show More
          </button>
        </div>
      </div>
    </section>
  );
};

export default SchoolsSection;

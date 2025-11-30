// StudentProjectsSection.jsx
import React, { useRef } from "react";
import { studentProjects } from "../data/schoolsData";
import StudentProjectCard from "./StudentProjectCard";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";

const StudentProjectsSection = () => {
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
            <h2 className="text-2xl font-bold text-gray-900 text-left">Student Projects</h2>
            <p className="text-gray-600 text-left">
              Discover innovative ideas and creativity from our students
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
            {studentProjects && studentProjects.length > 0 ? (
              studentProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex-shrink-0 w-[360px]"
                >
                  <StudentProjectCard project={project} />
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 w-full py-10">
                ⚠️ No project data found.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default StudentProjectsSection;

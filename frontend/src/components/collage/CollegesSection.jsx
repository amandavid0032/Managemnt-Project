import React, { useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import CollegeCard from "./CollegeCard";
import useFetchInstitutions from "../../hooks/useFetchInstitutions";

const CollegesSection = () => {
  const { data: colleges, loading, error } = useFetchInstitutions("Polytechnic");
  const scrollRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(15);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (el)
      el.scrollBy({
        left: dir === "left" ? -400 : 400,
        behavior: "smooth",
      });
  };

  const loadMore = () => {
    if (visibleCount < colleges.length) {
      setVisibleCount((prev) => prev + 15);
    } else {
      console.log("No more colleges!");
    }
  };

  const visibleColleges = colleges?.slice(0, visibleCount) || [];

  return (
    <section className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              Top Polytechnic Colleges
            </h2>
            <p className="text-gray-600 text-sm sm:text-base">
              Explore leading polytechnic institutions
            </p>
          </div>

          {/* Scroll Buttons */}
          <div className="flex gap-2 mt-4 sm:mt-0">
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

        {/* Colleges List */}
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scrollbar-hide scroll-smooth pb-4"
          >
            {visibleColleges.map((college) => (
              <div
                key={college._id}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px]"
              >
                <CollegeCard college={college} />
              </div>
            ))}

            {/* ✅ Inline "Show More" Card */}
            {colleges.length > visibleCount && (
              <div
                onClick={loadMore}
                className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] bg-blue-50 rounded-2xl shadow-md flex items-center justify-center cursor-pointer hover:bg-blue-100 transition"
              >
                <p className="text-blue-600 font-semibold">Show More →</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default CollegesSection;
